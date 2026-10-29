import { readFileSync } from 'node:fs';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from '../support/test-app.js';
import { bearer, createWallet, type TestWallet } from '../support/wallets.js';

interface Operation {
  method: 'get' | 'post' | 'delete';
  path: string;
  security: string[];
  body: boolean;
  params: string[];
  idempotent: boolean;
}

// Every route in the committed spec, so a new route is swept without anyone listing it here.
const operations: Operation[] = Object.entries(
  (
    JSON.parse(
      readFileSync(new URL('../../docs/openapi.json', import.meta.url), 'utf8'),
    ) as {
      paths: Record<
        string,
        Record<
          string,
          {
            security?: Record<string, unknown>[];
            requestBody?: unknown;
            parameters?: { in: string; name: string }[];
          }
        >
      >;
    }
  ).paths,
).flatMap(([path, item]) =>
  Object.entries(item).map(([method, op]) => ({
    method: method as Operation['method'],
    path,
    security: (op.security ?? []).flatMap((s) => Object.keys(s)),
    body: op.requestBody !== undefined,
    params: (op.parameters ?? [])
      .filter((p) => p.in === 'path')
      .map((p) => p.name),
    idempotent: (op.parameters ?? []).some((p) => p.name === 'Idempotency-Key'),
  })),
);

const name = (op: Operation) => `${op.method.toUpperCase()} ${op.path}`;

// A body each wallet route accepts, so the ownership check is what answers, not validation.
const validBody = (op: Operation): object =>
  op.path.endsWith('/swaps')
    ? { fromCurrency: 'USDx', toCurrency: 'cNGN', amount: '1' }
    : op.path.endsWith('/keys')
      ? { name: 'sweep' }
      : { currency: 'USDx', amount: '1' };
const SOME_UUID = '00000000-0000-4000-8000-000000000000';
const SOME_KEY_ID = 'k_aaaaaaaaaaaa';

describe('every route, one by one', () => {
  let app: NestExpressApplication;
  let me: TestWallet;
  let other: TestWallet;

  beforeAll(async () => {
    app = await createTestApp();
    me = await createWallet(app);
    other = await createWallet(app);
  });

  afterAll(async () => {
    await app.close();
  });

  // Fills each path parameter, with a chosen wallet and a well-formed ID for the rest.
  const url = (op: Operation, walletId: string, broken?: string) =>
    op.path.replace(/\{(\w+)\}/g, (_, param: string) =>
      param === broken
        ? 'not-a-valid-id'
        : param === 'walletId'
          ? walletId
          : param === 'keyId'
            ? SOME_KEY_ID
            : SOME_UUID,
    );

  const send = (
    op: Operation,
    path: string,
    headers: Record<string, string>,
    body?: object,
  ) => {
    const call = request(app.getHttpServer())[op.method](path).set(headers);
    return body === undefined ? call : call.send(body);
  };

  const keyHeader = (op: Operation): Record<string, string> =>
    op.idempotent ? { 'Idempotency-Key': crypto.randomUUID() } : {};

  const expectErrorBody = (
    res: request.Response,
    status: number,
    label: string,
  ) => {
    expect([label, res.status]).toEqual([label, status]);
    expect([label, res.body]).toEqual([
      label,
      expect.objectContaining({
        success: false,
        statusCode: status,
        code: expect.any(String),
        message: expect.any(String),
        requestId: expect.any(String),
      }),
    ]);
  };

  it('has routes to sweep', () => {
    expect(operations.length).toBeGreaterThanOrEqual(25);
  });

  it('refuses every protected route without credentials', async () => {
    for (const op of operations.filter((o) => o.security.length > 0)) {
      const res = await send(
        op,
        url(op, me.walletId),
        keyHeader(op),
        op.body ? {} : undefined,
      );
      expectErrorBody(res, 401, name(op));
    }
  });

  it("answers 404 on every wallet route for someone else's wallet", async () => {
    for (const op of operations.filter(
      (o) => o.params.includes('walletId') && o.security.length > 0,
    )) {
      const res = await send(
        op,
        url(op, other.walletId),
        { ...bearer(me.accessToken), ...keyHeader(op) },
        op.body ? validBody(op) : undefined,
      );
      expectErrorBody(res, 404, name(op));
    }
  });

  it('answers 400 for every ID that is not well formed', async () => {
    for (const op of operations.filter((o) => o.params.length > 0)) {
      for (const param of op.params) {
        const res = await send(
          op,
          url(op, me.walletId, param),
          { ...bearer(me.accessToken), ...keyHeader(op) },
          op.body ? {} : undefined,
        );
        expectErrorBody(res, 400, `${name(op)} with a bad ${param}`);
      }
    }
  });

  it('answers 400 for an empty body on every route that takes one', async () => {
    for (const op of operations.filter((o) => o.body)) {
      const headers =
        op.security.length > 0
          ? { ...bearer(me.accessToken), ...keyHeader(op) }
          : keyHeader(op);
      const res = await send(op, url(op, me.walletId), headers, {});
      expectErrorBody(res, 400, name(op));
    }
  });

  it('answers 400 on every money route without an Idempotency-Key', async () => {
    for (const op of operations.filter((o) => o.idempotent)) {
      const res = await send(
        op,
        url(op, me.walletId),
        bearer(me.accessToken),
        {},
      );
      expectErrorBody(res, 400, name(op));
    }
  });
  it('refuses a wallet key on every route that needs a signed-in session', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/wallets/${me.walletId}/keys`)
      .set(bearer(me.accessToken))
      .send({ name: 'sweep-key' })
      .expect(201);
    const walletKey = { 'X-Wallet-Key': created.body.data.key as string };
    const sessionOnly = operations.filter(
      (o) => o.security.length === 1 && o.security[0] === 'bearer',
    );
    expect(sessionOnly.length).toBeGreaterThan(0);
    for (const op of sessionOnly) {
      const res = await send(
        op,
        url(op, me.walletId),
        walletKey,
        op.body ? validBody(op) : undefined,
      );
      expectErrorBody(res, 403, name(op));
    }
  });

  it('hides every operator route when no operator token is set', async () => {
    const closed = await createTestApp({ OPS_TOKEN: '' });
    try {
      for (const op of operations.filter((o) =>
        o.security.includes('opsToken'),
      )) {
        const res = await request(closed.getHttpServer())
          .get(op.path)
          .set('X-Ops-Token', 'test-ops-token-0123456789abcdefghijklmnop');
        expectErrorBody(res, 404, name(op));
      }
    } finally {
      await closed.close();
    }
  });

  it('rate limits every route except the health checks', async () => {
    const tight = await createTestApp({
      RATE_LIMIT_PER_MINUTE: '1',
      AUTH_RATE_LIMIT_PER_MINUTE: '1000',
      MONEY_RATE_LIMIT_PER_MINUTE: '1000',
    });
    try {
      for (const op of operations) {
        const path = url(op, me.walletId);
        const call = () => {
          const r = request(tight.getHttpServer())
            [op.method](path)
            .set(keyHeader(op));
          return op.body ? r.send({}) : r;
        };
        await call();
        const second = await call();
        if (op.path.startsWith('/health'))
          expect([name(op), second.status]).not.toEqual([name(op), 429]);
        else expectErrorBody(second, 429, name(op));
      }
    } finally {
      await tight.close();
    }
  });

  // Its own app with a clock 30 hours ahead, so whatever rates other files stored are stale here.
  it('refuses to price a cross-currency transfer when no fresh rates exist', async () => {
    const later = new Date(Date.now() + 30 * 3_600_000);
    const stale = await createTestApp({}, { clock: () => later });
    const res = await request(stale.getHttpServer())
      .post('/api/v1/transfers')
      .set({
        ...bearer(me.accessToken),
        'Idempotency-Key': crypto.randomUUID(),
      })
      .send({
        fromWalletId: me.walletId,
        toWalletId: other.walletId,
        fromCurrency: 'USDx',
        toCurrency: 'cGHS',
        amount: '1',
      });
    await stale.close();
    expectErrorBody(res, 503, 'POST /api/v1/transfers without rates');
    expect(res.body.code).toBe('FX_RATE_UNAVAILABLE');
  });
});
