import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQuotes1793310000000 implements MigrationInterface {
  name = 'AddQuotes1793310000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE fx_quotes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id uuid NOT NULL REFERENCES accounts (id),
        from_currency stablecoin NOT NULL,
        to_currency stablecoin NOT NULL,
        amount bigint NOT NULL CHECK (amount > 0),
        rate numeric(30, 10) NOT NULL CHECK (rate > 0),
        rate_source text NOT NULL,
        rate_as_of timestamptz,
        fx_snapshot_id uuid REFERENCES fx_snapshots (id),
        fee_bps integer NOT NULL CHECK (fee_bps BETWEEN 0 AND 1000),
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        CHECK (expires_at > created_at)
      )`);
    await q.query(
      `CREATE INDEX fx_quotes_expires_at_idx ON fx_quotes (expires_at)`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE fx_quotes`);
  }
}
