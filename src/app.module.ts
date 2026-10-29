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
import { HealthModule } from './health/health.module.js';

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
      ],
    }),
    TypeOrmModule.forRootAsync({
      inject: [EnvironmentVariables],
      useFactory: databaseOptions,
    }),
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: SuccessInterceptor },
  ],
})
export class AppModule {}
