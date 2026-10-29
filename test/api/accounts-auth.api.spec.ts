import { generateKeyPairSync, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SignJWT, UnsecuredJWT } from 'jose';
import type pg from 'pg';
import request from 'supertest';
import { AccessTokens } from '../../src/auth/access-tokens.js';
import { connect } from '../support/db.js';
import { createTestApp } from '../support/test-app.js';
import {
  bearer,
  createWallet,
  PASSWORD,
  uniqueEmail,
} from '../support/wallets.js';

describe('accounts and auth', () => {
  let app: NestExpressApplication;
  let db: pg.Client;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    db = await connect();
  });

  afterAll(async () => {
    await db.end();
    await app.close();
  });

  describe('creating a wallet', () => {
    it('TC-001 creates a wallet with five zero balances and a first session', async () => {
      const email = uniqueEmail();
      const res = await http()
        .post('/api/v1/wallets')
        .send({ email, password: PASSWORD })
        .expect(201);
      expect(res.body).toMatchObject({
        success: true,
        statusCode: 201,
        message: 'Wallet created',
      });
      expect(res.body.data).toMatchObject({ email, phoneNumber: null });
      expect(res.body.data.balances).toEqual(
        ['cNGN', 'cGHS', 'cXAF', 'USDx', 'EURx'].map((currency) => ({
          currency,
          amount: '0.000000',
        })),
      );
      expect(res.body.data.session).toMatchObject({ tokenType: 'Bearer' });
      await http()
        .get('/api/v1/auth/me')
        .set(bearer(res.body.data.session.accessToken))
        .expect(200);
    });

    it('TC-002 stores a local phone number in international form', async () => {
      const local = `080${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
      const res = await http()
        .post('/api/v1/wallets')
        .send({ phoneNumber: local, password: PASSWORD })
        .expect(201);
      expect(res.body.data.phoneNumber).toBe(`+234${local.slice(1)}`);
    });

    it('TC-003 refuses a missing identifier, a bad email or phone and a short password', async () => {
      const cases = [
        { password: PASSWORD },
        { email: 'not-an-email', password: PASSWORD },
        { phoneNumber: '12', password: PASSWORD },
        { email: uniqueEmail(), password: 'short' },
        { email: uniqueEmail() },
      ];
      for (const body of cases) {
        const res = await http().post('/api/v1/wallets').send(body);
        expect(res.status, JSON.stringify(body)).toBe(400);
        expect(res.body).toMatchObject({
          success: false,
          code: 'VALIDATION_FAILED',
        });
      }
    });

    it('TC-041 refuses fields the client may not set', async () => {
      const res = await http()
        .post('/api/v1/wallets')
        .send({
          email: uniqueEmail(),
          password: PASSWORD,
          balances: [{ currency: 'USDx', amount: '1000' }],
        })
        .expect(400);
      expect(res.body.message).toMatch(/balances/);
    });

    it('TC-004 refuses the same email in another case', async () => {
      const email = uniqueEmail();
      await createWallet(app, email);
      const res = await http()
        .post('/api/v1/wallets')
        .send({ email: email.toUpperCase(), password: PASSWORD })
        .expect(409);
      expect(res.body.code).toBe('WALLET_ALREADY_EXISTS');
    });

    it('TC-005 lets only one of ten parallel creates with one email win', async () => {
      const email = uniqueEmail();
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          http().post('/api/v1/wallets').send({ email, password: PASSWORD }),
        ),
      );
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, ...Array<number>(9).fill(409)]);
    });
  });

  describe('logging in', () => {
    it('TC-047 logs in with an email and with a phone number', async () => {
      const wallet = await createWallet(app);
      const byEmail = await http()
        .post('/api/v1/auth/login')
        .send({ email: wallet.email, password: PASSWORD })
        .expect(200);
      expect(byEmail.body.data.walletId).toBe(wallet.walletId);
      const me = await http()
        .get('/api/v1/auth/me')
        .set(bearer(byEmail.body.data.session.accessToken))
        .expect(200);
      expect(me.body.data).toMatchObject({
        walletId: wallet.walletId,
        email: wallet.email,
        via: 'session',
      });

      const phone = `+23481${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
      await http()
        .post('/api/v1/wallets')
        .send({ phoneNumber: phone, password: PASSWORD })
        .expect(201);
      await http()
        .post('/api/v1/auth/login')
        .send({ phoneNumber: phone, password: PASSWORD })
        .expect(200);
    });

    it('TC-048 answers every failed login the same way', async () => {
      const wallet = await createWallet(app);
      const unknown = await http()
        .post('/api/v1/auth/login')
        .send({ email: uniqueEmail(), password: PASSWORD });
      const wrong = await http()
        .post('/api/v1/auth/login')
        .send({ email: wallet.email, password: 'wrong password!!' });
      expect(unknown.status).toBe(401);
      expect(wrong.status).toBe(401);
      expect(unknown.body.message).toBe(wrong.body.message);
      expect(unknown.body.code).toBe(wrong.body.code);
    });

    it('TC-049 locks an account after five wrong passwords', async () => {
      const wallet = await createWallet(app);
      for (let i = 0; i < 5; i++) {
        await http()
          .post('/api/v1/auth/login')
          .send({ email: wallet.email, password: 'wrong password!!' })
          .expect(401);
      }
      await http()
        .post('/api/v1/auth/login')
        .send({ email: wallet.email, password: PASSWORD })
        .expect(401);
      await db.query(
        `UPDATE accounts SET locked_until = now() - interval '1 second' WHERE id = (SELECT account_id FROM wallets WHERE id = $1)`,
        [wallet.walletId],
      );
      await http()
        .post('/api/v1/auth/login')
        .send({ email: wallet.email, password: PASSWORD })
        .expect(200);
    });
  });

  describe('sessions', () => {
    it('TC-050 gives a new pair on refresh and refuses the old refresh token', async () => {
      const wallet = await createWallet(app);
      const first = await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: wallet.refreshToken })
        .expect(200);
      expect(first.body.data.refreshToken).not.toBe(wallet.refreshToken);
      await http()
        .get('/api/v1/auth/me')
        .set(bearer(first.body.data.accessToken))
        .expect(200);
      await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'x'.repeat(43) })
        .expect(401);
    });

    it('TC-051 ends the whole session when a used refresh token comes back', async () => {
      const wallet = await createWallet(app);
      const next = await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: wallet.refreshToken })
        .expect(200);
      await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: wallet.refreshToken })
        .expect(401);
      await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: next.body.data.refreshToken })
        .expect(401);
      const me = await http()
        .get('/api/v1/auth/me')
        .set(bearer(next.body.data.accessToken))
        .expect(401);
      expect(me.body.code).toBe('SESSION_REVOKED');
    });

    it('TC-052 stops an access token at once on logout and logout-all', async () => {
      const wallet = await createWallet(app);
      await http()
        .post('/api/v1/auth/logout')
        .set(bearer(wallet.accessToken))
        .expect(200);
      await http()
        .get('/api/v1/auth/me')
        .set(bearer(wallet.accessToken))
        .expect(401);

      const second = await http()
        .post('/api/v1/auth/login')
        .send({ email: wallet.email, password: PASSWORD })
        .expect(200);
      const third = await http()
        .post('/api/v1/auth/login')
        .send({ email: wallet.email, password: PASSWORD })
        .expect(200);
      await http()
        .post('/api/v1/auth/logout-all')
        .set(bearer(second.body.data.session.accessToken))
        .expect(200);
      await http()
        .get('/api/v1/auth/me')
        .set(bearer(third.body.data.session.accessToken))
        .expect(401);
    });
  });

  describe('wallet keys', () => {
    it('TC-053 shows a key once, hides it in lists, caps keys at five and keeps key management session-only', async () => {
      const wallet = await createWallet(app);
      const path = `/api/v1/wallets/${wallet.walletId}/keys`;
      const created = await http()
        .post(path)
        .set(bearer(wallet.accessToken))
        .send({ name: 'script-1' })
        .expect(201);
      expect(created.body.data.key).toMatch(
        /^bwk_k_[a-z0-9]{12}_[A-Za-z0-9_-]{43}$/,
      );
      const list = await http()
        .get(path)
        .set(bearer(wallet.accessToken))
        .expect(200);
      expect(list.body.data).toHaveLength(1);
      expect(JSON.stringify(list.body)).not.toContain(created.body.data.key);

      for (let i = 2; i <= 5; i++)
        await http()
          .post(path)
          .set(bearer(wallet.accessToken))
          .send({ name: `s-${i}` })
          .expect(201);
      const sixth = await http()
        .post(path)
        .set(bearer(wallet.accessToken))
        .send({ name: 'six' })
        .expect(409);
      expect(sixth.body.code).toBe('TOO_MANY_KEYS');

      const withKey = await http()
        .get(path)
        .set('X-Wallet-Key', created.body.data.key)
        .expect(403);
      expect(withKey.body.code).toBe('SESSION_REQUIRED');
    });

    it('TC-054 lets a key act only on its own wallet until it is revoked', async () => {
      const a = await createWallet(app);
      const b = await createWallet(app);
      const created = await http()
        .post(`/api/v1/wallets/${a.walletId}/keys`)
        .set(bearer(a.accessToken))
        .send({ name: 'a-script' })
        .expect(201);
      const key = created.body.data.key as string;
      const me = await http()
        .get(`/api/v1/wallets/${a.walletId}`)
        .set('X-Wallet-Key', key)
        .expect(200);
      expect(me.body.data.walletId).toBe(a.walletId);
      await http()
        .get(`/api/v1/wallets/${b.walletId}`)
        .set('X-Wallet-Key', key)
        .expect(404);

      await http()
        .delete(`/api/v1/wallets/${a.walletId}/keys/${created.body.data.keyId}`)
        .set(bearer(a.accessToken))
        .expect(200);
      await http()
        .get(`/api/v1/wallets/${a.walletId}`)
        .set('X-Wallet-Key', key)
        .expect(401);
      await http()
        .delete(`/api/v1/wallets/${a.walletId}/keys/${created.body.data.keyId}`)
        .set(bearer(a.accessToken))
        .expect(404);
      await http()
        .get(`/api/v1/wallets/${a.walletId}`)
        .set('X-Wallet-Key', `${key.slice(0, -1)}x`)
        .expect(401);
    });
  });

  describe('access control', () => {
    it('TC-055 refuses wallet routes without credentials', async () => {
      const id = randomUUID();
      for (const path of [
        `/api/v1/wallets/${id}`,
        `/api/v1/wallets/${id}/balances`,
        `/api/v1/wallets/${id}/keys`,
        '/api/v1/auth/me',
      ]) {
        const res = await http().get(path);
        expect(res.status, path).toBe(401);
        expect(res.body.code).toBe('UNAUTHENTICATED');
      }
    });

    it("TC-056 hides another holder's wallet behind a 404", async () => {
      const a = await createWallet(app);
      const b = await createWallet(app);
      for (const path of [
        `/api/v1/wallets/${a.walletId}`,
        `/api/v1/wallets/${a.walletId}/balances`,
        `/api/v1/wallets/${a.walletId}/keys`,
      ]) {
        const res = await http().get(path).set(bearer(b.accessToken));
        expect(res.status, path).toBe(404);
        expect(res.body.code).toBe('WALLET_NOT_FOUND');
      }
      const notUuid = await http()
        .get('/api/v1/wallets/abc')
        .set(bearer(a.accessToken))
        .expect(400);
      expect(notUuid.body.message).toBe('walletId must be a UUID.');
    });

    it('TC-058 refuses expired, forged and malformed tokens', async () => {
      const wallet = await createWallet(app);
      const me = await http()
        .get('/api/v1/auth/me')
        .set(bearer(wallet.accessToken))
        .expect(200);
      const { accountId } = me.body.data as { accountId: string };
      const sessionId = (
        await db.query<{ id: string }>(
          'SELECT id FROM sessions WHERE account_id = $1 LIMIT 1',
          [accountId],
        )
      ).rows[0]!.id;

      const expired = await app
        .get(AccessTokens)
        .issue({ accountId, sessionId }, new Date(Date.now() - 3_600_000));
      const otherKey = generateKeyPairSync('ec', {
        namedCurve: 'P-256',
      }).privateKey;
      const forged = await new SignJWT({ sid: sessionId })
        .setProtectedHeader({ alg: 'ES256', kid: 'test-1' })
        .setSubject(accountId)
        .setIssuer('borderless')
        .setAudience('borderless-api')
        .setExpirationTime('5m')
        .sign(otherKey);
      const none = new UnsecuredJWT({ sid: sessionId })
        .setSubject(accountId)
        .setIssuer('borderless')
        .setAudience('borderless-api')
        .encode();
      const hs256 = await new SignJWT({ sid: sessionId })
        .setProtectedHeader({ alg: 'HS256', kid: 'test-1' })
        .setSubject(accountId)
        .setIssuer('borderless')
        .setAudience('borderless-api')
        .setExpirationTime('5m')
        .sign(new TextEncoder().encode('x'.repeat(32)));
      const [header, payload, signature] = wallet.accessToken.split('.');
      const claims = JSON.parse(
        Buffer.from(payload!, 'base64url').toString(),
      ) as Record<string, unknown>;
      const wrongAudience = [
        header,
        Buffer.from(JSON.stringify({ ...claims, aud: 'other' })).toString(
          'base64url',
        ),
        signature,
      ].join('.');

      for (const [name, token] of Object.entries({
        expired: expired.token,
        forged,
        none,
        hs256,
        wrongAudience,
        garbage: 'abc.def.ghi',
      })) {
        const res = await http().get('/api/v1/auth/me').set(bearer(token));
        expect(res.status, name).toBe(401);
      }
      await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Basic ${wallet.accessToken}`)
        .expect(401);
    });

    it('TC-043 limits sign-up and login attempts per minute', async () => {
      const limited = await createTestApp({ AUTH_RATE_LIMIT_PER_MINUTE: '3' });
      try {
        for (let i = 0; i < 3; i++) {
          await request(limited.getHttpServer())
            .post('/api/v1/auth/login')
            .send({ email: uniqueEmail(), password: PASSWORD })
            .expect(401);
        }
        const res = await request(limited.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: uniqueEmail(), password: PASSWORD })
          .expect(429);
        expect(res.body.code).toBe('RATE_LIMITED');
      } finally {
        await limited.close();
      }
    });
  });

  describe('stored secrets', () => {
    it('TC-059 TC-062 keeps no email, password, refresh token or key secret in the clear', async () => {
      const wallet = await createWallet(app);
      const created = await http()
        .post(`/api/v1/wallets/${wallet.walletId}/keys`)
        .set(bearer(wallet.accessToken))
        .send({ name: 'secret-check' })
        .expect(201);
      const dump = await db.query<{ row: string }>(
        `SELECT row_to_json(t)::text AS row FROM (
           SELECT a.*, rt.token_hash, k.secret_hash FROM accounts a
             JOIN wallets w ON w.account_id = a.id
             JOIN sessions s ON s.account_id = a.id
             JOIN refresh_tokens rt ON rt.session_id = s.id
             JOIN wallet_keys k ON k.wallet_id = w.id
            WHERE w.id = $1) t`,
        [wallet.walletId],
      );
      const text = dump.rows.map((r) => r.row).join('\n');
      expect(text.length).toBeGreaterThan(0);
      for (const secret of [
        wallet.email,
        PASSWORD,
        wallet.refreshToken,
        created.body.data.key.split('_').pop() as string,
      ]) {
        expect(text).not.toContain(secret);
        expect(text).not.toContain(Buffer.from(secret).toString('hex'));
      }
      expect(text).toContain('$argon2id$');
    });
  });
});
