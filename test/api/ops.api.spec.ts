import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { connect } from '../support/db.js';
import { deposit } from '../support/money.js';
import { createTestApp } from '../support/test-app.js';
import { bearer, createWallet } from '../support/wallets.js';

const OPS = { 'X-Ops-Token': 'test-ops-token-0123456789abcdefghijklmnop' };

describe('operations', () => {
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

  it('needs the operator token, and a wallet session is not enough', async () => {
    const w = await createWallet(app);
    for (const path of ['/api/v1/ops/metrics', '/api/v1/ops/ledger-check']) {
      await request(server()).get(path).expect(401);
      await request(server()).get(path).set(bearer(w.accessToken)).expect(401);
      await request(server())
        .get(path)
        .set('X-Ops-Token', 'wrong-token-0123456789abcdefghijklmnop')
        .expect(401);
      await request(server()).get(path).set(OPS).expect(200);
    }
  });

  it('hides the operator routes when no token is configured', async () => {
    const closed = await createTestApp({ OPS_TOKEN: '' });
    const res = await request(closed.getHttpServer())
      .get('/api/v1/ops/metrics')
      .set(OPS)
      .expect(404);
    expect(res.body.code).toBe('ROUTE_NOT_FOUND');
    await closed.close();
  });

  it('serves Prometheus metrics with route templates, never real IDs', async () => {
    const w = await createWallet(app);
    await deposit(app, w, 'USDx', '5').expect(201);
    await request(server())
      .get(`/api/v1/wallets/${w.walletId}`)
      .set(bearer(w.accessToken))
      .expect(200);
    const res = await request(server())
      .get('/api/v1/ops/metrics')
      .set(OPS)
      .expect(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    const text = res.text;
    expect(text).toMatch(
      /borderless_money_movements_total\{type="DEPOSIT"\} [1-9]/,
    );
    expect(text).toContain('route="/api/v1/wallets/:walletId"');
    expect(text).toContain('borderless_http_request_duration_seconds_bucket');
    expect(text).toContain('borderless_fx_rates_fresh');
    expect(text).toContain('borderless_process_cpu_seconds_total');
    expect(text).not.toContain(w.walletId);
  });

  it('TC-037 finds balances that drift from their ledger lines', async () => {
    // Other test files write balances directly on purpose, so this checks for its own row, not a total.
    const w = await createWallet(app);
    await deposit(app, w, 'cXAF', '9').expect(201);
    await db.query(
      `UPDATE balances SET amount = amount + 1 WHERE wallet_id = $1 AND currency = 'cXAF'`,
      [w.walletId],
    );
    try {
      const res = await request(server())
        .get('/api/v1/ops/ledger-check')
        .set(OPS)
        .expect(200);
      expect(res.body.data.ok).toBe(false);
      expect(res.body.data.mismatchCount).toBeGreaterThanOrEqual(1);
      expect(res.body.data.mismatches).toContainEqual({
        walletId: w.walletId,
        currency: 'cXAF',
        balance: '9.000001',
        ledger: '9.000000',
      });
      const metrics = await request(server())
        .get('/api/v1/ops/metrics')
        .set(OPS)
        .expect(200);
      // The gauge holds the count from the last check, which is at least this one.
      expect(metrics.text).toMatch(/^borderless_ledger_mismatches [1-9]\d*$/m);
    } finally {
      await db.query(
        `UPDATE balances SET amount = amount - 1 WHERE wallet_id = $1 AND currency = 'cXAF'`,
        [w.walletId],
      );
    }
  });
});
