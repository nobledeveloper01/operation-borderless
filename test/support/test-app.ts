import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import {
  EnvironmentVariables,
  validateEnv,
} from '../../src/config/env.validation.js';

// Builds the real app (same pipeline as main.ts) with optional env overrides.
export async function createTestApp(
  env: Record<string, string> = {},
): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EnvironmentVariables)
    .useValue(validateEnv({ ...process.env, ...env }))
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bufferLogs: true,
  });
  configureApp(app);
  await app.init();
  return app;
}
