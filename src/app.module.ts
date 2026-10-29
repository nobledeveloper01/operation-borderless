import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { loggerOptions } from './common/http/logger.options.js';
import { outsideGroup } from './common/http/rate-limit-groups.js';
import { SuccessInterceptor } from './common/responses/success.interceptor.js';
import { AppConfigModule } from './common/config/config.module.js';
import { CryptoModule } from './common/crypto/crypto.module.js';
import { MetricsModule } from './common/metrics/metrics.module.js';
import { EnvironmentVariables } from './common/config/env.validation.js';
import { databaseOptions } from './common/database/database.options.js';
import { ACCOUNT_ENTITIES } from './modules/accounts/entities.js';
import { AuthGuard } from './modules/auth/auth.guard.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { DepositsModule } from './modules/deposits/deposits.module.js';
import { FxModule } from './modules/fx/fx.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { IdempotencyModule } from './modules/idempotency/idempotency.module.js';
import { LedgerModule } from './modules/ledger/ledger.module.js';
import { OpsModule } from './modules/ops/ops.module.js';
import { SwapsModule } from './modules/swaps/swaps.module.js';
import { TransactionsModule } from './modules/transactions/transactions.module.js';
import { TransfersModule } from './modules/transfers/transfers.module.js';
import { WalletsModule } from './modules/wallets/wallets.module.js';

@Module({
  imports: [
    AppConfigModule,
    CryptoModule,
    MetricsModule,
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
          skipIf: outsideGroup('auth'),
        },
        // Money writes get their own limit, so one caller can't flood deposits, swaps or transfers.
        {
          name: 'money',
          ttl: 60_000,
          limit: config.MONEY_RATE_LIMIT_PER_MINUTE,
          skipIf: outsideGroup('money'),
        },
      ],
    }),
    TypeOrmModule.forRootAsync({
      inject: [EnvironmentVariables],
      useFactory: (config: EnvironmentVariables) =>
        databaseOptions(config, ACCOUNT_ENTITIES),
    }),
    AuthModule,
    FxModule,
    LedgerModule,
    IdempotencyModule,
    DepositsModule,
    SwapsModule,
    TransfersModule,
    TransactionsModule,
    HealthModule,
    WalletsModule,
    OpsModule,
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
