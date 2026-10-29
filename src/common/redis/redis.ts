import { Logger } from '@nestjs/common';
import { Redis, type RedisOptions } from 'ioredis';
import { fullJitterDelay } from '../retry/retry.js';

export const REDIS = Symbol('REDIS');

// Thrown when Redis can't answer in time, so callers can decide to fail open or closed.
export class RedisUnavailable extends Error {
  override name = 'RedisUnavailable';
}

const RECONNECT = { retries: Infinity, baseDelayMs: 100, maxDelayMs: 5_000 };

// Commands fail within half a second while Redis is away, instead of queueing up behind it.
export const FAST_FAIL: RedisOptions = {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  commandTimeout: 500,
  connectTimeout: 2_000,
  retryStrategy: (times) => Math.round(fullJitterDelay(times, RECONNECT)),
};

// BullMQ workers block on Redis on purpose, so they keep the client's defaults for retries.
export const FOR_QUEUES: RedisOptions = {
  maxRetriesPerRequest: null,
  connectTimeout: 2_000,
  retryStrategy: (times) => Math.round(fullJitterDelay(times, RECONNECT)),
};

export function createRedis(
  url: string,
  options: RedisOptions,
  name: string,
): Redis {
  const logger = new Logger(`Redis:${name}`);
  const client = new Redis(url, options);
  let lastWarned = 0;
  // An unhandled error event would crash the process, so each one is logged at most every 10 s.
  client.on('error', (error: Error) => {
    if (Date.now() - lastWarned < 10_000) return;
    lastWarned = Date.now();
    logger.warn({ reason: error.message }, 'Redis is not answering');
  });
  return client;
}
