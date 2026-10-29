import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface Principal {
  accountId: string;
  walletId: string;
  via: 'session' | 'walletKey';
  sessionId: string | null;
  walletKeyId: string | null;
}

export type AuthenticatedRequest = Request & { principal?: Principal };

// Hands a controller the caller the auth guard already identified.
export const Caller = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const principal = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().principal;
    if (!principal)
      throw new Error('Caller used on a route without authentication');
    return principal;
  },
);
