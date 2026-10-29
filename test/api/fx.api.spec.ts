import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { AppError } from '../../src/common/errors/app-error.js';
import { FetchFailure } from '../../src/common/http/fetch-json.js';
import { FxService } from '../../src/modules/fx/fx.service.js';
import { connect } from '../support/db.js';
import { FakeProvider, primaryRates, secondaryRates } from '../support/fx.js';
import { createTestApp } from '../support/test-app.js';
import { bearer, createWallet } from '../support/wallets.js';

describe('FX rates', () => {
  let app: NestExpressApplication;
  let db: pg.Client;
  let now = new Date();
  const primary = new FakeProvider('exchangerate-api');
  const secondary = new FakeProvider('currency-api');
  const fx = () => app.get(FxService);
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp(
      {},
      { fxProviders: [primary, secondary], clock: () => now },
    );
    db = await connect();
  });

  afterAll(async () => {
    await db.end();
    await app.close();
  });

  it('TC-015 falls back to the secondary source when the primary times out', async () => {
    primary.answer = new FetchFailure('timeout', 'No answer within 3000 ms');
    secondary.answer = () => secondaryRates(now);
    await expect(fx().refresh()).resolves.toEqual({
      kind: 'secondary',
      rateLimited: false,
    });
    expect(primary.calls).toBe(1);
    const res = await http().get('/api/v1/fx/rates').expect(200);
    expect(res.body.data).toMatchObject({
      source: 'currency-api',
      isStale: false,
    });
  });

  it('TC-034 lists all 20 pairs from the primary with their refresh time and attribution', async () => {
    primary.answer = () => primaryRates(now);
    const outcome = await fx().refresh();
    expect(outcome.kind).toBe('primary');
    const res = await http().get('/api/v1/fx/rates').expect(200);
    const data = res.body.data as {
      source: string;
      isStale: boolean;
      pairs: { from: string; to: string; rate: string; refreshedAt: string }[];
      attribution: string;
    };
    expect(data).toMatchObject({ source: 'exchangerate-api', isStale: false });
    expect(data.attribution).toContain('exchangerate-api.com');
    expect(data.pairs).toHaveLength(20);
    const rate = (from: string, to: string) =>
      data.pairs.find((p) => p.from === from && p.to === to)!.rate;
    expect(rate('USDx', 'cNGN')).toBe('1346.2368880000');
    expect(rate('cNGN', 'cGHS')).toBe('0.0086462614');
    expect(rate('cXAF', 'EURx')).toBe('0.0015245041');
    for (const p of data.pairs) {
      expect(
        Math.abs(Number(p.rate) * Number(rate(p.to, p.from)) - 1),
        `${p.from}/${p.to}`,
      ).toBeLessThan(1e-6);
      expect(p.refreshedAt).toBe(
        primaryRates(now).providerUpdatedAt.toISOString(),
      );
    }
  });

  it('TC-007 values every balance in USD exactly, rounding each down', async () => {
    const wallet = await createWallet(app);
    await db.query(
      `UPDATE balances SET amount = CASE currency WHEN 'cNGN' THEN 1500000000 WHEN 'cGHS' THEN 100500000 WHEN 'USDx' THEN 10000000 ELSE 0 END
        WHERE wallet_id = $1`,
      [wallet.walletId],
    );
    const res = await http()
      .get(`/api/v1/wallets/${wallet.walletId}/balances`)
      .set(bearer(wallet.accessToken))
      .expect(200);
    const usd = Object.fromEntries(
      (res.body.data.balances as { currency: string; usdValue: string }[]).map(
        (b) => [b.currency, b.usdValue],
      ),
    );
    expect(usd).toEqual({
      cNGN: '1.114216',
      cGHS: '8.634082',
      cXAF: '0.000000',
      USDx: '10.000000',
      EURx: '0.000000',
    });
    expect(res.body.data.totalUsd).toBe('19.748298');
    expect(res.body.data.rates).toMatchObject({
      source: 'exchangerate-api',
      unavailableReason: null,
    });
  });

  it('TC-016 TC-008 refuses to price with rates past the 26-hour limit but still shows balances', async () => {
    const published = fx().latest()!.providerUpdatedAt;
    primary.answer = new FetchFailure('network', 'down');
    secondary.answer = new FetchFailure('status', 'down', 502);
    now = new Date(published.getTime() + 26 * 3_600_000 + 60_000);
    await expect(fx().refresh()).resolves.toEqual({
      kind: 'failed',
      rateLimited: false,
    });

    const rates = await http().get('/api/v1/fx/rates').expect(200);
    expect(rates.body.data).toMatchObject({
      isStale: true,
      providerUpdatedAt: published.toISOString(),
    });

    const wallet = await createWallet(app);
    const res = await http()
      .get(`/api/v1/wallets/${wallet.walletId}/balances`)
      .set(bearer(wallet.accessToken))
      .expect(200);
    expect(res.body.data.totalUsd).toBeNull();
    expect(
      res.body.data.balances.every(
        (b: { usdValue: unknown }) => b.usdValue === null,
      ),
    ).toBe(true);
    expect(res.body.data.rates.unavailableReason).toMatch(/26 hours/);

    expect(() => fx().quote('cNGN', 'USDx')).toThrow(AppError);
    expect(fx().quote('USDx', 'USDx').source).toBe('none');
  });

  it('never loads the fixed table after a restart with it switched off', async () => {
    const demo = await createTestApp(
      { FX_FIXED_TABLE: 'true' },
      { fxProviders: [primary, secondary], clock: () => now },
    );
    try {
      primary.answer = new FetchFailure('network', 'down');
      secondary.answer = new FetchFailure('network', 'down');
      now = new Date(now.getTime() + 5 * 86_400_000);
      await demo.get(FxService).refresh();
      expect(demo.get(FxService).latest()?.source).toBe('fixed-table');
    } finally {
      await demo.close();
    }
    const restarted = await createTestApp(
      {},
      { fxProviders: [primary, secondary], clock: () => now },
    );
    try {
      expect(restarted.get(FxService).latest()?.source).not.toBe('fixed-table');
    } finally {
      await restarted.close();
    }
  });

  it('uses the fixed table only when it is switched on and both live sources fail', async () => {
    const demo = await createTestApp(
      { FX_FIXED_TABLE: 'true' },
      { fxProviders: [primary, secondary], clock: () => now },
    );
    try {
      now = new Date(now.getTime() + 3 * 86_400_000);
      await demo.get(FxService).refresh();
      const res = await request(demo.getHttpServer())
        .get('/api/v1/fx/rates')
        .expect(200);
      expect(res.body.data).toMatchObject({
        source: 'fixed-table',
        isStale: false,
      });
    } finally {
      await demo.close();
    }
  });
});
