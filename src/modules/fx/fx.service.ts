import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { CLOCK, type Clock } from '../../common/clock.js';
import { MetricsService } from '../../common/metrics/metrics.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { FetchFailure } from '../../common/http/fetch-json.js';
import { crossRate, RATE_SCALE } from '../../common/money/rate.js';
import { pow10 } from '../../common/money/decimal.js';
import { EnvironmentVariables } from '../../common/config/env.validation.js';
import { FIAT_OF, type Stablecoin } from '../../common/currencies/currency.js';
import { FIXED_RATES_PER_USD } from './fixed-table.js';
import { FxSnapshotsRepository } from './fx-snapshots.repository.js';
import type { FxSnapshot, FxSource, ProviderRates } from './fx.types.js';
import { FX_PROVIDERS, type FxProvider } from './providers/fx-provider.js';
import { movedTooFar, sourcesAgree } from './rate-validation.js';
import { nextRefreshDelay, type RefreshOutcome } from './refresh-schedule.js';

export interface PricedRate {
  rate: bigint;
  source: FxSource | 'none';
  snapshotId: string | null;
  asOf: Date | null;
}

@Injectable()
export class FxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FxService.name);
  private current: FxSnapshot | undefined;
  private refreshing: Promise<RefreshOutcome> | undefined;
  private timer: NodeJS.Timeout | undefined;
  private destroyed = false;

  constructor(
    @Inject(FX_PROVIDERS) private readonly providers: FxProvider[],
    private readonly snapshots: FxSnapshotsRepository,
    private readonly config: EnvironmentVariables,
    @Inject(CLOCK) private readonly now: Clock,
    private readonly metrics: MetricsService,
  ) {
    metrics.watch(
      'borderless_fx_rate_age_seconds',
      "Age of the rates in use, from the provider's own update time.",
      () =>
        this.current
          ? (this.now().getTime() - this.current.providerUpdatedAt.getTime()) /
            1000
          : undefined,
    );
    metrics.watch(
      'borderless_fx_rates_fresh',
      '1 when swaps and transfers can be priced, 0 when the rates are stale or missing.',
      () => (this.isFresh(this.current) ? 1 : 0),
    );
  }

  // Startup never waits on a provider: it loads the last snapshot and refreshes in the background.
  async onModuleInit(): Promise<void> {
    this.current = await this.snapshots.latest(this.config.FX_FIXED_TABLE);
    if (this.config.FX_REFRESH_ENABLED) this.schedule(0);
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    clearTimeout(this.timer);
  }

  latest(): FxSnapshot | undefined {
    return this.current;
  }

  isFresh(
    snapshot: FxSnapshot | undefined,
    now = this.now(),
  ): snapshot is FxSnapshot {
    return (
      !!snapshot &&
      now.getTime() - snapshot.providerUpdatedAt.getTime() <= this.maxAgeMs()
    );
  }

  // Prices one conversion from the stored snapshot; requests never call a provider.
  quote(from: Stablecoin, to: Stablecoin): PricedRate {
    if (from === to)
      return {
        rate: pow10(RATE_SCALE),
        source: 'none',
        snapshotId: null,
        asOf: null,
      };
    const snapshot = this.current;
    if (!this.isFresh(snapshot)) {
      throw new AppError(
        'FX_RATE_UNAVAILABLE',
        `No exchange rate from the last ${this.config.FX_MAX_DATA_AGE_HOURS} hours is available, so this conversion cannot be priced. Try again later.`,
      );
    }
    return {
      rate: this.crossFrom(snapshot, from, to),
      source: snapshot.source,
      snapshotId: snapshot.id,
      asOf: snapshot.providerUpdatedAt,
    };
  }

  crossFrom(snapshot: FxSnapshot, from: Stablecoin, to: Stablecoin): bigint {
    return from === to
      ? pow10(RATE_SCALE)
      : crossRate(
          snapshot.ratesPerUsd[FIAT_OF[from]],
          snapshot.ratesPerUsd[FIAT_OF[to]],
        );
  }

  // Tries the primary, then the secondary, then (only if allowed) the fixed table; one refresh runs at a time.
  refresh(): Promise<RefreshOutcome> {
    this.refreshing ??= this.runRefresh()
      .then((outcome) => {
        this.metrics.fxRefreshes.inc({ outcome: outcome.kind });
        return outcome;
      })
      .finally(() => (this.refreshing = undefined));
    return this.refreshing;
  }

  private async runRefresh(): Promise<RefreshOutcome> {
    const now = this.now();
    let rateLimited = false;
    // Each provider is called at most once per refresh, even when it is also needed to confirm the other.
    const answers = new Map<number, Promise<ProviderRates | Error>>();
    const answer = (index: number) => {
      if (!answers.has(index)) {
        const provider = this.providers[index]!;
        answers.set(
          index,
          provider.fetchLatest(now).catch((error: unknown) => {
            if (
              index === 0 &&
              error instanceof FetchFailure &&
              error.kind === 'rate_limited'
            )
              rateLimited = true;
            this.logger.warn(
              { source: provider.name, reason: (error as Error).message },
              'FX refresh failed',
            );
            return error instanceof Error ? error : new Error(String(error));
          }),
        );
      }
      return answers.get(index)!;
    };

    for (const [index, provider] of this.providers.entries()) {
      const rates = await answer(index);
      if (rates instanceof Error) continue;
      if (!(await this.trusted(rates, index, answer))) {
        this.logger.warn(
          { source: provider.name },
          'FX answer refused: a big move the other source does not confirm',
        );
        continue;
      }
      await this.adopt(rates);
      if (this.isFresh(this.current, now)) {
        return index === 0
          ? { kind: 'primary', nextUpdateAt: rates.nextUpdateAt }
          : { kind: 'secondary', rateLimited };
      }
      this.logger.warn(
        { source: provider.name, providerUpdatedAt: rates.providerUpdatedAt },
        'FX data is stale',
      );
    }
    if (this.config.FX_FIXED_TABLE && !this.isFresh(this.current, now)) {
      await this.adopt({
        source: 'fixed-table',
        ratesPerUsd: FIXED_RATES_PER_USD,
        providerUpdatedAt: now,
      });
      this.logger.warn(
        'Both live FX sources failed, so the fixed demo table is in use',
      );
    }
    return { kind: 'failed', rateLimited };
  }

  // An answer is trusted when it stays near the current live rates, or when the other source confirms it.
  private async trusted(
    rates: ProviderRates,
    index: number,
    answer: (index: number) => Promise<ProviderRates | Error>,
  ): Promise<boolean> {
    const reference =
      this.current?.source !== 'fixed-table' && this.isFresh(this.current)
        ? this.current
        : undefined;
    if (reference && !movedTooFar(rates, reference)) return true;
    const otherIndex = this.providers.findIndex((_, i) => i !== index);
    const other =
      otherIndex >= 0 ? await answer(otherIndex) : new Error('no other source');
    if (!(other instanceof Error)) return sourcesAgree(rates, other);
    // With no trusted reference and nothing to compare with, a single answer that passed validation is all there is.
    return !reference;
  }

  // Saves a valid answer and makes it current if it is newer, or if it replaces the fixed demo table.
  private async adopt(rates: ProviderRates): Promise<void> {
    const saved = await this.snapshots.save(rates);
    const current = this.current;
    const replacesDemo =
      current?.source === 'fixed-table' && saved.source !== 'fixed-table';
    if (
      !current ||
      replacesDemo ||
      saved.providerUpdatedAt >= current.providerUpdatedAt
    )
      this.current = saved;
  }

  private schedule(delayMs: number): void {
    // A refresh that finishes after shutdown must not start a new timer.
    if (this.destroyed) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.refresh()
        .catch((error: unknown) => {
          this.logger.error(
            { reason: (error as Error).message },
            'FX refresh crashed',
          );
          return { kind: 'failed' as const, rateLimited: false };
        })
        .then((outcome) =>
          this.schedule(
            nextRefreshDelay(outcome, this.now(), Math.random, this.staleAt()),
          ),
        );
    }, delayMs);
    this.timer.unref();
  }

  private staleAt(): Date | undefined {
    return this.current
      ? new Date(this.current.providerUpdatedAt.getTime() + this.maxAgeMs())
      : undefined;
  }

  private maxAgeMs(): number {
    return this.config.FX_MAX_DATA_AGE_HOURS * 3_600_000;
  }
}
