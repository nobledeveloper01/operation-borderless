import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { connect } from '../support/db.js';
import { deposit } from '../support/money.js';
import { createTestApp } from '../support/test-app.js';
import { createWallet } from '../support/wallets.js';

const ATTACKS = [
  "' OR '1'='1",
  "'; DROP TABLE balances;--",
  '$1); DELETE FROM accounts;--',
];

describe('injection', () => {
  let app: NestExpressApplication;
  let db: pg.Client;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp();
    db = await connect();
  });

  afterAll(async () => {
    await db.end();
    await app.close();
  });

  it('TC-040 refuses or stores injection strings as plain data, never runs them', async () => {
    const a = await createWallet(app);
    await deposit(app, a, 'cNGN', '5').expect(201);
    const auth = { Authorization: `Bearer ${a.accessToken}` };

    for (const attack of ATTACKS) {
      await request(server())
        .post('/api/v1/auth/login')
        .send({ email: a.email, password: attack })
        .expect(401);
      await request(server())
        .post('/api/v1/wallets')
        .send({ email: `${attack}@example.com`, password: attack })
        .expect(400);
      await request(server())
        .get(`/api/v1/wallets/${a.walletId}/transactions`)
        .query({ type: attack })
        .set(auth)
        .expect(400);
      await request(server())
        .get(`/api/v1/transactions/${encodeURIComponent(attack)}`)
        .set(auth)
        .expect(400);
      await request(server())
        .post(`/api/v1/wallets/${a.walletId}/deposits`)
        .set(auth)
        .set('Idempotency-Key', attack)
        .send({ currency: 'cNGN', amount: '1' })
        .expect(400);
      await request(server())
        .post(`/api/v1/wallets/${a.walletId}/keys`)
        .set(auth)
        .send({ name: attack })
        .expect((res) => expect([201, 400]).toContain(res.status));
    }

    // A password made of SQL is just a password.
    const sqlPassword = `${ATTACKS[1]} padded to length`;
    const odd = await request(server())
      .post('/api/v1/wallets')
      .send({ email: `odd-${Date.now()}@example.com`, password: sqlPassword })
      .expect(201);
    await request(server())
      .post('/api/v1/auth/login')
      .send({ email: odd.body.data.email, password: sqlPassword })
      .expect(200);

    const tables = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name IN ('accounts', 'balances')`,
    );
    expect(tables.rows[0]?.n).toBe(2);
    const balance = await request(server())
      .get(`/api/v1/wallets/${a.walletId}/balances`)
      .set(auth)
      .expect(200);
    expect(
      (
        balance.body.data.balances as { currency: string; amount: string }[]
      ).find((b) => b.currency === 'cNGN')?.amount,
    ).toBe('5.000000');
  });
});
