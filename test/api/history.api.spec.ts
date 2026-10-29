import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { FxService } from '../../src/fx/fx.service.js';
import { FakeProvider, primaryRates } from '../support/fx.js';
import { deposit, swap, transfer } from '../support/money.js';
import { createTestApp } from '../support/test-app.js';
import { createWallet, type TestWallet } from '../support/wallets.js';

interface Item {
  transactionId: string;
  type: string;
  direction: string;
  fromCurrency: string | null;
  toCurrency: string;
}

describe('transaction history', () => {
  let app: NestExpressApplication;
  const now = new Date();
  const primary = new FakeProvider('exchangerate-api');
  const secondary = new FakeProvider('currency-api');

  const history = (wallet: TestWallet, query = '') =>
    request(app.getHttpServer())
      .get(`/api/v1/wallets/${wallet.walletId}/transactions${query}`)
      .set('Authorization', `Bearer ${wallet.accessToken}`);
  const byId = (wallet: TestWallet, id: string) =>
    request(app.getHttpServer())
      .get(`/api/v1/transactions/${id}`)
      .set('Authorization', `Bearer ${wallet.accessToken}`);

  beforeAll(async () => {
    app = await createTestApp(
      {},
      { fxProviders: [primary, secondary], clock: () => now },
    );
    primary.answer = () => primaryRates(now);
    await app.get(FxService).refresh();
  });

  afterAll(async () => {
    await app.close();
  });

  it('TC-030 lists deposits, swaps and both sides of transfers newest first with a direction', async () => {
    const a = await createWallet(app);
    const b = await createWallet(app);
    await deposit(app, a, 'USDx', '50').expect(201);
    await swap(app, a, {
      fromCurrency: 'USDx',
      toCurrency: 'cNGN',
      amount: '10',
    }).expect(201);
    await transfer(app, a, {
      toWalletId: b.walletId,
      fromCurrency: 'USDx',
      amount: '5',
    }).expect(201);
    await deposit(app, b, 'EURx', '7').expect(201);
    await transfer(app, b, {
      toWalletId: a.walletId,
      fromCurrency: 'EURx',
      amount: '2',
    }).expect(201);

    const res = await history(a).expect(200);
    const items = res.body.data.items as Item[];
    expect(items.map((i) => [i.type, i.direction])).toEqual([
      ['TRANSFER', 'IN'],
      ['TRANSFER', 'OUT'],
      ['SWAP', 'INTERNAL'],
      ['DEPOSIT', 'IN'],
    ]);
    expect(res.body.data).toMatchObject({ page: 1, limit: 20, total: 4 });
    const theirs = (await history(b).expect(200)).body.data.items as Item[];
    expect(theirs.map((i) => i.direction)).toEqual(['OUT', 'IN', 'IN']);
  });

  it('TC-031 pages through 25 items', async () => {
    const a = await createWallet(app);
    for (let i = 1; i <= 25; i++) {
      await deposit(app, a, 'cGHS', String(i)).expect(201);
    }
    const page3 = await history(a, '?limit=10&page=3').expect(200);
    expect(page3.body.data).toMatchObject({ page: 3, limit: 10, total: 25 });
    expect(
      (page3.body.data.items as { toAmount: string }[]).map((i) => i.toAmount),
    ).toEqual(['5.000000', '4.000000', '3.000000', '2.000000', '1.000000']);
    const past = await history(a, '?limit=10&page=4').expect(200);
    expect(past.body.data).toMatchObject({ items: [], total: 25 });
  });

  it('TC-032 filters by type and by currency on either side', async () => {
    const a = await createWallet(app);
    const b = await createWallet(app);
    await deposit(app, a, 'USDx', '50').expect(201);
    await deposit(app, a, 'cXAF', '1000').expect(201);
    await swap(app, a, {
      fromCurrency: 'USDx',
      toCurrency: 'cGHS',
      amount: '10',
    }).expect(201);
    await transfer(app, a, {
      toWalletId: b.walletId,
      fromCurrency: 'USDx',
      toCurrency: 'cGHS',
      amount: '5',
    }).expect(201);

    const swaps = (await history(a, '?type=SWAP').expect(200)).body.data;
    expect(swaps.total).toBe(1);
    const moves = (await history(a, '?type=SWAP,TRANSFER').expect(200)).body
      .data.items as Item[];
    expect(moves.map((i) => i.type)).toEqual(['TRANSFER', 'SWAP']);
    const ghs = (await history(a, '?currency=cGHS').expect(200)).body.data
      .items as Item[];
    expect(ghs.map((i) => i.type)).toEqual(['TRANSFER', 'SWAP']);
    const both = (await history(a, '?type=DEPOSIT&currency=cXAF').expect(200))
      .body.data.items as Item[];
    expect(both.map((i) => i.toCurrency)).toEqual(['cXAF']);
    expect(
      (await history(b, '?currency=USDx').expect(200)).body.data.total,
    ).toBe(1);
  });

  it('refuses bad paging and filter values', async () => {
    const a = await createWallet(app);
    for (const query of [
      '?page=0',
      '?page=abc',
      '?limit=0',
      '?limit=101',
      '?type=REFUND',
      '?type=',
      '?currency=NGN',
      '?page=1.5',
    ]) {
      const res = await history(a, query);
      expect([query, res.status]).toEqual([query, 400]);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    }
    const words = await history(a, '?page=abc');
    expect(words.body.message).toBe('page must be a whole number.');
    const exponent = await history(a, '?limit=1e2');
    expect(exponent.body.message).toBe('limit must be a whole number.');
  });

  it('TC-029 TC-033 TC-057 shows a transaction to its sender and receiver only', async () => {
    const a = await createWallet(app);
    const b = await createWallet(app);
    const stranger = await createWallet(app);
    await deposit(app, a, 'cNGN', '100').expect(201);
    const sent = await transfer(app, a, {
      toWalletId: b.walletId,
      fromCurrency: 'cNGN',
      amount: '40',
    }).expect(201);
    const id = sent.body.data.transaction.transactionId as string;

    const mine = await byId(a, id).expect(200);
    expect(mine.body.data).toEqual(sent.body.data.transaction);
    expect((await byId(b, id.toUpperCase()).expect(200)).body.data).toEqual(
      sent.body.data.transaction,
    );
    expect((await byId(stranger, id).expect(404)).body.code).toBe(
      'TRANSACTION_NOT_FOUND',
    );
    await byId(a, '00000000-0000-4000-8000-000000000000').expect(404);
    await byId(a, 'not-a-uuid').expect(400);
  });

  it("keeps other people's history private", async () => {
    const a = await createWallet(app);
    const b = await createWallet(app);
    const res = await request(app.getHttpServer())
      .get(`/api/v1/wallets/${b.walletId}/transactions`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(404);
    expect(res.body.code).toBe('WALLET_NOT_FOUND');
    await request(app.getHttpServer())
      .get(`/api/v1/wallets/${a.walletId}/transactions`)
      .expect(401);
  });
});
