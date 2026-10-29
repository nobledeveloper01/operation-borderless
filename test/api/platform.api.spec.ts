import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from '../support/test-app.js';

describe('platform', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('TC-046 answers liveness and readiness in the success envelope', async () => {
    const live = await request(app.getHttpServer()).get('/health').expect(200);
    expect(live.body).toMatchObject({
      success: true,
      statusCode: 200,
      message: 'The API is up',
      data: { status: 'ok' },
      requestId: live.headers['x-request-id'],
    });
    expect(Date.parse(String(live.body.timestamp))).not.toBeNaN();
    const ready = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200);
    expect(ready.body.data).toEqual({ status: 'ok' });
  });

  it('TC-046 answers 503 NOT_READY while the database is down', async () => {
    const db = app.get(DataSource);
    const query = vi
      .spyOn(db, 'query')
      .mockRejectedValueOnce(new Error('connection refused'));
    const res = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503);
    expect(res.body.code).toBe('NOT_READY');
    expect(query).toHaveBeenCalledWith('SELECT 1');
    query.mockRestore();
  });

  it('never rate limits health checks', async () => {
    const small = await createTestApp({ RATE_LIMIT_PER_MINUTE: '5' });
    const statuses = await Promise.all(
      Array.from({ length: 20 }, () =>
        request(small.getHttpServer())
          .get('/health')
          .then((r) => r.status),
      ),
    );
    expect(new Set(statuses)).toEqual(new Set([200]));
    const rates = await Promise.all(
      Array.from({ length: 20 }, () =>
        request(small.getHttpServer())
          .get('/api/v1/fx/rates')
          .then((r) => r.status),
      ),
    );
    expect(rates).toContain(429);
    await small.close();
  });

  it('marks every answer as not cacheable', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('returns a request ID, keeping a safe incoming one', async () => {
    const own = await request(app.getHttpServer())
      .get('/health')
      .set('X-Request-Id', 'client-req-0001');
    expect(own.headers['x-request-id']).toBe('client-req-0001');
    const unsafe = await request(app.getHttpServer())
      .get('/health')
      .set('X-Request-Id', '<script>');
    expect(unsafe.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('answers unknown routes with the shared error body', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/nope')
      .expect(404);
    expect(res.body).toMatchObject({
      success: false,
      statusCode: 404,
      code: 'ROUTE_NOT_FOUND',
      path: '/api/v1/nope',
    });
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  it('TC-042 refuses bodies over 16 KB and broken JSON', async () => {
    const big = await request(app.getHttpServer())
      .post('/api/v1/nope')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ pad: 'x'.repeat(20_000) }));
    expect(big.status).toBe(413);
    expect(big.body.code).toBe('PAYLOAD_TOO_LARGE');
    const broken = await request(app.getHttpServer())
      .post('/api/v1/nope')
      .set('Content-Type', 'application/json')
      .send('{bad');
    expect(broken.status).toBe(400);
    expect(broken.body.code).toBe('VALIDATION_FAILED');
    // Regression: ISSUE-001 — a malformed body echoed the JSON parser's own message
    // Found by /qa on 2026-10-29
    // Report: .gstack/qa-reports/run-20261029T130229Z/qa-report-local-api-money-2026-10-29.md
    expect(broken.body.message).toBe('The request body is not valid JSON.');
  });

  it('keeps a strict CSP on the API and relaxes it only for Swagger UI', async () => {
    const api = await request(app.getHttpServer()).get('/health');
    expect(api.headers['content-security-policy']).toBe(
      "default-src 'none';frame-ancestors 'none'",
    );
    expect(api.headers['content-security-policy']).not.toContain(
      'unsafe-inline',
    );
    const docs = await request(app.getHttpServer()).get('/docs/');
    expect(docs.headers['content-security-policy']).toContain(
      "script-src 'self' 'unsafe-inline'",
    );
  });

  it('TC-045 sends security headers and no CORS headers by default', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://evil.example');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('serves the OpenAPI document', async () => {
    const res = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    expect(res.body.info.title).toBe('Borderless API');
  });
});
