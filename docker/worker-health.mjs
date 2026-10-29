// Container health check for the worker role: healthy while its heartbeat in Redis is fresh.
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  connectTimeout: 2000,
});
const key = `${process.env.QUEUE_PREFIX ?? 'borderless'}:worker:${process.env.HOSTNAME}`;
try {
  await redis.connect();
  const beat = Number(await redis.get(key));
  process.exitCode = Date.now() - beat < 30_000 ? 0 : 1;
} catch {
  process.exitCode = 1;
} finally {
  redis.disconnect();
}
