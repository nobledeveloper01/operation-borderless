import { setTimeout as sleep } from 'node:timers/promises';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { returned } from '../../common/database/returned.js';
import { MetricsService } from '../../common/metrics/metrics.service.js';
import { OUTBOX_RETRY } from '../../common/retry/retry.js';
import { Queues } from '../jobs/queues.js';

const BATCH = 500;

// Moves due events from the outbox table into the delivery queue; the table stays the record of truth.
@Injectable()
export class OutboxRelay {
  constructor(
    private readonly db: DataSource,
    private readonly queues: Queues,
    metrics: MetricsService,
  ) {
    metrics.watchAsync(
      'borderless_outbox_pending',
      'Events not yet delivered, including ones waiting to retry.',
      () => this.count('processed_at IS NULL AND failed_at IS NULL'),
    );
    metrics.watchAsync(
      'borderless_outbox_failed',
      'Events that ran out of retries and need an operator.',
      () => this.count('failed_at IS NOT NULL'),
    );
    metrics.watchAsync(
      'borderless_outbox_queue_waiting',
      'Delivery jobs waiting or delayed in the queue.',
      // A scrape never waits more than half a second on Redis.
      async () => {
        const c = await Promise.race([
          this.queues.outbox.getJobCounts('waiting', 'delayed', 'prioritized'),
          sleep(500, undefined, { ref: false }),
        ]);
        return c ? Object.values(c).reduce((a, b) => a + b, 0) : undefined;
      },
    );
  }

  // An event queued but lost (for example while Redis restarted) is queued again after five minutes.
  async relayDue(): Promise<number> {
    let total = 0;
    for (;;) {
      const events = returned<{ id: string }>(
        await this.db.query(
          `UPDATE outbox_events SET queued_at = now()
          WHERE id IN (
            SELECT id FROM outbox_events
             WHERE processed_at IS NULL AND failed_at IS NULL
               AND (queued_at IS NULL OR queued_at < now() - interval '5 minutes')
             ORDER BY created_at
             LIMIT $1 FOR UPDATE SKIP LOCKED)
          RETURNING id`,
          [BATCH],
        ),
      );
      if (events.length === 0) return total;
      // The event ID is the job ID, so the same event is never in the queue twice.
      await this.queues.outbox.addBulk(
        events.map((e) => ({
          name: 'deliver',
          data: { eventId: e.id },
          opts: {
            jobId: e.id,
            attempts: OUTBOX_RETRY.retries + 1,
            backoff: { type: 'custom' },
          },
        })),
      );
      total += events.length;
      if (events.length < BATCH) return total;
    }
  }

  private async count(where: string): Promise<number> {
    const [row] = await this.db.query<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM outbox_events WHERE ${where}`,
    );
    return row?.n ?? 0;
  }
}
