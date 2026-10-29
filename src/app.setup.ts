import { type INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  DocumentBuilder,
  type OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { EnvironmentVariables } from './config/env.validation.js';

export const API_PREFIX = 'api/v1';

export function buildOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Borderless API')
    .setDescription(
      'Multi-currency stablecoin wallet sandbox: wallets, deposits, swaps, transfers and FX rates.',
    )
    .setVersion('1.0.0')
    .build();
  return SwaggerModule.createDocument(app, config);
}

// Shared by main.ts and the tests so both run the same pipeline.
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(EnvironmentVariables);

  app.useLogger(app.get(Logger));
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY ? 1 : false);
  app.useBodyParser('json', { limit: '16kb' });
  app.use(
    helmet({
      contentSecurityPolicy: {
        // Swagger UI needs inline scripts and styles; everything else is JSON.
        directives: {
          'script-src': ["'self'", "'unsafe-inline'"],
          'style-src': ["'self'", "'unsafe-inline'"],
        },
      },
    }),
  );

  const origins =
    config.CORS_ORIGINS?.split(',')
      .map((o) => o.trim())
      .filter(Boolean) ?? [];
  if (origins.length > 0) {
    app.enableCors({
      origin: origins,
      credentials: false,
      exposedHeaders: ['X-Request-Id', 'Idempotent-Replayed'],
    });
  }

  app.setGlobalPrefix(API_PREFIX, { exclude: ['health', 'health/ready'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: false,
    }),
  );

  SwaggerModule.setup('docs', app, buildOpenApi(app), {
    jsonDocumentUrl: 'docs-json',
  });
}
