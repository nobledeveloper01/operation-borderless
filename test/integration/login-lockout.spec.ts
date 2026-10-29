import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import * as passwords from '../../src/modules/auth/passwords.js';
import { connect } from '../support/db.js';
import { createTestApp } from '../support/test-app.js';
import { createWallet, PASSWORD } from '../support/wallets.js';

vi.mock('../../src/modules/auth/passwords.js', async (importOriginal) => {
  const actual = await importOriginal<typeof passwords>();
  return { ...actual, verifyPassword: vi.fn(actual.verifyPassword) };
});

describe('login lockout under parallel guesses', () => {
  let app: NestExpressApplication;
  let db: pg.Client;

  beforeAll(async () => {
    app = await createTestApp();
    db = await connect();
  });

  afterAll(async () => {
    await db.end();
    await app.close();
  });

  it('refuses a guess that arrives while the last allowed guess is still being checked', async () => {
    const wallet = await createWallet(app);
    await db.query(
      'UPDATE accounts SET failed_logins = 4 WHERE id = (SELECT account_id FROM wallets WHERE id = $1)',
      [wallet.walletId],
    );

    // The first wrong guess is held inside the password check until the second guess has been answered.
    const verify = vi.mocked(passwords.verifyPassword);
    const realVerify = verify.getMockImplementation()!;
    let entered!: () => void;
    let release!: () => void;
    const inside = new Promise<void>((resolve) => (entered = resolve));
    const gate = new Promise<void>((resolve) => (release = resolve));
    verify.mockImplementationOnce(async () => {
      entered();
      await gate;
      return false;
    });

    const server = app.getHttpServer();
    const wrong = request(server)
      .post('/api/v1/auth/login')
      .send({ email: wallet.email, password: 'wrong password!!' })
      .then((r) => r);
    await inside;
    const right = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: wallet.email, password: PASSWORD });
    release();
    expect((await wrong).status).toBe(401);
    expect(right.status).toBe(401);
    verify.mockImplementation(realVerify);
  });
});
