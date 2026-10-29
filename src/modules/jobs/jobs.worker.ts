import {
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { type Job, Worker } from 'bullmq';
import { EnvironmentVariables } from '../../common/config/env.validation.js';
import { fullJitterDelay, OUTBOX_RETRY } from '../../common/retry/retry.js';
import { createRedis, FOR_QUEUES } from '../../common/redis/redis.js';
import { IdempotencyService } from '../idempotency/idempotency.service.js';
import { LedgerCheckService } from '../ops/ledger-check.service.js';
import { OutboxDelivery } from '../outbox/outbox-delivery.js';
import { OutboxRelay } from '../outbox/outbox-relay.js';
import { QuotesService } from '../quotes/quotes.service.js';
import { FxRefreshJob } from './fx-refresh.job.js';
import { closeQuietly, JOBS_QUEUE, OUTBOX_QUEUE, Queues } from './queues.js';

interface Schedule {
  id: string;
  everyMs: number;
  enabled: boolean;
  run: () => Promise<unknown>;
}

const HOUR = 3_600_000;

// Runs only in the worker role: one scheduler per job across all workers, and the event deliveries.
@Injectable()
export class JobsWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(JobsWorker.name);
  private readonly workers: Worker[] = [];
  private heartbeat: NodeJS.Timeout | undefined;

  constructor(
    private readonly queues: Queues,
    private readonly config: EnvironmentVariables,
    private readonly fxRefresh: FxRefreshJob,
    private readonly ledger: LedgerCheckService,
    private readonly idempotency: IdempotencyService,
    private readonly quotes: QuotesService,
    private readonly relay: OutboxRelay,
    private readonly delivery: OutboxDelivery,
  ) {}

  private schedules(): Schedule[] {
    const jobs = this.config.JOBS_ENABLED;
    return [
      {
        id: 'fx-refresh',
        everyMs: 60_000,
        enabled: jobs && this.config.FX_REFRESH_ENABLED,
        run: () => this.fxRefresh.tick(),
      },
      {
        id: 'ledger-check',
        everyMs: HOUR,
        enabled: jobs,
        run: () => this.ledger.runScheduled(),
      },
      {
        id: 'idempotency-cleanup',
        everyMs: HOUR,
        enabled: jobs,
        run: () => this.idempotency.removeExpired(),
      },
      {
        id: 'quote-cleanup',
        everyMs: HOUR,
        enabled: jobs,
        run: () => this.quotes.removeExpired(),
      },
      {
        id: 'outbox-relay',
        everyMs: 1_000,
        enabled: this.config.OUTBOX_DISPATCH_ENABLED,
        run: () => this.relay.relayDue(),
      },
    ];
  }

  onModuleInit(): void {
    if (this.config.APP_ROLE === 'api') return;
    const schedules = this.schedules();
    const byId = new Map(schedules.map((s) => [s.id, s]));
    // Queue commands wait for Redis, so they run in the background and never hold up startup.
    void this.setUpSchedules(schedules);
    this.startWorkers(byId);
  }

  private async setUpSchedules(schedules: Schedule[]): Promise<void> {
    const fx = schedules.find((s) => s.id === 'fx-refresh');
    try {
      for (const s of schedules) {
        // Upserting the same scheduler from every worker still leaves one; a switched-off job is removed.
        if (s.enabled)
          await this.queues.jobs.upsertJobScheduler(
            s.id,
            { every: s.everyMs },
            { name: s.id },
          );
        else await this.queues.jobs.removeJobScheduler(s.id);
      }
      // The first FX check runs at once, so a fresh stack has rates without waiting a minute.
      if (fx?.enabled) await this.queues.jobs.add('fx-refresh', {});
    } catch (error) {
      this.logger.warn(
        { reason: (error as Error).message },
        'Could not set up the job schedules',
      );
    }
  }

  private startWorkers(byId: Map<string, Schedule>): void {
    const connection = createRedis(this.config.REDIS_URL, FOR_QUEUES, 'worker');
    const options = { connection, prefix: this.queues.prefix };
    this.workers.push(
      new Worker(JOBS_QUEUE, (job: Job) => this.run(byId, job), {
        ...options,
        concurrency: 1,
      }),
      new Worker(
        OUTBOX_QUEUE,
        (job: Job<{ eventId: string }>) =>
          this.delivery.deliver(job.data.eventId),
        {
          ...options,
          concurrency: 20,
          settings: {
            backoffStrategy: (attempts: number) =>
              Math.round(
                fullJitterDelay(attempts, {
                  ...OUTBOX_RETRY,
                  baseDelayMs: this.config.OUTBOX_RETRY_BASE_MS,
                }),
              ),
          },
        },
      ),
    );
    const outbox = this.workers[1] as Worker<{ eventId: string }>;
    outbox.on('failed', (job, error) => {
      if (job)
        void this.delivery.recordFailure(
          job.data.eventId,
          job.attemptsMade,
          error,
          job.attemptsMade >= (job.opts.attempts ?? 1),
        );
    });
    for (const worker of this.workers)
      worker.on('error', (error) =>
        this.logger.warn(
          { queue: worker.name, reason: error.message },
          'Worker error',
        ),
      );

    // A heartbeat in Redis lets the container health check see that this worker is alive.
    const beat = () =>
      void connection
        .set(
          `${this.config.QUEUE_PREFIX}:worker:${process.env.HOSTNAME ?? process.pid}`,
          String(Date.now()),
          'EX',
          30,
        )
        .catch(() => undefined);
    beat();
    this.heartbeat = setInterval(beat, 10_000);
    this.heartbeat.unref();
  }

  private async run(byId: Map<string, Schedule>, job: Job): Promise<unknown> {
    const schedule = byId.get(job.name);
    if (!schedule) throw new Error(`No job called ${job.name}`);
    return schedule.run();
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.heartbeat);
    await closeQuietly(Promise.all(this.workers.map((w) => w.close())));
  }
}
