import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { CLOCK, type Clock } from '../../src/common/clock.js';
import {
  EnvironmentVariables,
  validateEnv,
} from '../../src/config/env.validation.js';
import {
  FX_PROVIDERS,
  type FxProvider,
} from '../../src/fx/providers/fx-provider.js';

export interface TestAppOptions {
  // Fake FX providers in primary-then-secondary order; without them the real adapters are wired but never called.
  fxProviders?: FxProvider[];
  clock?: Clock;
}

// Builds the real app (same pipeline as main.ts) with optional env overrides.
export async function createTestApp(
  env: Record<string, string> = {},
  options: TestAppOptions = {},
): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EnvironmentVariables)
    .useValue(validateEnv({ ...process.env, ...env }));
  if (options.fxProviders)
    builder = builder
      .overrideProvider(FX_PROVIDERS)
      .useValue(options.fxProviders);
  if (options.clock)
    builder = builder.overrideProvider(CLOCK).useValue(options.clock);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bufferLogs: true,
    bodyParser: false,
  });
  configureApp(app);
  // A real port lets many parallel supertest calls share one server.
  await app.listen(0, '127.0.0.1');
  return app;
}
