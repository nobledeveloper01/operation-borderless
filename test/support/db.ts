import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { DataSource } from 'typeorm';
import { inject } from 'vitest';
import { migrations } from '../../src/migrations/index.js';

export function dbConfig(database?: string): pg.ClientConfig {
  const db = inject('db');
  return {
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: database ?? db.database,
  };
}

// A bare TypeORM connection with the app's migrations, for migration tests.
export function migrationDataSource(database: string): DataSource {
  const db = inject('db');
  return new DataSource({
    type: 'postgres',
    host: db.host,
    port: db.port,
    username: db.user,
    password: db.password,
    database,
    migrations,
  });
}

export async function connect(database?: string): Promise<pg.Client> {
  const client = new pg.Client(dbConfig(database));
  await client.connect();
  return client;
}

// Inserts the smallest valid account and wallet straight into the database, for schema tests.
export async function insertWallet(client: pg.Client): Promise<string> {
  const accountId = randomUUID();
  await client.query(
    `INSERT INTO accounts (id, email_encrypted, email_lookup, pii_key_version, password_hash)
     VALUES ($1, '\\x00', $2, 1, 'hash')`,
    [accountId, Buffer.alloc(32, accountId)],
  );
  const { rows } = await client.query<{ id: string }>(
    'INSERT INTO wallets (account_id) VALUES ($1) RETURNING id',
    [accountId],
  );
  const walletId = rows[0]!.id;
  await client.query(
    `INSERT INTO balances (wallet_id, currency) SELECT $1, c FROM unnest(ARRAY['cNGN','cGHS','cXAF','USDx','EURx']) AS c`,
    [walletId],
  );
  return walletId;
}

// Runs a statement and returns the PostgreSQL error code it fails with.
export async function errorCode(
  client: pg.Client,
  sql: string,
  params: unknown[] = [],
): Promise<string | undefined> {
  try {
    await client.query('SAVEPOINT probe');
    await client.query(sql, params);
    await client.query('RELEASE SAVEPOINT probe');
    return undefined;
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT probe');
    return (error as { code?: string }).code;
  }
}
