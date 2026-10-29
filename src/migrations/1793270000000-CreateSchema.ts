import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSchema1793270000000 implements MigrationInterface {
  name = 'CreateSchema1793270000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE DOMAIN stablecoin AS text CHECK (VALUE IN ('cNGN', 'cGHS', 'cXAF', 'USDx', 'EURx'))`,
    );
    await q.query(
      `CREATE DOMAIN sha256 AS bytea CHECK (octet_length(VALUE) = 32)`,
    );

    await q.query(`
      CREATE TABLE accounts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email_encrypted bytea,
        email_lookup sha256,
        phone_encrypted bytea,
        phone_lookup sha256,
        pii_key_version smallint NOT NULL CHECK (pii_key_version > 0),
        password_hash text NOT NULL,
        failed_logins integer NOT NULL DEFAULT 0 CHECK (failed_logins >= 0),
        locked_until timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT accounts_identifier_present CHECK (email_lookup IS NOT NULL OR phone_lookup IS NOT NULL),
        CONSTRAINT accounts_email_pair CHECK ((email_encrypted IS NULL) = (email_lookup IS NULL)),
        CONSTRAINT accounts_phone_pair CHECK ((phone_encrypted IS NULL) = (phone_lookup IS NULL))
      )`);
    await q.query(
      `CREATE UNIQUE INDEX accounts_email_lookup_key ON accounts (email_lookup) WHERE email_lookup IS NOT NULL`,
    );
    await q.query(
      `CREATE UNIQUE INDEX accounts_phone_lookup_key ON accounts (phone_lookup) WHERE phone_lookup IS NOT NULL`,
    );

    await q.query(`
      CREATE TABLE sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id uuid NOT NULL REFERENCES accounts (id),
        created_at timestamptz NOT NULL DEFAULT now(),
        revoked_at timestamptz,
        revoked_reason text CHECK (revoked_reason IN ('LOGOUT', 'LOGOUT_ALL', 'REFRESH_REUSE')),
        CONSTRAINT sessions_revoked_pair CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))
      )`);
    await q.query(
      `CREATE INDEX sessions_account_id_idx ON sessions (account_id)`,
    );

    await q.query(`
      CREATE TABLE refresh_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id uuid NOT NULL REFERENCES sessions (id),
        token_hash sha256 NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE INDEX refresh_tokens_session_id_idx ON refresh_tokens (session_id)`,
    );

    await q.query(`
      CREATE TABLE wallets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id uuid NOT NULL UNIQUE REFERENCES accounts (id),
        created_at timestamptz NOT NULL DEFAULT now()
      )`);

    await q.query(`
      CREATE TABLE wallet_keys (
        id text PRIMARY KEY CHECK (id ~ '^k_[a-z0-9]{12}$'),
        wallet_id uuid NOT NULL REFERENCES wallets (id),
        name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
        secret_hash sha256 NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_used_at timestamptz,
        revoked_at timestamptz
      )`);
    await q.query(
      `CREATE INDEX wallet_keys_active_idx ON wallet_keys (wallet_id) WHERE revoked_at IS NULL`,
    );

    await q.query(`
      CREATE TABLE balances (
        wallet_id uuid NOT NULL REFERENCES wallets (id),
        currency stablecoin NOT NULL,
        amount bigint NOT NULL DEFAULT 0 CONSTRAINT balances_amount_not_negative CHECK (amount >= 0),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (wallet_id, currency)
      )`);

    await q.query(`
      CREATE TABLE fx_snapshots (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        source text NOT NULL CHECK (source IN ('exchangerate-api', 'currency-api', 'fixed-table')),
        base text NOT NULL CHECK (base = 'USD'),
        rates jsonb NOT NULL CHECK (jsonb_typeof(rates) = 'object'),
        provider_updated_at timestamptz NOT NULL,
        fetched_at timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE INDEX fx_snapshots_provider_updated_at_idx ON fx_snapshots (provider_updated_at DESC)`,
    );

    await q.query(`
      CREATE TABLE transactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        type text NOT NULL CHECK (type IN ('DEPOSIT', 'SWAP', 'TRANSFER')),
        status text NOT NULL DEFAULT 'COMPLETED' CHECK (status = 'COMPLETED'),
        from_wallet_id uuid REFERENCES wallets (id),
        to_wallet_id uuid NOT NULL REFERENCES wallets (id),
        from_currency stablecoin,
        from_amount bigint CHECK (from_amount > 0),
        to_currency stablecoin NOT NULL,
        to_amount bigint NOT NULL CHECK (to_amount > 0),
        rate numeric(30, 10) NOT NULL CHECK (rate > 0),
        rate_source text NOT NULL CHECK (rate_source IN ('none', 'exchangerate-api', 'currency-api', 'fixed-table')),
        rate_as_of timestamptz,
        fx_snapshot_id uuid REFERENCES fx_snapshots (id),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT transactions_deposit_shape CHECK (type <> 'DEPOSIT' OR (
          from_wallet_id IS NULL AND from_currency IS NULL AND from_amount IS NULL AND rate = 1 AND rate_source = 'none')),
        CONSTRAINT transactions_from_present CHECK (type = 'DEPOSIT' OR (
          from_wallet_id IS NOT NULL AND from_currency IS NOT NULL AND from_amount IS NOT NULL)),
        CONSTRAINT transactions_swap_shape CHECK (type <> 'SWAP' OR (
          from_wallet_id = to_wallet_id AND from_currency <> to_currency)),
        CONSTRAINT transactions_transfer_shape CHECK (type <> 'TRANSFER' OR from_wallet_id <> to_wallet_id),
        CONSTRAINT transactions_same_currency_rate CHECK (from_currency IS NULL OR from_currency <> to_currency OR (
          rate = 1 AND from_amount = to_amount AND rate_source = 'none')),
        CONSTRAINT transactions_priced CHECK (rate_source = 'none' OR (fx_snapshot_id IS NOT NULL AND rate_as_of IS NOT NULL))
      )`);
    await q.query(
      `CREATE INDEX transactions_to_wallet_idx ON transactions (to_wallet_id, created_at DESC, id DESC)`,
    );
    await q.query(
      `CREATE INDEX transactions_from_wallet_idx ON transactions (from_wallet_id, created_at DESC, id DESC)`,
    );

    await q.query(`
      CREATE TABLE ledger_entries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        transaction_id uuid NOT NULL REFERENCES transactions (id),
        wallet_id uuid NOT NULL REFERENCES wallets (id),
        currency stablecoin NOT NULL,
        amount bigint NOT NULL CHECK (amount <> 0),
        balance_after bigint NOT NULL CHECK (balance_after >= 0),
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE INDEX ledger_entries_wallet_idx ON ledger_entries (wallet_id, currency, created_at DESC)`,
    );
    await q.query(
      `CREATE INDEX ledger_entries_transaction_idx ON ledger_entries (transaction_id)`,
    );

    await q.query(`
      CREATE TABLE idempotency_keys (
        account_id uuid NOT NULL REFERENCES accounts (id),
        key text NOT NULL CHECK (key ~ '^[A-Za-z0-9_-]{8,128}$'),
        request_hash sha256 NOT NULL,
        status_code integer,
        response_body jsonb,
        transaction_id uuid REFERENCES transactions (id),
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        PRIMARY KEY (account_id, key)
      )`);
    await q.query(
      `CREATE INDEX idempotency_keys_expires_at_idx ON idempotency_keys (expires_at)`,
    );

    // Money history can only grow, so the database refuses updates, deletes and truncates.
    await q.query(`
      CREATE FUNCTION forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
      END $$`);
    for (const table of ['transactions', 'ledger_entries']) {
      await q.query(
        `CREATE TRIGGER ${table}_append_only BEFORE UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION forbid_change()`,
      );
      await q.query(
        `CREATE TRIGGER ${table}_no_truncate BEFORE TRUNCATE ON ${table} FOR EACH STATEMENT EXECUTE FUNCTION forbid_change()`,
      );
    }
  }

  async down(q: QueryRunner): Promise<void> {
    for (const table of [
      'idempotency_keys',
      'ledger_entries',
      'transactions',
      'fx_snapshots',
      'balances',
      'wallet_keys',
      'wallets',
      'refresh_tokens',
      'sessions',
      'accounts',
    ]) {
      await q.query(`DROP TABLE ${table}`);
    }
    await q.query(`DROP FUNCTION forbid_change()`);
    await q.query(`DROP DOMAIN sha256`);
    await q.query(`DROP DOMAIN stablecoin`);
  }
}
