import { Global, Module } from '@nestjs/common';
import { EnvironmentVariables, validateEnv } from './env.validation.js';

// Settings are checked once at startup and injected by class, which also lets tests swap them.
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
