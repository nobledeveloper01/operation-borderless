import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import { setTimeout as sleep } from 'node:timers/promises';
import { FxService } from '../../src/modules/fx/fx.service.js';
import { FxRefreshJob } from '../../src/modules/jobs/fx-refresh.job.js';
import { Queues } from '../../src/modules/jobs/queues.js';
import { LedgerCheckService } from '../../src/modules/ops/ledger-check.service.js';
import { OutboxRelay } from '../../src/modules/outbox/outbox-relay.js';
import { connect } from '../support/db.js';
import { FakeProvider, primaryRates } from '../support/fx.js';
import { deposit } from '../support/money.js';
import { deliverOutbox } from '../support/outbox.js';
import { createTestApp } from '../support/test-app.js';
import { createWallet } from '../support/wallets.js';

async function until<T>(
  read: () => Promise<T>,
  done: (v: T) => boolean,
  ms = 10_000,
): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const value = await read();
    if (done(value) || Date.now() > end) return value;
    await sleep(50);
  }
}

describe('queues and scheduled jobs across instances', () => {
  let db: pg.Client;
  const apps: NestExpressApplication[] = [];
  const start = async (
    env: Record<string, string>,
    clock?: () => Date,
    providers?: FakeProvider[],
  ) => {
    const app = await createTestApp(env, {
      ...(clock ? { clock } : {}),
      ...(providers ? { fxProviders: providers } : {}),
    });
    apps.push(app);
    return app;
  };

  beforeAll(async () => {
    db = await connect();
  });

  afterAll(async () => {
    await Promise.all(apps.map((a) => a.close()));
    await db.end();
  });

  it('refreshes FX only when due, and only once when two workers race', async () => {
    const prefix = { QUEUE_PREFIX: `fx-${Date.now()}` };
    const now = new Date();
    const primary = new FakeProvider('exchangerate-api');
    const secondary = new FakeProvider('currency-api');
    primary.answer = () => primaryRates(now);
    const fetches = vi.spyOn(primary, 'fetchLatest');
    const a = await start(prefix, () => now, [primary, secondary]);
    const b = await start(prefix, () => now, [primary, secondary]);

    const results = await Promise.all(
      [a, b].map((app) => app.get(FxRefreshJob).tick()),
    );
    expect(results.sort()).toEqual(['busy', 'refreshed']);
    expect(fetches).toHaveBeenCalledTimes(1);
    expect(await a.get(FxRefreshJob).tick()).toBe('not-due');
    expect(fetches).toHaveBeenCalledTimes(1);
  });

  it('tells API instances to reload rates as soon as a worker refreshes them', async () => {
    const prefix = `reload-${Date.now()}`;
    const now = new Date();
    const primary = new FakeProvider('exchangerate-api');
    primary.answer = () => primaryRates(now);
    const worker = await start({ QUEUE_PREFIX: prefix }, () => now, [
      primary,
      new FakeProvider('currency-api'),
    ]);
    const api = await start({ QUEUE_PREFIX: prefix, APP_ROLE: 'api' });
    const reload = vi.spyOn(api.get(FxService), 'reload');
    // Give the API's subscription a moment to start before the worker publishes.
    await sleep(200);

    expect(await worker.get(FxRefreshJob).tick()).toBe('refreshed');
    await until(
      () => Promise.resolve(reload.mock.calls.length),
      (n) => n >= 1,
      3_000,
    );
    expect(reload).toHaveBeenCalled();
  });

  it('keeps one scheduler per job however many workers start, and runs each job once', async () => {
    const env = {
      QUEUE_PREFIX: `jobs-${Date.now()}`,
      JOBS_ENABLED: 'true',
      FX_REFRESH_ENABLED: 'false',
    };
    const a = await start(env);
    const b = await start(env);
    const schedulers = await until(
      () => a.get(Queues).jobs.getJobSchedulers(),
      (list) => list.length >= 3,
    );
    expect(schedulers.map((s) => s.key).sort()).toEqual([
      'idempotency-cleanup',
      'ledger-check',
      'quote-cleanup',
    ]);

    const runs = [a, b].map((app) =>
      vi.spyOn(app.get(LedgerCheckService), 'runScheduled').mockResolvedValue(),
    );
    await a.get(Queues).jobs.add('ledger-check', {});
    await until(
      () => Promise.resolve(runs.reduce((n, r) => n + r.mock.calls.length, 0)),
      (n) => n >= 1,
    );
    await sleep(500);
    expect(runs.reduce((n, r) => n + r.mock.calls.length, 0)).toBe(1);
  });

  it('delivers every event exactly once when two instances relay and deliver at the same time', async () => {
    const env = { QUEUE_PREFIX: `outbox-${Date.now()}` };
    const a = await start(env);
    const b = await start(env);
    const w = await createWallet(a);
    for (let i = 0; i < 30; i++) await deposit(a, w, 'USDx', '1').expect(201);
    await Promise.all([
      a.get(OutboxRelay).relayDue(),
      b.get(OutboxRelay).relayDue(),
    ]);
    await Promise.all([deliverOutbox(a), deliverOutbox(b)]);
    const { rows } = await db.query<{
      events: number;
      delivered: number;
      notices: number;
      maxAttempts: number;
    }>(
      `SELECT count(*)::int AS events,
              count(*) FILTER (WHERE processed_at IS NOT NULL)::int AS delivered,
              (SELECT count(*)::int FROM notifications WHERE wallet_id = $1) AS notices,
              max(attempts)::int AS "maxAttempts"
         FROM outbox_events WHERE wallet_id = $1`,
      [w.walletId],
    );
    expect(rows[0]).toEqual({
      events: 30,
      delivered: 30,
      notices: 30,
      maxAttempts: 1,
    });
  });
});
