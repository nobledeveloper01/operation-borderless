import type { NestExpressApplication } from '@nestjs/platform-express';
import { setTimeout as sleep } from 'node:timers/promises';
import { DataSource } from 'typeorm';
import { returned } from '../../src/common/database/returned.js';
import { Queues } from '../../src/modules/jobs/queues.js';
import { OutboxRelay } from '../../src/modules/outbox/outbox-relay.js';

// Relays due events into the real queue and waits until its worker has delivered or parked them all.
// Test files share one database but not one queue, so with a wallet it takes back that wallet's events another file's relay claimed.
export async function deliverOutbox(
  app: NestExpressApplication,
  walletId?: string,
  timeoutMs = 15_000,
): Promise<void> {
  const relay = app.get(OutboxRelay);
  const queue = app.get(Queues).outbox;
  const end = Date.now() + timeoutMs;
  for (;;) {
    await relay.relayDue();
    const counts = await queue.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'prioritized',
    );
    if (Object.values(counts).every((n) => n === 0)) {
      if (!walletId) return;
      const strays = returned(
        await app.get(DataSource).query(
          `UPDATE outbox_events SET queued_at = NULL
            WHERE wallet_id = $1 AND processed_at IS NULL AND failed_at IS NULL AND queued_at IS NOT NULL
            RETURNING id`,
          [walletId],
        ),
      );
      if (strays.length === 0) return;
    }
    if (Date.now() > end)
      throw new Error(`Outbox still busy: ${JSON.stringify(counts)}`);
    await sleep(20);
  }
}
