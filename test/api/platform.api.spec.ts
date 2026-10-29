import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
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
