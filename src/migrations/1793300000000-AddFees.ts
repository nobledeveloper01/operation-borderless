import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFees1793300000000 implements MigrationInterface {
  name = 'AddFees1793300000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE transactions
        ADD COLUMN fee_bps integer NOT NULL DEFAULT 0 CHECK (fee_bps BETWEEN 0 AND 1000),
        ADD COLUMN fee_amount bigint NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
        ADD COLUMN rounding_amount bigint NOT NULL DEFAULT 0 CHECK (rounding_amount >= 0),
        ADD CONSTRAINT transactions_deposit_free CHECK (type <> 'DEPOSIT' OR (fee_bps = 0 AND fee_amount = 0 AND rounding_amount = 0)),
        ADD CONSTRAINT transactions_fee_below_amount CHECK (from_amount IS NULL OR fee_amount + rounding_amount < from_amount)`);
    // The platform account has no balance row, so collecting fees never makes conversions queue on one hot lock.
    await q.query(`
      CREATE TABLE platform_entries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        transaction_id uuid NOT NULL REFERENCES transactions (id),
        currency stablecoin NOT NULL,
        kind text NOT NULL CHECK (kind IN ('fee', 'rounding')),
        amount bigint NOT NULL CHECK (amount > 0),
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (transaction_id, kind)
      )`);
    await q.query(
      `CREATE INDEX platform_entries_currency_idx ON platform_entries (currency, kind)`,
    );
    await q.query(
      `CREATE TRIGGER platform_entries_append_only BEFORE UPDATE OR DELETE ON platform_entries FOR EACH ROW EXECUTE FUNCTION forbid_change()`,
    );
    await q.query(
      `CREATE TRIGGER platform_entries_no_truncate BEFORE TRUNCATE ON platform_entries FOR EACH STATEMENT EXECUTE FUNCTION forbid_change()`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE platform_entries`);
    await q.query(`
      ALTER TABLE transactions
        DROP CONSTRAINT transactions_fee_below_amount,
        DROP CONSTRAINT transactions_deposit_free,
        DROP COLUMN rounding_amount,
        DROP COLUMN fee_amount,
        DROP COLUMN fee_bps`);
  }
}
