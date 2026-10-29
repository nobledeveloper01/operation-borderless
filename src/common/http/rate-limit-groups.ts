import { type ExecutionContext, SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_GROUP = 'rate:group';

// Routes in a group get that group's tighter per-minute limit on top of the global one.
export type RateLimitGroup = 'auth' | 'money';

export const RateLimited = (group: RateLimitGroup) =>
  SetMetadata(RATE_LIMIT_GROUP, group);

export const outsideGroup =
  (group: RateLimitGroup) => (context: ExecutionContext) =>
    Reflect.getMetadata(RATE_LIMIT_GROUP, context.getHandler()) !== group;
