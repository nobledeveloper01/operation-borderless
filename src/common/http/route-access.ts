import { SetMetadata } from '@nestjs/common';

export const ACCESS = 'auth:access';

// "public" needs no credentials, "any" takes a session or a wallet key, "session" refuses wallet keys, "ops" takes only the operator token.
export type Access = 'public' | 'any' | 'session' | 'ops';

export const RouteAccess = (access: Access) => SetMetadata(ACCESS, access);
