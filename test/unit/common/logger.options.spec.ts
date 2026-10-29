import { Writable } from 'node:stream';
import { pino } from 'pino';
import { loggerOptions } from '../../../src/common/http/logger.options.js';
import { validateEnv } from '../../../src/common/config/env.validation.js';

const env = validateEnv({
  NODE_ENV: 'test',
  DB_PASSWORD: 'x',
  PII_ENCRYPTION_KEYS: '1:bG9jYWwtcGlpLWVuY3J5cHRpb24ta2V5LXYxLTAwMDE=',
  PII_LOOKUP_KEY: 'bG9jYWwtcGlpLWxvb2t1cC1rZXktZm9yLWRldi0wMDA=',
});

describe('logger options', () => {
  it('keeps only id, method and path from a request and redacts body secrets', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const http = loggerOptions(env).pinoHttp as {
      redact: { paths: string[]; censor: string };
      serializers: { req: (req: unknown) => unknown };
    };
    const logger = pino(
      { redact: http.redact, serializers: http.serializers },
      sink,
    );

    logger.info(
      {
        req: {
          id: 'r1',
          method: 'POST',
          url: '/api/v1/auth/login?email=ada@example.com',
          headers: {
            authorization: 'Bearer secret-token',
            'x-wallet-key': 'bwk_k_x',
          },
        },
        body: {
          email: 'ada@example.com',
          password: 'hunter2hunter2',
          refreshToken: 'rt-1',
        },
      },
      'request',
    );

    const line = lines.join('');
    for (const secret of [
      'secret-token',
      'bwk_k_x',
      'ada@example.com',
      'hunter2hunter2',
      'rt-1',
    ]) {
      expect([secret, line.includes(secret)]).toEqual([secret, false]);
    }
    expect(line).toContain('/api/v1/auth/login');
  });

  it('redacts credential headers even without the request serializer', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const http = loggerOptions(env).pinoHttp as {
      redact: { paths: string[]; censor: string };
    };
    pino({ redact: http.redact }, sink).info({
      req: {
        headers: {
          authorization: 'Bearer secret-token',
          'x-wallet-key': 'bwk_k_x',
          cookie: 'sid=abc',
        },
      },
    });
    const line = lines.join('');
    for (const secret of ['secret-token', 'bwk_k_x', 'sid=abc']) {
      expect([secret, line.includes(secret)]).toEqual([secret, false]);
    }
    expect(line).toContain('[redacted]');
  });
});
