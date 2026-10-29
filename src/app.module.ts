import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { loggerOptions } from './common/http/logger.options.js';
import { SuccessInterceptor } from './common/responses/success.interceptor.js';
import { AppConfigModule } from './config/config.module.js';
import { CryptoModule } from './crypto/crypto.module.js';
import { EnvironmentVariables } from './config/env.validation.js';
import { databaseOptions } from './database/database.options.js';
import { AUTH_RATE_LIMITED } from './auth/access.decorators.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { HealthModule } from './health/health.module.js';
import { WalletsModule } from './wallets/wallets.module.js';

@Module({
  imports: [
    AppConfigModule,
    CryptoModule,
    LoggerModule.forRootAsync({
      inject: [EnvironmentVariables],
      useFactory: loggerOptions,
    }),
    ThrottlerModule.forRootAsync({
      inject: [EnvironmentVariables],
      useFactory: (config: EnvironmentVariables) => [
        { name: 'default', ttl: 60_000, limit: config.RATE_LIMIT_PER_MINUTE },
        // A tighter limit only on sign-up, login and refresh, where guessing passwords happens.
        {
          name: 'auth',
          ttl: 60_000,
          limit: config.AUTH_RATE_LIMIT_PER_MINUTE,
          skipIf: (context) =>
            Reflect.getMetadata(AUTH_RATE_LIMITED, context.getHandler()) !==
            true,
        },
      ],
    }),
    TypeOrmModule.forRootAsync({
      inject: [EnvironmentVariables],
      useFactory: databaseOptions,
    }),
    AuthModule,
    HealthModule,
    WalletsModule,
  ],
  providers: [
    // Guards run in this order, so the rate limit applies before any credential is checked.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: SuccessInterceptor },
  ],
})
export class AppModule {}
