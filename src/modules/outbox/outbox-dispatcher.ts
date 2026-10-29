import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EnvironmentVariables } from '../../common/config/env.validation.js';
import { MetricsService } from '../../common/metrics/metrics.service.js';
import { fullJitterDelay, OUTBOX_RETRY } from '../../common/retry/retry.js';
import {
  NotificationsHandler,
  type OutboxEvent,
} from './notifications.handler.js';

const POLL_EVERY_MS = 1_000;
const BATCH = 50;

interface Claimed extends OutboxEvent {
  attempts: number;
}

// Delivers events at least once; SKIP LOCKED lets several workers share the queue without doubling work.
@Injectable()
export class OutboxDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcher.name);
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;
  private running: Promise<number> | undefined;

  constructor(
    private readonly db: DataSource,
    private readonly handler: NotificationsHandler,
    private readonly metrics: MetricsService,
    private readonly config: EnvironmentVariables,
  ) {
    metrics.watchAsync(
      'borderless_outbox_pending',
      'Events waiting to be delivered, including ones waiting to retry.',
      () => this.count('processed_at IS NULL AND failed_at IS NULL'),
    );
    metrics.watchAsync(
      'borderless_outbox_failed',
      'Events that ran out of retries and need an operator.',
      () => this.count('failed_at IS NOT NULL'),
    );
  }

  onModuleInit(): void {
    if (this.config.OUTBOX_DISPATCH_ENABLED) this.schedule();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
  }

  private schedule(): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      void this.drain().finally(() => this.schedule());
    }, POLL_EVERY_MS);
    this.timer.unref();
  }

  // Delivers every event that is due, batch by batch, and returns how many it handled.
  drain(): Promise<number> {
    this.running ??= this.drainAll().finally(() => (this.running = undefined));
    return this.running;
  }

  private async drainAll(): Promise<number> {
    let total = 0;
    for (;;) {
      const done = await this.deliverBatch().catch((error: unknown) => {
        this.logger.warn(
          { reason: (error as Error).message },
          'Outbox batch failed',
        );
        return 0;
      });
      total += done;
      if (done < BATCH || this.stopped) return total;
    }
  }

  // Each event is handled and marked in its own savepoint, so one bad event can't block the rest.
  private deliverBatch(): Promise<number> {
    return this.db.transaction(async (manager) => {
      const events = await manager.query<Claimed[]>(
        `SELECT id, type, wallet_id, payload, attempts, created_at FROM outbox_events
          WHERE processed_at IS NULL AND failed_at IS NULL AND available_at <= now()
          ORDER BY available_at, created_at
          LIMIT $1 FOR UPDATE SKIP LOCKED`,
        [BATCH],
      );
      for (const event of events) {
        await manager.query('SAVEPOINT event');
        try {
          await this.handler.handle(manager, event);
          await manager.query(
            'UPDATE outbox_events SET processed_at = now(), attempts = attempts + 1, last_error = NULL WHERE id = $1',
            [event.id],
          );
          await manager.query('RELEASE SAVEPOINT event');
          this.metrics.outboxDelivered.inc({ type: event.type });
        } catch (error) {
          await manager.query('ROLLBACK TO SAVEPOINT event');
          await this.markFailedAttempt(manager, event, error);
        }
      }
      return events.length;
    });
  }

  private async markFailedAttempt(
    manager: { query: DataSource['query'] },
    event: Claimed,
    error: unknown,
  ): Promise<void> {
    const attempts = event.attempts + 1;
    const reason = (error as Error).message.slice(0, 500);
    if (attempts > OUTBOX_RETRY.retries) {
      await manager.query(
        'UPDATE outbox_events SET attempts = $2, last_error = $3, failed_at = now() WHERE id = $1',
        [event.id, attempts, reason],
      );
      this.metrics.outboxFailures.inc({ type: event.type, final: 'true' });
      this.logger.error(
        { eventId: event.id, type: event.type, attempts, reason },
        'Outbox event gave up',
      );
      return;
    }
    const delayMs = Math.round(fullJitterDelay(attempts, OUTBOX_RETRY));
    await manager.query(
      `UPDATE outbox_events SET attempts = $2, last_error = $3,
              available_at = now() + make_interval(secs => $4::double precision / 1000)
        WHERE id = $1`,
      [event.id, attempts, reason, delayMs],
    );
    this.metrics.outboxFailures.inc({ type: event.type, final: 'false' });
    this.logger.warn(
      { eventId: event.id, type: event.type, attempts, delayMs, reason },
      'Outbox event will be retried',
    );
  }

  private async count(where: string): Promise<number> {
    const [row] = await this.db.query<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM outbox_events WHERE ${where}`,
    );
    return row?.n ?? 0;
  }
}
