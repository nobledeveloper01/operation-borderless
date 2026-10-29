import { Global, Module } from '@nestjs/common';
import { AccountsService } from '../accounts/accounts.service.js';
import { AccessTokens } from './access-tokens.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { SessionsService } from './sessions.service.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AccessTokens,
    AccountsService,
    AuthGuard,
    AuthService,
    SessionsService,
  ],
  exports: [AccessTokens, AccountsService, AuthGuard, SessionsService],
})
export class AuthModule {}
