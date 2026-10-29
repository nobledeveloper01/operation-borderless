import { readFile, writeFile } from 'node:fs/promises';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { OpenAPIObject } from '@nestjs/swagger';
import request from 'supertest';
import { buildOpenApi } from '../../src/app.setup.js';
import { createTestApp } from '../support/test-app.js';

const FILE = new URL('../../docs/openapi.json', import.meta.url);
const PUBLIC = new Set([
  'post /api/v1/wallets',
  'post /api/v1/auth/login',
  'post /api/v1/auth/refresh',
  'get /api/v1/fx/rates',
  'get /health',
  'get /health/ready',
]);

type Operation = {
  summary?: string;
  security?: unknown[];
  responses: Record<string, { content?: unknown }>;
};

describe('OpenAPI', () => {
  let app: NestExpressApplication;
  let generated: OpenAPIObject;

  beforeAll(async () => {
    app = await createTestApp();
    generated = buildOpenApi(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const operations = () =>
    Object.entries(generated.paths).flatMap(([path, item]) =>
      Object.entries(item as Record<string, Operation>).map(
        ([method, op]) => [`${method} ${path}`, op] as const,
      ),
    );

  it('TC-039 matches the committed docs/openapi.json', async () => {
    const text = `${JSON.stringify(generated, null, 2)}\n`;
    // Run with UPDATE_OPENAPI=1 (yarn openapi) after changing a route.
    if (process.env.UPDATE_OPENAPI === '1') await writeFile(FILE, text);
    expect(await readFile(FILE, 'utf8')).toBe(text);
  });

  it('documents every route with a summary, its security and the shared error body', () => {
    const ops = operations();
    expect(ops.length).toBeGreaterThan(15);
    for (const [name, op] of ops) {
      expect([name, Boolean(op.summary)]).toEqual([name, true]);
      const secured = (op.security ?? []).length > 0;
      expect([name, secured]).toEqual([name, !PUBLIC.has(name)]);
      for (const [status, response] of Object.entries(op.responses)) {
        if (Number(status) >= 400) {
          expect([name, status, JSON.stringify(response)]).toEqual([
            name,
            status,
            expect.stringContaining('ErrorResponseDto'),
          ]);
        }
      }
    }
  });

  it('documents the money headers, whole-number paging and which routes are throttled', () => {
    for (const [name, op] of operations()) {
      const params =
        (op as { parameters?: { name: string }[] }).parameters ?? [];
      if (params.some((p) => p.name === 'Idempotency-Key')) {
        expect([name, Object.keys(op.responses)]).toEqual([
          name,
          expect.arrayContaining(['422', '503']),
        ]);
      }
      const throttled = !name.includes(' /health');
      expect([name, '429' in op.responses]).toEqual([name, throttled]);
    }
    const history = generated.paths['/api/v1/wallets/{walletId}/transactions']
      ?.get as { parameters: { name: string; schema: { type: string } }[] };
    for (const name of ['page', 'limit']) {
      expect(history.parameters.find((p) => p.name === name)?.schema.type).toBe(
        'integer',
      );
    }
  });

  it('serves the same document at /docs-json', async () => {
    const res = await request(app.getHttpServer()).get('/docs-json');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(JSON.parse(JSON.stringify(generated)));
  });
});
