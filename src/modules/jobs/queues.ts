import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { EnvironmentVariables } from '../../common/config/env.validation.js';
import { createRedis, FOR_QUEUES } from '../../common/redis/redis.js';

export const JOBS_QUEUE = 'jobs';
export const OUTBOX_QUEUE = 'outbox';

// Closing never waits more than two seconds, so a dead Redis can't hold up shutdown.
export const closeQuietly = (work: Promise<unknown>) =>
  Promise.race([
    work.catch(() => undefined),
    new Promise((r) => setTimeout(r, 2_000).unref()),
  ]);

// The queues every role can add to and count; only the worker role processes them.
@Injectable()
export class Queues implements OnApplicationShutdown {
  private readonly logger = new Logger(Queues.name);
  readonly connection: Redis;
  readonly prefix: string;
  readonly jobs: Queue;
  readonly outbox: Queue;

  constructor(config: EnvironmentVariables) {
    this.connection = createRedis(config.REDIS_URL, FOR_QUEUES, 'queues');
    this.prefix = `${config.QUEUE_PREFIX}:bull`;
    const options = { connection: this.connection, prefix: this.prefix };
    this.jobs = new Queue(JOBS_QUEUE, {
      ...options,
      defaultJobOptions: { removeOnComplete: 100, removeOnFail: 500 },
    });
    this.outbox = new Queue(OUTBOX_QUEUE, {
      ...options,
      defaultJobOptions: { removeOnComplete: 1_000, removeOnFail: 5_000 },
    });
    for (const queue of [this.jobs, this.outbox])
      queue.on('error', (error) =>
        this.logger.warn(
          { queue: queue.name, reason: error.message },
          'Queue error',
        ),
      );
  }

  async onApplicationShutdown(): Promise<void> {
    await closeQuietly(Promise.all([this.jobs.close(), this.outbox.close()]));
    this.connection.disconnect();
  }
}
