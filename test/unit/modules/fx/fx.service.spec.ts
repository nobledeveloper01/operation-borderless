import { randomUUID } from 'node:crypto';
import { FetchFailure } from '../../../../src/common/http/fetch-json.js';
import { validateEnv } from '../../../../src/common/config/env.validation.js';
import type { FxSnapshotsRepository } from '../../../../src/modules/fx/fx-snapshots.repository.js';
import type { MetricsService } from '../../../../src/common/metrics/metrics.service.js';
import { FxService } from '../../../../src/modules/fx/fx.service.js';
import type {
  FxSnapshot,
  ProviderRates,
} from '../../../../src/modules/fx/fx.types.js';
import {
  FakeProvider,
  primaryRates,
  secondaryRates,
} from '../../../support/fx.js';

const env = (extra: Record<string, string> = {}) =>
  validateEnv({
    DB_PASSWORD: 'x',
    PII_ENCRYPTION_KEYS: '1:bG9jYWwtcGlpLWVuY3J5cHRpb24ta2V5LXYxLTAwMDE=',
    PII_LOOKUP_KEY: 'bG9jYWwtcGlpLWxvb2t1cC1rZXktZm9yLWRldi0wMDA=',
    FX_REFRESH_ENABLED: 'false',
    ...extra,
  });

// An in-memory snapshot store with the same ordering rules as the real one.
class MemorySnapshots {
  rows: FxSnapshot[] = [];
  save(rates: ProviderRates): Promise<FxSnapshot> {
    const row = { ...rates, id: randomUUID(), fetchedAt: new Date() };
    this.rows.push(row);
    return Promise.resolve(row);
  }
  latest(includeFixed = false): Promise<FxSnapshot | undefined> {
    const rows = this.rows
      .filter((r) => includeFixed || r.source !== 'fixed-table')
      .sort(
        (a, b) =>
          Number(a.source === 'fixed-table') -
            Number(b.source === 'fixed-table') ||
          b.providerUpdatedAt.getTime() - a.providerUpdatedAt.getTime(),
      );
    return Promise.resolve(rows[0]);
  }
}

const scaled = (
  rates: ProviderRates,
  code: 'NGN',
  factor: number,
): ProviderRates => ({
  ...rates,
  ratesPerUsd: {
    ...rates.ratesPerUsd,
    [code]: (Number(rates.ratesPerUsd[code]) * factor).toFixed(12),
  },
});

// The real registry starts its own event-loop timer, which would muddle the timer checks below.
const metrics = {
  watch: () => undefined,
  fxRefreshes: { inc: () => undefined },
} as unknown as MetricsService;

describe('FxService refresh rules', () => {
  let now: Date;
  let store: MemorySnapshots;
  let primary: FakeProvider;
  let secondary: FakeProvider;
  const service = (extra: Record<string, string> = {}) =>
    new FxService(
      [primary, secondary],
      store as unknown as FxSnapshotsRepository,
      env(extra),
      () => now,
      metrics,
    );

  beforeEach(() => {
    now = new Date('2026-10-29T09:00:00Z');
    store = new MemorySnapshots();
    primary = new FakeProvider('exchangerate-api');
    secondary = new FakeProvider('currency-api');
  });

  it('lets live rates take over from the fixed table as soon as a provider recovers', async () => {
    const fx = service({ FX_FIXED_TABLE: 'true' });
    await fx.onModuleInit();
    await fx.refresh();
    expect(fx.latest()?.source).toBe('fixed-table');

    now = new Date('2026-10-29T09:15:00Z');
    primary.answer = () => primaryRates(now, 9);
    await fx.refresh();
    expect(fx.latest()?.source).toBe('exchangerate-api');
  });

  it('never loads a fixed-table snapshot after a restart with the table switched off', async () => {
    const demo = service({ FX_FIXED_TABLE: 'true' });
    await demo.onModuleInit();
    await demo.refresh();
    const restarted = service();
    await restarted.onModuleInit();
    expect(restarted.latest()).toBeUndefined();
  });

  it('accepts a real devaluation of more than 20% when both providers agree', async () => {
    const fx = service();
    await fx.onModuleInit();
    primary.answer = () => primaryRates(now);
    secondary.answer = () => secondaryRates(now);
    await fx.refresh();
    const before = fx.latest()!;

    now = new Date(now.getTime() + 86_400_000);
    primary.answer = () => scaled(primaryRates(now), 'NGN', 1.4);
    secondary.answer = () => ({
      ...scaled(secondaryRates(now), 'NGN', 1.4),
      providerUpdatedAt: new Date(now.getTime() - 3_600_000),
    });
    await fx.refresh();
    expect(Number(fx.latest()!.ratesPerUsd.NGN)).toBeCloseTo(
      Number(before.ratesPerUsd.NGN) * 1.4,
      3,
    );
  });

  it('refuses one broken feed whose big move the other provider does not confirm', async () => {
    const fx = service();
    await fx.onModuleInit();
    primary.answer = () => primaryRates(now);
    await fx.refresh();

    now = new Date(now.getTime() + 3_600_000);
    primary.answer = () => scaled(primaryRates(now), 'NGN', 10);
    secondary.answer = () => secondaryRates(now);
    await fx.refresh();
    expect(Number(fx.latest()!.ratesPerUsd.NGN)).toBeLessThan(1400);
  });

  it('does not let a broken first answer lock out good data once the sources agree again', async () => {
    const fx = service();
    await fx.onModuleInit();
    primary.answer = () => scaled(primaryRates(now), 'NGN', 0.1);
    secondary.answer = () => secondaryRates(now);
    await fx.refresh();
    // With no trusted rates yet and two sources that disagree, neither is adopted.
    expect(fx.latest()).toBeUndefined();

    primary.answer = () => primaryRates(now);
    await fx.refresh();
    expect(Number(fx.latest()!.ratesPerUsd.NGN)).toBeGreaterThan(1300);
  });

  it('accepts a single source at start-up when the other is down', async () => {
    const fx = service();
    await fx.onModuleInit();
    primary.answer = () => primaryRates(now);
    await expect(fx.refresh()).resolves.toMatchObject({ kind: 'primary' });
  });

  it('waits 30 minutes after a 429 even when the secondary answered', async () => {
    const fx = service();
    await fx.onModuleInit();
    primary.answer = new FetchFailure('rate_limited', 'slow down', 429);
    secondary.answer = () => secondaryRates(now);
    await expect(fx.refresh()).resolves.toMatchObject({
      kind: 'secondary',
      rateLimited: true,
    });
  });

  it('starts no new timer when shut down while a refresh is running', async () => {
    vi.useFakeTimers();
    try {
      const fx = service({ FX_REFRESH_ENABLED: 'true' });
      let release!: () => void;
      primary.answer = () => primaryRates(now);
      vi.spyOn(primary, 'fetchLatest').mockImplementation(
        () =>
          new Promise(
            (resolve) => (release = () => resolve(primaryRates(now))),
          ),
      );
      await fx.onModuleInit();
      await vi.advanceTimersByTimeAsync(0);
      fx.onModuleDestroy();
      release();
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
