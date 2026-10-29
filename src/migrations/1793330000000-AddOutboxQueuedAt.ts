import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOutboxQueuedAt1793330000000 implements MigrationInterface {
  name = 'AddOutboxQueuedAt1793330000000';

  // When the relay last put the event in the delivery queue, so a lost job can be queued again.
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE outbox_events ADD COLUMN queued_at timestamptz`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE outbox_events DROP COLUMN queued_at`);
  }
}
