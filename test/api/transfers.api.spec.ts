import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import { FxService } from '../../src/modules/fx/fx.service.js';
import { connect } from '../support/db.js';
import { FakeProvider, primaryRates } from '../support/fx.js';
import {
  balancesOf,
  deposit,
  ledgerMatchesBalances,
  newKey,
  transfer,
} from '../support/money.js';
import { createTestApp } from '../support/test-app.js';
import { createWallet } from '../support/wallets.js';

describe('transfers', () => {
  let app: NestExpressApplication;
  let db: pg.Client;
  const now = new Date();
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

  it('TC-025 TC-029 moves the exact amount in one currency and records sender, receiver, amounts, rate and time', async () => {
    const a = await createWallet(app);
    const b = await createWallet(app);
    await deposit(app, a, 'cNGN', '5000').expect(201);
    const res = await transfer(app, a, {
      toWalletId: b.walletId,
      fromCurrency: 'cNGN',
      amount: '1234.5',
    }).expect(201);
    expect(res.body.message).toBe('Transfer completed');
    expect(res.body.data.transaction).toMatchObject({
      type: 'TRANSFER',
      fromWalletId: a.walletId,
      toWalletId: b.walletId,
      fromCurrency: 'cNGN',
      fromAmount: '1234.500000',
      toCurrency: 'cNGN',
      toAmount: '1234.500000',
      rate: '1.0000000000',
      rateSource: 'none',
    });
    expect(Date.parse(res.body.data.transaction.createdAt)).not.toBeNaN();
    expect((await balancesOf(db, a.walletId)).cNGN).toBe('3765500000');
    expect((await balancesOf(db, b.walletId)).cNGN).toBe('1234500000');
  });

  it("TC-028 converts at the current rate when the currencies differ, and never shows the receiver's balance", async () => {
    const a = await createWallet(app);
    const b = await createWallet(app);
    await deposit(app, a, 'USDx', '20').expect(201);
    await deposit(app, b, 'cGHS', '1').expect(201);
    const res = await transfer(app, a, {
      toWalletId: b.walletId,
      fromCurrency: 'USDx',
      toCurrency: 'cGHS',
      amount: '20',
    }).expect(201);
    expect(res.body.data.transaction).toMatchObject({
      toAmount: '232.798320',
      rate: '11.6399160000',
      rateSource: 'exchangerate-api',
      rateAsOf: primaryRates(now).providerUpdatedAt.toISOString(),
    });
    expect(res.body.data.balances).toEqual([
      { currency: 'USDx', amount: '0.000000' },
    ]);
    expect((await balancesOf(db, b.walletId)).cGHS).toBe('233798320');
  });

  it('TC-026 TC-057 refuses an overdraft, a self-transfer, an unknown receiver and sending from someone else', async () => {
    const a = await createWallet(app);
    const b = await createWallet(app);
    await deposit(app, a, 'cNGN', '10').expect(201);

    const over = await transfer(app, a, {
      toWalletId: b.walletId,
      fromCurrency: 'cNGN',
      amount: '11',
    }).expect(422);
    expect(over.body.code).toBe('INSUFFICIENT_FUNDS');
    const self = await transfer(app, a, {
      toWalletId: a.walletId,
      fromCurrency: 'cNGN',
      amount: '1',
    }).expect(422);
    expect(self.body.code).toBe('SAME_WALLET');
    const unknown = await transfer(app, a, {
      toWalletId: '00000000-0000-4000-8000-000000000000',
      fromCurrency: 'cNGN',
      amount: '1',
    }).expect(404);
    expect(unknown.body.code).toBe('WALLET_NOT_FOUND');
    await transfer(app, b, {
      fromWalletId: a.walletId,
      toWalletId: b.walletId,
      fromCurrency: 'cNGN',
      amount: '1',
    }).expect(404);
    await transfer(app, a, {
      toWalletId: 'not-a-uuid',
      fromCurrency: 'cNGN',
      amount: '1',
    }).expect(400);

    expect((await balancesOf(db, a.walletId)).cNGN).toBe('10000000');
    expect((await balancesOf(db, b.walletId)).cNGN).toBe('0');
  });

  it('treats wallet IDs the same in any letter case', async () => {
    const a = await createWallet(app);
    const b = await createWallet(app);
    await deposit(app, a, 'cNGN', '10').expect(201);

    const self = await transfer(app, a, {
      toWalletId: a.walletId.toUpperCase(),
      fromCurrency: 'cNGN',
      amount: '1',
    }).expect(422);
    expect(self.body.code).toBe('SAME_WALLET');
    const sent = await transfer(app, a, {
      fromWalletId: a.walletId.toUpperCase(),
      toWalletId: b.walletId.toUpperCase(),
      fromCurrency: 'cNGN',
      amount: '1',
    }).expect(201);
    expect(sent.body.data.transaction.toWalletId).toBe(b.walletId);
    await deposit(
      app,
      { ...a, walletId: a.walletId.toUpperCase() },
      'cNGN',
      '1',
    ).expect(201);

    expect((await balancesOf(db, a.walletId)).cNGN).toBe('10000000');
    expect((await balancesOf(db, b.walletId)).cNGN).toBe('1000000');
  });

  it('TC-027 runs opposite transfers in parallel without a deadlock and keeps the total', async () => {
    const a = await createWallet(app);
    const b = await createWallet(app);
    await deposit(app, a, 'EURx', '100').expect(201);
    await deposit(app, b, 'EURx', '100').expect(201);
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        i % 2 === 0
          ? transfer(app, a, {
              toWalletId: b.walletId,
              fromCurrency: 'EURx',
              amount: '1',
            })
          : transfer(app, b, {
              toWalletId: a.walletId,
              fromCurrency: 'EURx',
              amount: '1',
            }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual(Array<number>(20).fill(201));
    const total =
      BigInt((await balancesOf(db, a.walletId)).EURx!) +
      BigInt((await balancesOf(db, b.walletId)).EURx!);
    expect(total).toBe(200_000_000n);
    expect(await ledgerMatchesBalances(db, a.walletId)).toBe(true);
    expect(await ledgerMatchesBalances(db, b.walletId)).toBe(true);
  });

  it('TC-035 lets 10 parallel transfers spend a balance only once', async () => {
    const a = await createWallet(app);
    const b = await createWallet(app);
    await deposit(app, a, 'cGHS', '30').expect(201);
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        transfer(app, a, {
          toWalletId: b.walletId,
          fromCurrency: 'cGHS',
          amount: '10',
        }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 422)).toHaveLength(7);
    expect((await balancesOf(db, a.walletId)).cGHS).toBe('0');
    expect((await balancesOf(db, b.walletId)).cGHS).toBe('30000000');
  });

  it('TC-036 replays a retried transfer and moves money once', async () => {
    const a = await createWallet(app);
    const b = await createWallet(app);
    await deposit(app, a, 'cNGN', '100').expect(201);
    const key = newKey();
    const first = await transfer(
      app,
      a,
      { toWalletId: b.walletId, fromCurrency: 'cNGN', amount: '40' },
      key,
    ).expect(201);
    const again = await transfer(
      app,
      a,
      { toWalletId: b.walletId, fromCurrency: 'cNGN', amount: '40' },
      key,
    ).expect(201);
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(again.body.data.transaction.transactionId).toBe(
      first.body.data.transaction.transactionId,
    );
    expect((await balancesOf(db, b.walletId)).cNGN).toBe('40000000');
  });
});
