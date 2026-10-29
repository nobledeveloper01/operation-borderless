import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { bearer, type TestWallet } from './wallets.js';

export const newKey = () => randomUUID();

export function deposit(
  app: NestExpressApplication,
  wallet: TestWallet,
  currency: string,
  amount: string,
  key = newKey(),
) {
  return request(app.getHttpServer())
    .post(`/api/v1/wallets/${wallet.walletId}/deposits`)
    .set(bearer(wallet.accessToken))
    .set('Idempotency-Key', key)
    .send({ currency, amount });
}

export function swap(
  app: NestExpressApplication,
  wallet: TestWallet,
  body: {
    fromCurrency: string;
    toCurrency: string;
    amount: string;
    quoteId?: string;
  },
  key = newKey(),
) {
  return request(app.getHttpServer())
    .post(`/api/v1/wallets/${wallet.walletId}/swaps`)
    .set(bearer(wallet.accessToken))
    .set('Idempotency-Key', key)
    .send(body);
}

export async function balancesOf(
  db: pg.Client,
  walletId: string,
): Promise<Record<string, string>> {
  const { rows } = await db.query<{ currency: string; amount: string }>(
    'SELECT currency, amount::text FROM balances WHERE wallet_id = $1',
    [walletId],
  );
  return Object.fromEntries(rows.map((r) => [r.currency, r.amount]));
}

// The ledger must explain every balance exactly: the sum of its lines equals the stored amount.
export async function ledgerMatchesBalances(
  db: pg.Client,
  walletId: string,
): Promise<boolean> {
  const { rows } = await db.query<{ ok: boolean }>(
    `SELECT bool_and(b.amount = COALESCE(l.total, 0)) AS ok
       FROM balances b
       LEFT JOIN (SELECT wallet_id, currency, sum(amount) AS total FROM ledger_entries WHERE wallet_id = $1 GROUP BY 1, 2) l
         ON l.wallet_id = b.wallet_id AND l.currency = b.currency
      WHERE b.wallet_id = $1`,
    [walletId],
  );
  return rows[0]?.ok === true;
}

export function transfer(
  app: NestExpressApplication,
  sender: TestWallet,
  body: {
    fromWalletId?: string;
    toWalletId?: string;
    toEmail?: string;
    toPhoneNumber?: string;
    fromCurrency: string;
    toCurrency?: string;
    amount: string;
    quoteId?: string;
  },
  key = newKey(),
) {
  return request(app.getHttpServer())
    .post('/api/v1/transfers')
    .set(bearer(sender.accessToken))
    .set('Idempotency-Key', key)
    .send({ fromWalletId: sender.walletId, ...body });
}
