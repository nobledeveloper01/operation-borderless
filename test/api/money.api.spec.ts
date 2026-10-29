import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { FxService } from '../../src/fx/fx.service.js';
import { LedgerService } from '../../src/ledger/ledger.service.js';
import { connect } from '../support/db.js';
import { FakeProvider, primaryRates } from '../support/fx.js';
import {
  balancesOf,
  deposit,
  ledgerMatchesBalances,
  newKey,
  swap,
} from '../support/money.js';
import { createTestApp } from '../support/test-app.js';
import { bearer, createWallet } from '../support/wallets.js';

describe('deposits and swaps', () => {
  let app: NestExpressApplication;
  let db: pg.Client;
  let now = new Date();
  const primary = new FakeProvider('exchangerate-api');
  const secondary = new FakeProvider('currency-api');

  beforeAll(async () => {
    app = await createTestApp(
      {},
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

  describe('deposits', () => {
    it('TC-009 raises the balance exactly and records one transaction and one ledger line', async () => {
      const wallet = await createWallet(app);
      const res = await deposit(app, wallet, 'cGHS', '100.50').expect(201);
      expect(res.body.message).toBe('Deposit completed');
      expect(res.body.data.transaction).toMatchObject({
        type: 'DEPOSIT',
        status: 'COMPLETED',
        fromWalletId: null,
        toWalletId: wallet.walletId,
        toCurrency: 'cGHS',
        toAmount: '100.500000',
        rate: '1.0000000000',
        rateSource: 'none',
      });
      expect(res.body.data.balances).toEqual([
        { currency: 'cGHS', amount: '100.500000' },
      ]);
      expect((await balancesOf(db, wallet.walletId)).cGHS).toBe('100500000');
      const lines = await db.query(
        'SELECT amount::text, balance_after::text FROM ledger_entries WHERE transaction_id = $1',
        [res.body.data.transaction.transactionId],
      );
      expect(lines.rows).toEqual([
        { amount: '100500000', balance_after: '100500000' },
      ]);
    });

    it('TC-010 refuses bad amounts and currencies without moving money', async () => {
      const wallet = await createWallet(app);
      const bad: unknown[] = [
        { currency: 'cNGN', amount: '0' },
        { currency: 'cNGN', amount: '0.000000' },
        { currency: 'cNGN', amount: '-1' },
        { currency: 'cNGN', amount: '1.1234567' },
        { currency: 'cNGN', amount: 100 },
        { currency: 'cNGN', amount: '1000000000.000001' },
        { currency: 'cNGN', amount: '1e3' },
        { currency: 'cNGN', amount: '' },
        { currency: 'BTC', amount: '1' },
        { currency: 'cNGN', amount: '1', rate: '2' },
      ];
      for (const body of bad) {
        const res = await request(app.getHttpServer())
          .post(`/api/v1/wallets/${wallet.walletId}/deposits`)
          .set(bearer(wallet.accessToken))
          .set('Idempotency-Key', newKey())
          .send(body as object);
        expect(res.status, JSON.stringify(body)).toBe(400);
      }
      expect(
        Object.values(await balancesOf(db, wallet.walletId)).every(
          (a) => a === '0',
        ),
      ).toBe(true);
    });

    it('accepts the largest allowed amount', async () => {
      const wallet = await createWallet(app);
      await deposit(app, wallet, 'USDx', '1000000000').expect(201);
    });

    it('TC-011 TC-021 replays a retry with the same key and moves money once', async () => {
      const wallet = await createWallet(app);
      const key = newKey();
      const first = await deposit(app, wallet, 'cNGN', '50000', key).expect(
        201,
      );
      const again = await deposit(app, wallet, 'cNGN', '50000', key).expect(
        201,
      );
      expect(again.headers['idempotent-replayed']).toBe('true');
      expect(first.headers['idempotent-replayed']).toBeUndefined();
      expect(again.body.data).toEqual(first.body.data);
      expect((await balancesOf(db, wallet.walletId)).cNGN).toBe('50000000000');
    });

    it('TC-022 refuses the same key with a different request', async () => {
      const wallet = await createWallet(app);
      const key = newKey();
      await deposit(app, wallet, 'cNGN', '10', key).expect(201);
      const res = await deposit(app, wallet, 'cNGN', '11', key).expect(422);
      expect(res.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('TC-024 needs a well-formed key, and a failed request can be retried with its key', async () => {
      const wallet = await createWallet(app);
      for (const key of [
        undefined,
        'short',
        'has spaces in it',
        'x'.repeat(129),
      ]) {
        const req = request(app.getHttpServer())
          .post(`/api/v1/wallets/${wallet.walletId}/deposits`)
          .set(bearer(wallet.accessToken))
          .send({ currency: 'cNGN', amount: '1' });
        const res = await (key === undefined
          ? req
          : req.set('Idempotency-Key', key));
        expect(res.status, String(key)).toBe(400);
        expect(res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      }
      const key = newKey();
      await swap(
        app,
        wallet,
        { fromCurrency: 'cNGN', toCurrency: 'USDx', amount: '100' },
        key,
      ).expect(422);
      await deposit(app, wallet, 'cNGN', '100').expect(201);
      await swap(
        app,
        wallet,
        { fromCurrency: 'cNGN', toCurrency: 'USDx', amount: '100' },
        key,
      ).expect(201);
    });

    it('scopes keys to each account', async () => {
      const a = await createWallet(app);
      const b = await createWallet(app);
      const key = newKey();
      await deposit(app, a, 'cNGN', '5', key).expect(201);
      const res = await deposit(app, b, 'cNGN', '5', key).expect(201);
      expect(res.headers['idempotent-replayed']).toBeUndefined();
    });

    it("refuses deposits into another holder's wallet", async () => {
      const a = await createWallet(app);
      const b = await createWallet(app);
      await request(app.getHttpServer())
        .post(`/api/v1/wallets/${a.walletId}/deposits`)
        .set(bearer(b.accessToken))
        .set('Idempotency-Key', newKey())
        .send({ currency: 'cNGN', amount: '5' })
        .expect(404);
    });
  });

  describe('balance limit', () => {
    it('refuses a deposit or swap that would push a balance past what it can hold, with a clear 422', async () => {
      const wallet = await createWallet(app);
      // Leaves room for 100,000 USDx, less than either a maximum deposit or the swap below brings in.
      await db.query(
        `UPDATE balances SET amount = 9223372036854775807 - 100000000000 WHERE wallet_id = $1 AND currency = 'USDx'`,
        [wallet.walletId],
      );
      const res = await deposit(app, wallet, 'USDx', '1000000000').expect(422);
      expect(res.body.code).toBe('BALANCE_LIMIT');
      await deposit(app, wallet, 'cNGN', '1000000000').expect(201);
      const swapped = await swap(app, wallet, {
        fromCurrency: 'cNGN',
        toCurrency: 'USDx',
        amount: '1000000000',
      }).expect(422);
      expect(swapped.body.code).toBe('BALANCE_LIMIT');
      expect((await balancesOf(db, wallet.walletId)).cNGN).toBe(
        '1000000000000000',
      );
    });
  });

  describe('swaps', () => {
    it('TC-012 converts at the current rate, rounding down, and records the rate used', async () => {
      const wallet = await createWallet(app);
      await deposit(app, wallet, 'cNGN', '10000').expect(201);
      const res = await swap(app, wallet, {
        fromCurrency: 'cNGN',
        toCurrency: 'USDx',
        amount: '10000',
      }).expect(201);
      expect(res.body.data.transaction).toMatchObject({
        type: 'SWAP',
        fromWalletId: wallet.walletId,
        toWalletId: wallet.walletId,
        fromCurrency: 'cNGN',
        fromAmount: '10000.000000',
        toCurrency: 'USDx',
        toAmount: '7.428113',
        rate: '0.0007428113',
        rateSource: 'exchangerate-api',
        rateAsOf: primaryRates(now).providerUpdatedAt.toISOString(),
      });
      expect(res.body.data.balances).toEqual([
        { currency: 'cNGN', amount: '0.000000' },
        { currency: 'USDx', amount: '7.428113' },
      ]);
      expect(await ledgerMatchesBalances(db, wallet.walletId)).toBe(true);
    });

    it('TC-013 refuses a same-currency swap and an amount too small to convert', async () => {
      const wallet = await createWallet(app);
      await deposit(app, wallet, 'cNGN', '1').expect(201);
      const same = await swap(app, wallet, {
        fromCurrency: 'cNGN',
        toCurrency: 'cNGN',
        amount: '1',
      }).expect(400);
      expect(same.body.code).toBe('SAME_CURRENCY');
      const tiny = await swap(app, wallet, {
        fromCurrency: 'cNGN',
        toCurrency: 'USDx',
        amount: '0.000001',
      }).expect(422);
      expect(tiny.body.code).toBe('AMOUNT_TOO_SMALL');
    });

    it('TC-019 refuses an overdraft and changes nothing', async () => {
      const wallet = await createWallet(app);
      await deposit(app, wallet, 'cNGN', '500').expect(201);
      const res = await swap(app, wallet, {
        fromCurrency: 'cNGN',
        toCurrency: 'USDx',
        amount: '1000',
      }).expect(422);
      expect(res.body).toMatchObject({
        code: 'INSUFFICIENT_FUNDS',
        details: {
          currency: 'cNGN',
          available: '500.000000',
          requested: '1000.000000',
        },
      });
      expect(await balancesOf(db, wallet.walletId)).toMatchObject({
        cNGN: '500000000',
        USDx: '0',
      });
    });

    it('TC-014 rolls back the whole swap, key included, when a step fails after money moved', async () => {
      const wallet = await createWallet(app);
      await deposit(app, wallet, 'cNGN', '1000').expect(201);
      const ledger = app.get(LedgerService);
      const original = ledger.post.bind(ledger);
      const spy = vi
        .spyOn(ledger, 'post')
        .mockImplementationOnce(async (...args) => {
          await original(...args);
          throw new Error('crash after the balances changed');
        });
      const key = newKey();
      await swap(
        app,
        wallet,
        { fromCurrency: 'cNGN', toCurrency: 'USDx', amount: '1000' },
        key,
      ).expect(500);
      spy.mockRestore();
      expect(await balancesOf(db, wallet.walletId)).toMatchObject({
        cNGN: '1000000000',
        USDx: '0',
      });
      await swap(
        app,
        wallet,
        { fromCurrency: 'cNGN', toCurrency: 'USDx', amount: '1000' },
        key,
      ).expect(201);
    });

    it('TC-020 TC-037 lets exactly 4 of 20 parallel swaps of a quarter balance through, and the ledger still adds up', async () => {
      const wallet = await createWallet(app);
      await deposit(app, wallet, 'cNGN', '100').expect(201);
      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          swap(app, wallet, {
            fromCurrency: 'cNGN',
            toCurrency: 'EURx',
            amount: '25',
          }),
        ),
      );
      const statuses = results.map((r) => r.status);
      expect(statuses.filter((s) => s === 201)).toHaveLength(4);
      expect(statuses.filter((s) => s === 422)).toHaveLength(16);
      expect((await balancesOf(db, wallet.walletId)).cNGN).toBe('0');
      expect(await ledgerMatchesBalances(db, wallet.walletId)).toBe(true);
    });

    it('TC-023 answers 10 parallel requests with one key with one transaction', async () => {
      const wallet = await createWallet(app);
      await deposit(app, wallet, 'cNGN', '1000').expect(201);
      const key = newKey();
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          swap(
            app,
            wallet,
            { fromCurrency: 'cNGN', toCurrency: 'USDx', amount: '100' },
            key,
          ),
        ),
      );
      expect(results.map((r) => r.status)).toEqual(Array<number>(10).fill(201));
      const ids = new Set(
        results.map((r) => r.body.data.transaction.transactionId as string),
      );
      expect(ids.size).toBe(1);
      const swaps = await db.query(
        "SELECT count(*)::int AS n FROM transactions WHERE from_wallet_id = $1 AND type = 'SWAP'",
        [wallet.walletId],
      );
      expect(swaps.rows[0]).toEqual({ n: 1 });
      expect((await balancesOf(db, wallet.walletId)).cNGN).toBe('900000000');
    });

    it('refuses to price a swap once the rates are past the 26-hour limit', async () => {
      const wallet = await createWallet(app);
      await deposit(app, wallet, 'cNGN', '100').expect(201);
      const saved = now;
      now = new Date(
        app.get(FxService).latest()!.providerUpdatedAt.getTime() +
          27 * 3_600_000,
      );
      try {
        const res = await swap(app, wallet, {
          fromCurrency: 'cNGN',
          toCurrency: 'USDx',
          amount: '100',
        }).expect(503);
        expect(res.body.code).toBe('FX_RATE_UNAVAILABLE');
      } finally {
        now = saved;
      }
    });

    it('TC-043 limits money writes per minute', async () => {
      const limited = await createTestApp({ MONEY_RATE_LIMIT_PER_MINUTE: '2' });
      try {
        const wallet = await createWallet(limited);
        await deposit(limited, wallet, 'cNGN', '1').expect(201);
        await deposit(limited, wallet, 'cNGN', '1').expect(201);
        const res = await deposit(limited, wallet, 'cNGN', '1').expect(429);
        expect(res.body.code).toBe('RATE_LIMITED');
      } finally {
        await limited.close();
      }
    });
  });
});
