import { Global, Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock.js';
import { EnvironmentVariables, validateEnv } from './env.validation.js';

// Settings are checked once at startup and injected by class, which also lets tests swap them and the clock.
@Global()
@Module({
  providers: [
    {
      provide: EnvironmentVariables,
      useFactory: () => validateEnv(process.env),
    },
    { provide: CLOCK, useValue: systemClock },
  ],
  exports: [EnvironmentVariables, CLOCK],
})
export class AppConfigModule {}
