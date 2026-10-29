import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { EnvironmentVariables } from '../config/env.validation.js';
import { createRedis, FAST_FAIL, REDIS } from './redis.js';

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [EnvironmentVariables],
      useFactory: (config: EnvironmentVariables) =>
        createRedis(config.REDIS_URL, FAST_FAIL, 'shared'),
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RedisModule.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  // The API starts even when Redis is down; reads keep working and money routes wait for it.
  async onModuleInit(): Promise<void> {
    try {
      await this.redis.connect();
    } catch (error) {
      this.logger.warn(
        { reason: (error as Error).message },
        'Started without Redis',
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}
