import { Global, Module } from '@nestjs/common';
import { EnvironmentVariables, validateEnv } from './env.validation.js';

// The validated environment, injected by its class so tests can override it.
@Global()
@Module({
  providers: [
    {
      provide: EnvironmentVariables,
      useFactory: () => validateEnv(process.env),
    },
  ],
  exports: [EnvironmentVariables],
})
export class AppConfigModule {}
