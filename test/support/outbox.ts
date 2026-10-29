import type { NestExpressApplication } from '@nestjs/platform-express';
import { setTimeout as sleep } from 'node:timers/promises';
import { Queues } from '../../src/modules/jobs/queues.js';
import { OutboxRelay } from '../../src/modules/outbox/outbox-relay.js';

// Relays due events into the real queue and waits until its worker has delivered or parked them all.
export async function deliverOutbox(
  app: NestExpressApplication,
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
    if (Object.values(counts).every((n) => n === 0)) return;
    if (Date.now() > end)
      throw new Error(`Outbox still busy: ${JSON.stringify(counts)}`);
    await sleep(20);
  }
}
