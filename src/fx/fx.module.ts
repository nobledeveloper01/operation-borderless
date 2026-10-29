import { Global, Module } from '@nestjs/common';
import { EnvironmentVariables } from '../config/env.validation.js';
import { FxSnapshotsRepository } from './fx-snapshots.repository.js';
import { FxController } from './fx.controller.js';
import { FxService } from './fx.service.js';
import { CurrencyApiProvider } from './providers/currency-api.provider.js';
import { ExchangeRateApiProvider } from './providers/exchangerate-api.provider.js';
import { FX_PROVIDERS } from './providers/fx-provider.js';

@Global()
@Module({
  controllers: [FxController],
  providers: [
    FxService,
    FxSnapshotsRepository,
    {
      // Order matters: the first provider is the primary, the second the fallback.
      provide: FX_PROVIDERS,
      inject: [EnvironmentVariables],
      useFactory: (config: EnvironmentVariables) => [
        new ExchangeRateApiProvider(
          config.FX_PRIMARY_URL,
          config.FX_TIMEOUT_MS,
        ),
        new CurrencyApiProvider(config.FX_SECONDARY_URL, config.FX_TIMEOUT_MS),
      ],
    },
  ],
  exports: [FxService],
})
export class FxModule {}
