import { SetMetadata } from '@nestjs/common';

export const ACCESS = 'auth:access';
export const AUTH_RATE_LIMITED = 'auth:rate-limited';

// "public" needs no credentials, "any" takes a session or a wallet key, "session" refuses wallet keys.
export type Access = 'public' | 'any' | 'session';

export const RouteAccess = (access: Access) => SetMetadata(ACCESS, access);

export const AuthRateLimited = () => SetMetadata(AUTH_RATE_LIMITED, true);
