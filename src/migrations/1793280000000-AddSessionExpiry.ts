import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSessionExpiry1793280000000 implements MigrationInterface {
  name = 'AddSessionExpiry1793280000000';

  // Existing sessions get the default 90 days from when they started, so nobody is signed out by the deploy.
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE sessions ADD COLUMN expires_at timestamptz`);
    await q.query(
      `UPDATE sessions SET expires_at = created_at + interval '90 days'`,
    );
    await q.query(`ALTER TABLE sessions ALTER COLUMN expires_at SET NOT NULL`);
    await q.query(
      `ALTER TABLE sessions ADD CONSTRAINT sessions_expiry_after_start CHECK (expires_at > created_at)`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE sessions DROP COLUMN expires_at`);
  }
}
