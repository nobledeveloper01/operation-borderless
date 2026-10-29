import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from '../support/test-app.js';
import { bearer, createWallet, PASSWORD } from '../support/wallets.js';

describe('rate limits in Redis', () => {
  it('shares one limit between two API instances', async () => {
    const shared = {
      QUEUE_PREFIX: `shared-${Date.now()}`,
      RATE_LIMIT_PER_MINUTE: '3',
    };
    const a = await createTestApp(shared);
    const b = await createTestApp(shared);
    try {
      const w = await createWallet(a);
      const me = (app: NestExpressApplication) =>
        request(app.getHttpServer())
          .get('/api/v1/auth/me')
          .set(bearer(w.accessToken));
      const statuses: number[] = [];
      for (const app of [a, b, a, b]) statuses.push((await me(app)).status);
      expect(statuses).toEqual([200, 200, 200, 429]);
      // A third instance with its own prefix counts on its own.
      const separate = await createTestApp({ RATE_LIMIT_PER_MINUTE: '3' });
      expect((await me(separate)).status).toBe(200);
      await separate.close();
    } finally {
      await a.close();
      await b.close();
    }
  });

  describe('while Redis is down', () => {
    let up: NestExpressApplication;
    let down: NestExpressApplication;

    beforeAll(async () => {
      up = await createTestApp();
      // Nothing listens on port 1, so every Redis command fails fast.
      down = await createTestApp({ REDIS_URL: 'redis://127.0.0.1:1' });
    });

    afterAll(async () => {
      await down.close();
      await up.close();
    });

    it('starts, and keeps reads and health checks working without a limit', async () => {
      const w = await createWallet(up);
      const server = down.getHttpServer();
      const auth = bearer(w.accessToken);
      await request(server).get('/health/ready').expect(200);
      await request(server).get('/api/v1/auth/me').set(auth).expect(200);
      await request(server)
        .get(`/api/v1/wallets/${w.walletId}/balances`)
        .set(auth)
        .expect(200);
      await request(server)
        .get(`/api/v1/wallets/${w.walletId}/transactions`)
        .set(auth)
        .expect(200);
    });

    it('pauses money and sign-in routes with 503 instead of running them unlimited', async () => {
      const w = await createWallet(up);
      const server = down.getHttpServer();
      const auth = bearer(w.accessToken);
      const calls: [string, request.Test][] = [
        [
          'sign-up',
          request(server)
            .post('/api/v1/wallets')
            .send({
              email: `down-${Date.now()}@example.com`,
              password: PASSWORD,
            }),
        ],
        [
          'login',
          request(server)
            .post('/api/v1/auth/login')
            .send({ email: w.email, password: PASSWORD }),
        ],
        [
          'deposit',
          request(server)
            .post(`/api/v1/wallets/${w.walletId}/deposits`)
            .set({ ...auth, 'Idempotency-Key': crypto.randomUUID() })
            .send({ currency: 'USDx', amount: '1' }),
        ],
        [
          'quote',
          request(server)
            .post('/api/v1/quotes')
            .set(auth)
            .send({ fromCurrency: 'USDx', toCurrency: 'cNGN', amount: '1' }),
        ],
      ];
      for (const [label, call] of calls) {
        const res = await call;
        expect([label, res.status, res.body.code]).toEqual([
          label,
          503,
          'SERVICE_BUSY',
        ]);
      }
    });
  });
});
