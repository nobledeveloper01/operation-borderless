import type { Params } from 'nestjs-pino';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export function loggerOptions(config: EnvironmentVariables): Params {
  return {
    pinoHttp: {
      level: config.LOG_LEVEL,
      // The request ID middleware runs first, so the log line uses the same ID the client sees.
      genReqId: (req: IncomingMessage) => req.id ?? randomUUID(),
      // Pretty lines are for a person at a terminal, while containers and CI get JSON.
      transport:
        config.NODE_ENV === 'development' && process.stdout.isTTY
          ? { target: 'pino-pretty', options: { singleLine: true } }
          : undefined,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers["x-wallet-key"]',
          'req.headers.cookie',
          '*.password',
          '*.email',
          '*.phoneNumber',
          '*.refreshToken',
          '*.accessToken',
        ],
        censor: '[redacted]',
      },
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url.split('?')[0],
        }),
      },
      autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
    },
  };
}
