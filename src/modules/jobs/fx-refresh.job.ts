import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { CLOCK, type Clock } from '../../common/clock.js';
import { EnvironmentVariables } from '../../common/config/env.validation.js';
import { REDIS } from '../../common/redis/redis.js';
import { FxService } from '../fx/fx.service.js';

const LOCK_MS = 120_000;

// Checked every minute by one worker; it refreshes only when the schedule in Redis says it's due.
// Deletes the lock only if this run still owns it, so a slow run can't free another run's lock.
const RELEASE = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`;

@Injectable()
export class FxRefreshJob {
  private readonly nextAtKey: string;
  private readonly lockKey: string;
  readonly channel: string;

  constructor(
    private readonly fx: FxService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CLOCK) private readonly now: Clock,
    config: EnvironmentVariables,
  ) {
    this.nextAtKey = `${config.QUEUE_PREFIX}:fx:next-at`;
    this.lockKey = `${config.QUEUE_PREFIX}:fx:lock`;
    this.channel = `${config.QUEUE_PREFIX}:fx:updated`;
  }

  async tick(): Promise<'refreshed' | 'not-due' | 'busy'> {
    const dueAt = Number((await this.redis.get(this.nextAtKey)) ?? 0);
    if (dueAt > this.now().getTime()) return 'not-due';
    // The lock stops two workers that both saw "due" from calling the providers twice.
    const owner = randomUUID();
    if (!(await this.redis.set(this.lockKey, owner, 'PX', LOCK_MS, 'NX')))
      return 'busy';
    try {
      const outcome = await this.fx.refresh();
      const nextAt = this.now().getTime() + this.fx.nextDelay(outcome);
      await this.redis.set(this.nextAtKey, String(nextAt));
      // API instances keep rates in memory, so they are told to reload them.
      if (outcome.kind !== 'failed')
        await this.redis.publish(this.channel, String(nextAt));
      return 'refreshed';
    } finally {
      await this.redis.eval(RELEASE, 1, this.lockKey, owner);
    }
  }
}
