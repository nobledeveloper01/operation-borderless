import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { EnvironmentVariables } from './common/config/env.validation.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  bufferLogs: true,
  bodyParser: false,
});
configureApp(app);
app.enableShutdownHooks();
await app.listen(app.get(EnvironmentVariables).PORT, '0.0.0.0');
