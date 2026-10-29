import { Inject, Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { EnvironmentVariables } from '../config/env.validation.js';
import { REDIS, RedisUnavailable } from '../redis/redis.js';

// One round trip counts the hit, starts the window and blocks past the limit, so parallel requests can't race.
const INCREMENT = `
local blocked = redis.call('PTTL', KEYS[2])
if blocked > 0 then
  local hits = tonumber(redis.call('GET', KEYS[1]) or '0')
  return {hits, math.max(redis.call('PTTL', KEYS[1]), 0), 1, blocked}
end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if hits > tonumber(ARGV[2]) and tonumber(ARGV[3]) > 0 then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return {hits, ttl, 1, tonumber(ARGV[3])}
end
return {hits, ttl, 0, 0}
`;

const seconds = (ms: number) => Math.max(0, Math.ceil(ms / 1000));

// Every API instance counts in the same Redis, so a client gets one limit however many instances run.
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly prefix: string;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    config: EnvironmentVariables,
  ) {
    this.prefix = `${config.QUEUE_PREFIX}:throttle:`;
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
  ) {
    let reply: [number, number, number, number];
    try {
      reply = (await this.redis.eval(
        INCREMENT,
        2,
        `${this.prefix}${key}`,
        `${this.prefix}${key}:blocked`,
        ttl,
        limit,
        blockDuration,
      )) as [number, number, number, number];
    } catch (error) {
      throw new RedisUnavailable((error as Error).message);
    }
    const [totalHits, ttlMs, blocked, blockMs] = reply;
    return {
      totalHits,
      timeToExpire: seconds(ttlMs),
      isBlocked: blocked === 1,
      timeToBlockExpire: seconds(blockMs),
    };
  }
}
