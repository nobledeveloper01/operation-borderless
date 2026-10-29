import type { MigrationInterface, QueryRunner } from 'typeorm';

export class KeepReplayKeyOrder1793290000000 implements MigrationInterface {
  name = 'KeepReplayKeyOrder1793290000000';

  // jsonb sorts object keys, so a replayed answer came back reordered; json keeps the text as written.
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE idempotency_keys ALTER COLUMN response_body TYPE json USING response_body::json`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE idempotency_keys ALTER COLUMN response_body TYPE jsonb USING response_body::jsonb`,
    );
  }
}
