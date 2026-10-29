import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOutbox1793320000000 implements MigrationInterface {
  name = 'AddOutbox1793320000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE outbox_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        type text NOT NULL CHECK (type IN ('deposit.completed', 'swap.completed', 'transfer.sent', 'transfer.received', 'balance.low')),
        wallet_id uuid NOT NULL REFERENCES wallets (id),
        transaction_id uuid NOT NULL REFERENCES transactions (id),
        payload json NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        available_at timestamptz NOT NULL DEFAULT now(),
        attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        last_error text,
        processed_at timestamptz,
        failed_at timestamptz,
        CHECK (processed_at IS NULL OR failed_at IS NULL)
      )`);
    await q.query(
      `CREATE INDEX outbox_events_due_idx ON outbox_events (available_at) WHERE processed_at IS NULL AND failed_at IS NULL`,
    );
    await q.query(`
      CREATE TABLE notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_id uuid NOT NULL REFERENCES wallets (id),
        event_id uuid NOT NULL UNIQUE REFERENCES outbox_events (id),
        kind text NOT NULL,
        title text NOT NULL,
        body text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        read_at timestamptz
      )`);
    await q.query(
      `CREATE INDEX notifications_wallet_idx ON notifications (wallet_id, created_at DESC, id DESC)`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE notifications`);
    await q.query(`DROP TABLE outbox_events`);
  }
}
