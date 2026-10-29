import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { FxService } from '../../src/modules/fx/fx.service.js';
import { NotificationsHandler } from '../../src/modules/outbox/notifications.handler.js';
import { LedgerService } from '../../src/modules/ledger/ledger.service.js';
import { connect } from '../support/db.js';
import { deliverOutbox } from '../support/outbox.js';
import { FakeProvider, primaryRates } from '../support/fx.js';
import { deposit, newKey, swap, transfer } from '../support/money.js';
import { createTestApp } from '../support/test-app.js';
import { bearer, createWallet, type TestWallet } from '../support/wallets.js';

const OPS = { 'X-Ops-Token': 'test-ops-token-0123456789abcdefghijklmnop' };

describe('outbox events and notifications', () => {
  let app: NestExpressApplication;
  let db: pg.Client;
  const now = new Date();
  const primary = new FakeProvider('exchangerate-api');
  const secondary = new FakeProvider('currency-api');

  const notices = (w: TestWallet, query = '') =>
    request(app.getHttpServer())
      .get(`/api/v1/wallets/${w.walletId}/notifications${query}`)
      .set(bearer(w.accessToken));
  const events = (walletId: string) =>
    db.query<{
      type: string;
      attempts: number;
      processed: boolean;
      failed: boolean;
    }>(
      `SELECT type, attempts, processed_at IS NOT NULL AS processed, failed_at IS NOT NULL AS failed
         FROM outbox_events WHERE wallet_id = $1 ORDER BY created_at, type`,
      [walletId],
    );

  beforeAll(async () => {
    app = await createTestApp(
      { LOW_BALANCE_USD: '10' },
      { fxProviders: [primary, secondary], clock: () => now },
    );
    db = await connect();
    primary.answer = () => primaryRates(now);
    await app.get(FxService).refresh();
  });

  afterAll(async () => {
    await db.end();
    await app.close();
  });

  it('writes one event per side of every movement, in the same transaction, and delivers each once', async () => {
    const a = await createWallet(app);
    const b = await createWallet(app);
    await deposit(app, a, 'USDx', '50').expect(201);
    await swap(app, a, {
      fromCurrency: 'USDx',
      toCurrency: 'cNGN',
      amount: '5',
    }).expect(201);
    await transfer(app, a, {
      toWalletId: b.walletId,
      fromCurrency: 'USDx',
      amount: '10',
    }).expect(201);
    expect((await events(a.walletId)).rows.map((e) => e.type)).toEqual([
      'deposit.completed',
      'swap.completed',
      'transfer.sent',
    ]);
    expect(
      (await events(b.walletId)).rows.map((e) => [e.type, e.processed]),
    ).toEqual([['transfer.received', false]]);

    await deliverOutbox(app);
    await deliverOutbox(app);
    const theirs = (await notices(b).expect(200)).body.data as {
      kind: string;
      body: string;
    }[];
    expect(theirs).toEqual([
      expect.objectContaining({
        kind: 'transfer.received',
        body: 'You received 10.000000 USDx.',
      }),
    ]);
    const mine = (await notices(a).expect(200)).body.data as { kind: string }[];
    expect(mine.map((n) => n.kind)).toEqual([
      'transfer.sent',
      'swap.completed',
      'deposit.completed',
    ]);
    expect(
      (await events(a.walletId)).rows.every(
        (e) => e.processed && e.attempts === 1,
      ),
    ).toBe(true);
  });

  it('writes no event when the movement fails, and none twice for a replay', async () => {
    const w = await createWallet(app);
    const key = newKey();
    await deposit(app, w, 'cGHS', '1', key).expect(201);
    await deposit(app, w, 'cGHS', '1', key).expect(201);
    await swap(app, w, {
      fromCurrency: 'cGHS',
      toCurrency: 'USDx',
      amount: '9',
    }).expect(422);
    expect((await events(w.walletId)).rows.map((e) => e.type)).toEqual([
      'deposit.completed',
    ]);
  });

  it('raises balance.low once when a debit crosses the line', async () => {
    const a = await createWallet(app);
    const b = await createWallet(app);
    await deposit(app, a, 'USDx', '15').expect(201);
    await transfer(app, a, {
      toWalletId: b.walletId,
      fromCurrency: 'USDx',
      amount: '6',
    }).expect(201);
    await transfer(app, a, {
      toWalletId: b.walletId,
      fromCurrency: 'USDx',
      amount: '1',
    }).expect(201);
    const types = (await events(a.walletId)).rows.map((e) => e.type);
    expect(types.filter((t) => t === 'balance.low')).toHaveLength(1);
    await deliverOutbox(app);
    const low = (await notices(a, '?unread=true').expect(200)).body.data as {
      kind: string;
      body: string;
      notificationId: string;
    }[];
    expect(low.find((n) => n.kind === 'balance.low')?.body).toBe(
      'Your USDx balance is 9.000000, worth about 9.000000 USD.',
    );
  });

  it('retries a failing delivery with backoff, then parks it for an operator', async () => {
    const w = await createWallet(app);
    const handler = app.get(NotificationsHandler);
    const fail = vi
      .spyOn(handler, 'handle')
      .mockRejectedValue(new Error('handler down'));
    try {
      await deposit(app, w, 'EURx', '2').expect(201);
      // The queue retries on its own with jittered backoff (5 ms base in tests) and parks the event at the end.
      await deliverOutbox(app);
      const [parked] = (await events(w.walletId)).rows;
      expect(parked).toMatchObject({
        attempts: 11,
        processed: false,
        failed: true,
      });
      // Other test files' events share the database, so only this wallet's deliveries are counted.
      expect(
        fail.mock.calls.filter(([, event]) => event.wallet_id === w.walletId),
      ).toHaveLength(11);
      const { rows } = await db.query<{ last_error: string }>(
        'SELECT last_error FROM outbox_events WHERE wallet_id = $1',
        [w.walletId],
      );
      expect(rows[0]!.last_error).toBe('handler down');
      const metrics = await request(app.getHttpServer())
        .get('/api/v1/ops/metrics')
        .set(OPS)
        .expect(200);
      expect(metrics.text).toMatch(/borderless_outbox_failed [1-9]/);
    } finally {
      fail.mockRestore();
    }
  });

  it('keeps one bad event from blocking the others', async () => {
    const a = await createWallet(app);
    const b = await createWallet(app);
    const handler = app.get(NotificationsHandler);
    const real = handler.handle.bind(handler);
    const fail = vi
      .spyOn(handler, 'handle')
      .mockImplementation((m, event) =>
        event.wallet_id === a.walletId
          ? Promise.reject(new Error('only a fails'))
          : real(m, event),
      );
    try {
      await deposit(app, a, 'cXAF', '5').expect(201);
      await deposit(app, b, 'cXAF', '5').expect(201);
      await deliverOutbox(app);
      expect((await events(b.walletId)).rows[0]).toMatchObject({
        processed: true,
      });
      expect((await events(a.walletId)).rows[0]).toMatchObject({
        processed: false,
        failed: true,
        attempts: 11,
      });
    } finally {
      fail.mockRestore();
    }
  });

  it('lets only the owner read notices and mark them read', async () => {
    const a = await createWallet(app);
    const b = await createWallet(app);
    await deposit(app, a, 'USDx', '1').expect(201);
    await deliverOutbox(app);
    const [notice] = (await notices(a).expect(200)).body.data as {
      notificationId: string;
    }[];
    await request(app.getHttpServer())
      .get(`/api/v1/wallets/${a.walletId}/notifications`)
      .set(bearer(b.accessToken))
      .expect(404);
    await request(app.getHttpServer())
      .post(
        `/api/v1/wallets/${b.walletId}/notifications/${notice!.notificationId}/read`,
      )
      .set(bearer(b.accessToken))
      .expect(404);
    const read = await request(app.getHttpServer())
      .post(
        `/api/v1/wallets/${a.walletId}/notifications/${notice!.notificationId}/read`,
      )
      .set(bearer(a.accessToken))
      .expect(200);
    expect(read.body.data.readAt).not.toBeNull();
    expect((await notices(a, '?unread=true').expect(200)).body.data).toEqual(
      [],
    );
    await notices(a, '?unread=maybe').expect(400);
  });

  it('keeps events free of personal data', async () => {
    const w = await createWallet(app);
    await deposit(app, w, 'USDx', '3').expect(201);
    const { rows } = await db.query<{ payload: unknown }>(
      'SELECT payload FROM outbox_events WHERE wallet_id = $1',
      [w.walletId],
    );
    expect(JSON.stringify(rows)).not.toContain(w.email);
    expect(app.get(LedgerService)).toBeDefined();
  });
});
