import type pg from 'pg';
import {
  connect,
  errorCode,
  insertWallet,
  migrationDataSource,
} from '../support/db.js';

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const RESTRICT_VIOLATION = '23001';

describe('schema', () => {
  let client: pg.Client;
  let walletId: string;

  beforeAll(async () => {
    client = await connect();
    await client.query('BEGIN');
    walletId = await insertWallet(client);
  });

  afterAll(async () => {
    await client.query('ROLLBACK');
    await client.end();
  });

  it('migrates up, down and up again on an empty database', async () => {
    await client.query('COMMIT');
    await client.query('DROP DATABASE IF EXISTS migration_check');
    await client.query('CREATE DATABASE migration_check');
    await client.query('BEGIN');
    const ds = migrationDataSource('migration_check');
    await ds.initialize();
    try {
      await ds.runMigrations({ transaction: 'each' });
      for (let i = 0; i < ds.migrations.length; i++) {
        await ds.undoLastMigration({ transaction: 'each' });
      }
      const after = await ds.query<{ n: string }[]>(
        `SELECT count(*) AS n FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migrations'`,
      );
      expect(Number(after[0]?.n)).toBe(0);
      await ds.runMigrations({ transaction: 'each' });
      const tables = await ds.query<{ tablename: string }[]>(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`,
      );
      expect(tables.map((t) => t.tablename)).toEqual([
        'accounts',
        'balances',
        'fx_quotes',
        'fx_snapshots',
        'idempotency_keys',
        'ledger_entries',
        'migrations',
        'platform_entries',
        'refresh_tokens',
        'sessions',
        'transactions',
        'wallet_keys',
        'wallets',
      ]);
    } finally {
      await ds.destroy();
    }
  });

  it('TC-019 refuses a negative balance at the database level', async () => {
    expect(
      await errorCode(
        client,
        `UPDATE balances SET amount = -1 WHERE wallet_id = $1 AND currency = 'cNGN'`,
        [walletId],
      ),
    ).toBe(CHECK_VIOLATION);
  });

  it('TC-006 refuses an unsupported currency', async () => {
    expect(
      await errorCode(
        client,
        `INSERT INTO balances (wallet_id, currency) VALUES ($1, 'BTC')`,
        [walletId],
      ),
    ).toBe(CHECK_VIOLATION);
  });

  it('TC-005 refuses a second account with the same email lookup', async () => {
    const lookup = Buffer.alloc(32, 7);
    const insert = `INSERT INTO accounts (email_encrypted, email_lookup, pii_key_version, password_hash) VALUES ('\\x00', $1, 1, 'h')`;
    expect(await errorCode(client, insert, [lookup])).toBeUndefined();
    expect(await errorCode(client, insert, [lookup])).toBe(UNIQUE_VIOLATION);
  });

  it('refuses transactions with the wrong shape for their type', async () => {
    const swapSameCurrency = `INSERT INTO transactions (type, from_wallet_id, to_wallet_id, from_currency, from_amount, to_currency, to_amount, rate, rate_source)
      VALUES ('SWAP', $1, $1, 'cNGN', 1, 'cNGN', 1, 1, 'none')`;
    expect(await errorCode(client, swapSameCurrency, [walletId])).toBe(
      CHECK_VIOLATION,
    );
    const depositWithRate = `INSERT INTO transactions (type, to_wallet_id, to_currency, to_amount, rate, rate_source) VALUES ('DEPOSIT', $1, 'cNGN', 1, 2, 'none')`;
    expect(await errorCode(client, depositWithRate, [walletId])).toBe(
      CHECK_VIOLATION,
    );
    const transferToSelf = `INSERT INTO transactions (type, from_wallet_id, to_wallet_id, from_currency, from_amount, to_currency, to_amount, rate, rate_source)
      VALUES ('TRANSFER', $1, $1, 'cNGN', 1, 'cNGN', 1, 1, 'none')`;
    expect(await errorCode(client, transferToSelf, [walletId])).toBe(
      CHECK_VIOLATION,
    );
  });

  it('TC-038 keeps transactions and ledger lines append-only', async () => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO transactions (type, to_wallet_id, to_currency, to_amount, rate, rate_source) VALUES ('DEPOSIT', $1, 'cNGN', 5, 1, 'none') RETURNING id`,
      [walletId],
    );
    const transactionId = rows[0]!.id;
    await client.query(
      `INSERT INTO ledger_entries (transaction_id, wallet_id, currency, amount, balance_after) VALUES ($1, $2, 'cNGN', 5, 5)`,
      [transactionId, walletId],
    );
    expect(
      await errorCode(
        client,
        'UPDATE transactions SET to_amount = 6 WHERE id = $1',
        [transactionId],
      ),
    ).toBe(RESTRICT_VIOLATION);
    expect(
      await errorCode(client, 'DELETE FROM transactions WHERE id = $1', [
        transactionId,
      ]),
    ).toBe(RESTRICT_VIOLATION);
    expect(
      await errorCode(
        client,
        'UPDATE ledger_entries SET amount = 6 WHERE transaction_id = $1',
        [transactionId],
      ),
    ).toBe(RESTRICT_VIOLATION);
    expect(await errorCode(client, 'TRUNCATE ledger_entries')).toBe(
      RESTRICT_VIOLATION,
    );
  });

  it('refuses fees on deposits and fees that eat the whole amount, and keeps platform entries append-only', async () => {
    const depositWithFee = `INSERT INTO transactions (type, to_wallet_id, to_currency, to_amount, rate, rate_source, fee_amount)
      VALUES ('DEPOSIT', $1, 'cNGN', 5, 1, 'none', 1)`;
    expect(await errorCode(client, depositWithFee, [walletId])).toBe(
      CHECK_VIOLATION,
    );
    const feeTooBig = `INSERT INTO transactions (type, from_wallet_id, to_wallet_id, from_currency, from_amount, to_currency, to_amount, rate, rate_source, fee_amount)
      VALUES ('TRANSFER', $1, $2, 'cNGN', 5, 'cNGN', 5, 1, 'none', 5)`;
    const otherWalletId = await insertWallet(client);
    expect(await errorCode(client, feeTooBig, [walletId, otherWalletId])).toBe(
      CHECK_VIOLATION,
    );
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO transactions (type, to_wallet_id, to_currency, to_amount, rate, rate_source) VALUES ('DEPOSIT', $1, 'cNGN', 5, 1, 'none') RETURNING id`,
      [walletId],
    );
    await client.query(
      `INSERT INTO platform_entries (transaction_id, currency, kind, amount) VALUES ($1, 'cNGN', 'fee', 1)`,
      [rows[0]!.id],
    );
    expect(
      await errorCode(client, 'UPDATE platform_entries SET amount = 2'),
    ).toBe(RESTRICT_VIOLATION);
    expect(await errorCode(client, 'TRUNCATE platform_entries')).toBe(
      RESTRICT_VIOLATION,
    );
  });
});
