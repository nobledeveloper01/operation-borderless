import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';
import { AppError } from '../common/errors/app-error.js';
import { FetchFailure } from '../common/http/fetch-json.js';
import { crossRate, RATE_SCALE } from '../common/money/rate.js';
import { pow10 } from '../common/money/decimal.js';
import { EnvironmentVariables } from '../config/env.validation.js';
import { FIAT_OF, type Stablecoin } from '../currencies/currency.js';
import { FIXED_RATES_PER_USD } from './fixed-table.js';
import { FxSnapshotsRepository } from './fx-snapshots.repository.js';
import type { FxSnapshot, FxSource, ProviderRates } from './fx.types.js';
import { FX_PROVIDERS, type FxProvider } from './providers/fx-provider.js';
import { checkJump } from './rate-validation.js';
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

  constructor(
    @Inject(FX_PROVIDERS) private readonly providers: FxProvider[],
    private readonly snapshots: FxSnapshotsRepository,
    private readonly config: EnvironmentVariables,
    @Inject(CLOCK) private readonly now: Clock,
  ) {}

  // Startup never waits on a provider: it loads the last snapshot and refreshes in the background.
  async onModuleInit(): Promise<void> {
    this.current = await this.snapshots.latest();
    if (this.config.FX_REFRESH_ENABLED) this.schedule(0);
  }

  onModuleDestroy(): void {
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
    this.refreshing ??= this.runRefresh().finally(
      () => (this.refreshing = undefined),
    );
    return this.refreshing;
  }

  private async runRefresh(): Promise<RefreshOutcome> {
    let rateLimited = false;
    for (const [index, provider] of this.providers.entries()) {
      try {
        const rates = await provider.fetchLatest();
        await this.adopt(rates);
        if (this.isFresh(this.current)) {
          return index === 0
            ? { kind: 'primary', nextUpdateAt: rates.nextUpdateAt }
            : { kind: 'secondary' };
        }
        this.logger.warn(
          { source: provider.name, providerUpdatedAt: rates.providerUpdatedAt },
          'FX data is stale',
        );
      } catch (error) {
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
      }
    }
    if (this.config.FX_FIXED_TABLE && !this.isFresh(this.current)) {
      await this.adopt(
        {
          source: 'fixed-table',
          ratesPerUsd: FIXED_RATES_PER_USD,
          providerUpdatedAt: this.now(),
        },
        false,
      );
      this.logger.warn(
        'Both live FX sources failed, so the fixed demo table is in use',
      );
    }
    return { kind: 'failed', rateLimited };
  }

  // Saves a valid answer and makes it current only if it is newer than what is in use.
  private async adopt(rates: ProviderRates, checkMove = true): Promise<void> {
    if (checkMove) checkJump(rates, this.current);
    const saved = await this.snapshots.save(rates);
    if (
      !this.current ||
      saved.providerUpdatedAt >= this.current.providerUpdatedAt
    )
      this.current = saved;
  }

  private schedule(delayMs: number): void {
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
          this.schedule(nextRefreshDelay(outcome, this.now())),
        );
    }, delayMs);
    this.timer.unref();
  }

  private maxAgeMs(): number {
    return this.config.FX_MAX_DATA_AGE_HOURS * 3_600_000;
  }
}
