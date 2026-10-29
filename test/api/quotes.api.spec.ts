import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { FxService } from '../../src/modules/fx/fx.service.js';
import type { ProviderRates } from '../../src/modules/fx/fx.types.js';
import { connect } from '../support/db.js';
import { FakeProvider, primaryRates } from '../support/fx.js';
import { deposit, newKey, swap, transfer } from '../support/money.js';
import { createTestApp } from '../support/test-app.js';
import { bearer, createWallet, type TestWallet } from '../support/wallets.js';

// The same rates with the naira 1% weaker, a move small enough to be trusted from one source.
function weakerNaira(rates: ProviderRates): ProviderRates {
  const ngn = Number(rates.ratesPerUsd.NGN) * 1.01;
  return {
    ...rates,
    ratesPerUsd: { ...rates.ratesPerUsd, NGN: ngn.toFixed(6) },
  };
}

describe('quotes', () => {
  let app: NestExpressApplication;
  let db: pg.Client;
  let now = new Date();
  const primary = new FakeProvider('exchangerate-api');
  const secondary = new FakeProvider('currency-api');

  const quote = (w: TestWallet, body: Record<string, string>) =>
    request(app.getHttpServer())
      .post('/api/v1/quotes')
      .set(bearer(w.accessToken))
      .send(body);

  beforeAll(async () => {
    app = await createTestApp(
      { FEE_BPS: '50' },
      { fxProviders: [primary, secondary], clock: () => now },
    );
    db = await connect();
    primary.answer = () => primaryRates(now);
    await app.get(FxService).refresh();
  });

  afterAll(async () => {
    await db.end();
    await app.close();
  });

  it('holds the rate and fee: the swap pays exactly what was quoted after rates move', async () => {
    const w = await createWallet(app);
    await deposit(app, w, 'USDx', '100').expect(201);
    const q = await quote(w, {
      fromCurrency: 'USDx',
      toCurrency: 'cNGN',
      amount: '10',
    }).expect(201);
    expect(q.body.data).toMatchObject({
      feeBps: 50,
      feeAmount: '0.050000',
      fromAmount: '10.000000',
    });
    expect(Date.parse(q.body.data.expiresAt) - Date.now()).toBeLessThanOrEqual(
      31_000,
    );

    primary.answer = () => weakerNaira(primaryRates(now));
    await app.get(FxService).refresh();
    const live = await swap(app, w, {
      fromCurrency: 'USDx',
      toCurrency: 'cNGN',
      amount: '10',
    }).expect(201);
    const held = await swap(app, w, {
      fromCurrency: 'USDx',
      toCurrency: 'cNGN',
      amount: '10',
      quoteId: q.body.data.quoteId,
    }).expect(201);
    expect(held.body.data.transaction).toMatchObject({
      toAmount: q.body.data.toAmount,
      rate: q.body.data.rate,
      feeAmount: q.body.data.feeAmount,
    });
    expect(live.body.data.transaction.rate).not.toBe(q.body.data.rate);
    primary.answer = () => primaryRates(now);
    await app.get(FxService).refresh();
  });

  it('can be used once, by its owner, for the quoted currencies and amount only', async () => {
    const a = await createWallet(app);
    const b = await createWallet(app);
    await deposit(app, a, 'USDx', '100').expect(201);
    await deposit(app, b, 'USDx', '100').expect(201);
    const q = (
      await quote(a, {
        fromCurrency: 'USDx',
        toCurrency: 'cGHS',
        amount: '5',
      }).expect(201)
    ).body.data;
    const send = (sender: TestWallet, extra: Record<string, string>) =>
      transfer(app, sender, {
        toWalletId: sender === a ? b.walletId : a.walletId,
        fromCurrency: 'USDx',
        toCurrency: 'cGHS',
        amount: '5',
        ...extra,
      });

    expect((await send(b, { quoteId: q.quoteId }).expect(404)).body.code).toBe(
      'QUOTE_NOT_FOUND',
    );
    expect(
      (await send(a, { quoteId: q.quoteId, amount: '6' }).expect(422)).body
        .code,
    ).toBe('QUOTE_MISMATCH');
    expect(
      (await send(a, { quoteId: q.quoteId, toCurrency: 'cXAF' }).expect(422))
        .body.code,
    ).toBe('QUOTE_MISMATCH');
    const used = await send(a, { quoteId: q.quoteId }).expect(201);
    expect(used.body.data.transaction.toAmount).toBe(q.toAmount);
    expect((await send(a, { quoteId: q.quoteId }).expect(409)).body.code).toBe(
      'QUOTE_ALREADY_USED',
    );
    await send(a, { quoteId: '00000000-0000-4000-8000-000000000000' }).expect(
      404,
    );
  });

  it('is spent once even when two movements race for it', async () => {
    const w = await createWallet(app);
    await deposit(app, w, 'EURx', '50').expect(201);
    const q = (
      await quote(w, {
        fromCurrency: 'EURx',
        toCurrency: 'USDx',
        amount: '3',
      }).expect(201)
    ).body.data;
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        swap(
          app,
          w,
          {
            fromCurrency: 'EURx',
            toCurrency: 'USDx',
            amount: '3',
            quoteId: q.quoteId,
          },
          newKey(),
        ),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([
      201, 409, 409, 409, 409,
    ]);
  });

  it('stays usable after a failed movement, but not after it expires', async () => {
    const w = await createWallet(app);
    const q = (
      await quote(w, {
        fromCurrency: 'cGHS',
        toCurrency: 'USDx',
        amount: '20',
      }).expect(201)
    ).body.data;
    const broke = await swap(app, w, {
      fromCurrency: 'cGHS',
      toCurrency: 'USDx',
      amount: '20',
      quoteId: q.quoteId,
    }).expect(422);
    expect(broke.body.code).toBe('INSUFFICIENT_FUNDS');
    await deposit(app, w, 'cGHS', '40').expect(201);
    await swap(app, w, {
      fromCurrency: 'cGHS',
      toCurrency: 'USDx',
      amount: '20',
      quoteId: q.quoteId,
    }).expect(201);

    const late = (
      await quote(w, {
        fromCurrency: 'cGHS',
        toCurrency: 'USDx',
        amount: '1',
      }).expect(201)
    ).body.data;
    await db.query(
      `UPDATE fx_quotes SET created_at = now() - interval '1 minute', expires_at = now() - interval '1 second' WHERE id = $1`,
      [late.quoteId],
    );
    const expired = await swap(app, w, {
      fromCurrency: 'cGHS',
      toCurrency: 'USDx',
      amount: '1',
      quoteId: late.quoteId,
    }).expect(422);
    expect(expired.body.code).toBe('QUOTE_EXPIRED');
  });

  it('still honours a live quote after the rates go stale, while new prices are refused', async () => {
    const w = await createWallet(app);
    await deposit(app, w, 'USDx', '10').expect(201);
    const q = (
      await quote(w, {
        fromCurrency: 'USDx',
        toCurrency: 'cXAF',
        amount: '2',
      }).expect(201)
    ).body.data;
    const realNow = now;
    now = new Date(realNow.getTime() + 30 * 3_600_000);
    try {
      expect(
        (
          await quote(w, {
            fromCurrency: 'USDx',
            toCurrency: 'cXAF',
            amount: '2',
          })
        ).status,
      ).toBe(503);
      await swap(app, w, {
        fromCurrency: 'USDx',
        toCurrency: 'cXAF',
        amount: '2',
      }).expect(503);
      await swap(app, w, {
        fromCurrency: 'USDx',
        toCurrency: 'cXAF',
        amount: '2',
        quoteId: q.quoteId,
      }).expect(201);
    } finally {
      now = realNow;
    }
  });

  it('refuses bad input and needs a sign-in', async () => {
    const w = await createWallet(app);
    await quote(w, {
      fromCurrency: 'USDx',
      toCurrency: 'NGN',
      amount: '1',
    }).expect(400);
    await quote(w, {
      fromCurrency: 'USDx',
      toCurrency: 'cNGN',
      amount: '-1',
    }).expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/quotes')
      .send({ fromCurrency: 'USDx', toCurrency: 'cNGN', amount: '1' })
      .expect(401);
    await swap(app, w, {
      fromCurrency: 'USDx',
      toCurrency: 'cNGN',
      amount: '1',
      quoteId: 'not-a-uuid',
    }).expect(400);
  });
});
