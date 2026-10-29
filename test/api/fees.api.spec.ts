import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { convert, parseRate } from '../../src/common/money/rate.js';
import { parseAmount } from '../../src/common/money/amount.js';
import { FxService } from '../../src/modules/fx/fx.service.js';
import { connect } from '../support/db.js';
import { FakeProvider, primaryRates } from '../support/fx.js';
import {
  balancesOf,
  deposit,
  ledgerMatchesBalances,
  swap,
  transfer,
} from '../support/money.js';
import { createTestApp } from '../support/test-app.js';
import { createWallet } from '../support/wallets.js';

const OPS = { 'X-Ops-Token': 'test-ops-token-0123456789abcdefghijklmnop' };

interface Tx {
  transactionId: string;
  fromAmount: string;
  toAmount: string;
  rate: string;
  feeBps: number;
  feeAmount: string;
  roundingAmount: string;
}

describe('fees and the platform account', () => {
  let app: NestExpressApplication;
  let db: pg.Client;
  const now = new Date();
  const primary = new FakeProvider('exchangerate-api');
  const secondary = new FakeProvider('currency-api');

  beforeAll(async () => {
    app = await createTestApp(
      { FEE_BPS: '50', FEE_BPS_BY_PAIR: 'USDx:EURx=0' },
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

  // The receiver gets the amount after the fee, converted at the recorded rate and rounded down.
  const expectPriced = (tx: Tx, bps: number) => {
    const amount = parseAmount(tx.fromAmount);
    const fee = parseAmount(tx.feeAmount);
    expect(tx.feeBps).toBe(bps);
    expect(fee).toBe((amount * BigInt(bps) + 9_999n) / 10_000n);
    expect(parseAmount(tx.toAmount)).toBe(
      convert(amount - fee, parseRate(tx.rate)),
    );
  };

  it('charges 0.5% on a swap and books it to the platform in the source currency', async () => {
    const w = await createWallet(app);
    await deposit(app, w, 'USDx', '100').expect(201);
    const res = await swap(app, w, {
      fromCurrency: 'USDx',
      toCurrency: 'cNGN',
      amount: '10',
    }).expect(201);
    const tx = res.body.data.transaction as Tx;
    expectPriced(tx, 50);
    expect(tx.feeAmount).toBe('0.050000');
    expect((await balancesOf(db, w.walletId)).USDx).toBe('90000000');
    const { rows } = await db.query<{
      kind: string;
      currency: string;
      amount: string;
    }>(
      'SELECT kind, currency::text, amount::text FROM platform_entries WHERE transaction_id = $1 ORDER BY kind',
      [tx.transactionId],
    );
    expect(rows.find((r) => r.kind === 'fee')).toEqual({
      kind: 'fee',
      currency: 'USDx',
      amount: '50000',
    });
  });

  it('keeps same-currency transfers free and applies a per-pair override', async () => {
    const a = await createWallet(app);
    const b = await createWallet(app);
    await deposit(app, a, 'USDx', '20').expect(201);
    const same = await transfer(app, a, {
      toWalletId: b.walletId,
      fromCurrency: 'USDx',
      amount: '5',
    }).expect(201);
    expect(same.body.data.transaction).toMatchObject({
      feeBps: 0,
      feeAmount: '0.000000',
      roundingAmount: '0.000000',
      toAmount: '5.000000',
    });
    const free = await transfer(app, a, {
      toWalletId: b.walletId,
      fromCurrency: 'USDx',
      toCurrency: 'EURx',
      amount: '5',
    }).expect(201);
    expectPriced(free.body.data.transaction as Tx, 0);
    const paid = await transfer(app, a, {
      toWalletId: b.walletId,
      fromCurrency: 'USDx',
      toCurrency: 'cGHS',
      amount: '5',
    }).expect(201);
    expectPriced(paid.body.data.transaction as Tx, 50);
    expect(await ledgerMatchesBalances(db, a.walletId)).toBe(true);
    expect(await ledgerMatchesBalances(db, b.walletId)).toBe(true);
  });

  it('books rounding leftovers and refuses an amount the fee wipes out', async () => {
    const w = await createWallet(app);
    await deposit(app, w, 'cNGN', '50').expect(201);
    const res = await swap(app, w, {
      fromCurrency: 'cNGN',
      toCurrency: 'USDx',
      amount: '1',
    }).expect(201);
    const tx = res.body.data.transaction as Tx;
    expectPriced(tx, 50);
    expect(parseAmount(tx.roundingAmount)).toBeGreaterThan(0n);
    const tiny = await swap(app, w, {
      fromCurrency: 'USDx',
      toCurrency: 'cNGN',
      amount: '0.000001',
    });
    expect(tiny.status).toBe(422);
  });

  it('shows the platform total and the ledger check confirms it', async () => {
    const account = await request(app.getHttpServer())
      .get('/api/v1/ops/platform-account')
      .set(OPS)
      .expect(200);
    const usdx = (
      account.body.data as { currency: string; fees: string }[]
    ).find((r) => r.currency === 'USDx');
    expect(parseAmount(usdx!.fees)).toBeGreaterThan(0n);
    const check = await request(app.getHttpServer())
      .get('/api/v1/ops/ledger-check')
      .set(OPS)
      .expect(200);
    expect(check.body.data.platformMatches).toBe(true);
  });
  // Runs last: platform entries are append-only, so the extra rows stay for the rest of the run.
  it('notices platform entries that cancel out in total but not row by row', async () => {
    const w = await createWallet(app);
    await deposit(app, w, 'cXAF', '1000').expect(201);
    const one = await swap(app, w, {
      fromCurrency: 'cXAF',
      toCurrency: 'USDx',
      amount: '100',
    }).expect(201);
    const two = await swap(app, w, {
      fromCurrency: 'cXAF',
      toCurrency: 'USDx',
      amount: '100',
    }).expect(201);
    // Both swaps booked the same fee; move one millionth of it from the first to the second.
    const ids = [one, two].map(
      (r) => r.body.data.transaction.transactionId as string,
    );
    await db.query(`SET session_replication_role = replica`);
    try {
      await db.query(
        `UPDATE platform_entries SET amount = amount - 1 WHERE transaction_id = $1 AND kind = 'fee'`,
        [ids[0]],
      );
      await db.query(
        `UPDATE platform_entries SET amount = amount + 1 WHERE transaction_id = $1 AND kind = 'fee'`,
        [ids[1]],
      );
    } finally {
      await db.query(`SET session_replication_role = origin`);
    }
    const check = await request(app.getHttpServer())
      .get('/api/v1/ops/ledger-check')
      .set(OPS)
      .expect(200);
    expect(check.body.data.platformMatches).toBe(false);
  });

  it('notices a platform entry that no transaction accounts for', async () => {
    const w = await createWallet(app);
    const dep = await deposit(app, w, 'EURx', '1').expect(201);
    await db.query(
      `INSERT INTO platform_entries (transaction_id, currency, kind, amount) VALUES ($1, 'EURx', 'fee', 1)`,
      [dep.body.data.transaction.transactionId],
    );
    const check = await request(app.getHttpServer())
      .get('/api/v1/ops/ledger-check')
      .set(OPS)
      .expect(200);
    expect(check.body.data).toMatchObject({
      ok: false,
      platformMatches: false,
    });
  });
});
