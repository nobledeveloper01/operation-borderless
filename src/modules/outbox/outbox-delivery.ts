import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MetricsService } from '../../common/metrics/metrics.service.js';
import {
  NotificationsHandler,
  type OutboxEvent,
} from './notifications.handler.js';

// Delivers one event in its own transaction; the handler is idempotent, so a repeat is harmless.
@Injectable()
export class OutboxDelivery {
  private readonly logger = new Logger(OutboxDelivery.name);

  constructor(
    private readonly db: DataSource,
    private readonly handler: NotificationsHandler,
    private readonly metrics: MetricsService,
  ) {}

  async deliver(eventId: string): Promise<'delivered' | 'already-done'> {
    return this.db.transaction(async (manager) => {
      const [event] = await manager.query<
        (OutboxEvent & { attempts: number })[]
      >(
        `SELECT id, type, wallet_id, payload, attempts, created_at FROM outbox_events
          WHERE id = $1 AND processed_at IS NULL AND failed_at IS NULL FOR UPDATE`,
        [eventId],
      );
      if (!event) return 'already-done';
      await this.handler.handle(manager, event);
      await manager.query(
        'UPDATE outbox_events SET processed_at = now(), attempts = attempts + 1, last_error = NULL WHERE id = $1',
        [eventId],
      );
      this.metrics.outboxDelivered.inc({ type: event.type });
      return 'delivered';
    });
  }

  // Called by the queue after each failed try; after the last one the event is parked for an operator.
  async recordFailure(
    eventId: string,
    attempts: number,
    error: Error,
    final: boolean,
  ): Promise<void> {
    const reason = error.message.slice(0, 500);
    try {
      await this.db.query(
        `UPDATE outbox_events SET attempts = $2, last_error = $3, failed_at = CASE WHEN $4 THEN now() END
          WHERE id = $1 AND processed_at IS NULL`,
        [eventId, attempts, reason, final],
      );
    } catch (dbError) {
      this.logger.warn(
        { eventId, reason: (dbError as Error).message },
        'Could not record a failed delivery',
      );
    }
    this.metrics.outboxFailures.inc({ type: 'event', final: String(final) });
    if (final)
      this.logger.error({ eventId, attempts, reason }, 'Outbox event gave up');
  }
}
