import { type ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerRequest } from '@nestjs/throttler';
import { AppError } from '../errors/app-error.js';
import { RedisUnavailable } from '../redis/redis.js';
import { RATE_LIMIT_GROUP } from './rate-limit-groups.js';

// Without Redis the limit can't be counted: reads stay open, money and sign-in routes wait.
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  private readonly log = new Logger(AppThrottlerGuard.name);
  private lastWarned = 0;

  protected override async handleRequest(
    props: ThrottlerRequest,
  ): Promise<boolean> {
    try {
      return await super.handleRequest(props);
    } catch (error) {
      if (!(error instanceof RedisUnavailable)) throw error;
      if (guarded(props.context)) {
        throw new AppError(
          'SERVICE_BUSY',
          'Rate limiting is unavailable, so money and sign-in routes are paused. Try again shortly.',
        );
      }
      if (Date.now() - this.lastWarned > 10_000) {
        this.lastWarned = Date.now();
        this.log.warn(
          'Rate limiting is unavailable; letting a read through without a limit',
        );
      }
      return true;
    }
  }
}

function guarded(context: ExecutionContext): boolean {
  return (
    Reflect.getMetadata(RATE_LIMIT_GROUP, context.getHandler()) !== undefined
  );
}
