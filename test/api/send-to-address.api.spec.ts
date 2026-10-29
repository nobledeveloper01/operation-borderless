import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { connect } from '../support/db.js';
import { balancesOf, deposit, transfer } from '../support/money.js';
import { createTestApp } from '../support/test-app.js';
import { createWallet, PASSWORD } from '../support/wallets.js';

describe('sending to an email or phone number', () => {
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

  it('finds the wallet by email in any case and spacing', async () => {
    const a = await createWallet(app);
    const b = await createWallet(app);
    await deposit(app, a, 'USDx', '10').expect(201);
    const res = await transfer(app, a, {
      toEmail: `  ${b.email.toUpperCase()} `,
      fromCurrency: 'USDx',
      amount: '4',
    }).expect(201);
    expect(res.body.data.transaction.toWalletId).toBe(b.walletId);
    expect(JSON.stringify(res.body)).not.toContain(b.email);
    expect((await balancesOf(db, b.walletId)).USDx).toBe('4000000');
  });

  it('finds the wallet by phone in local or international format', async () => {
    const a = await createWallet(app);
    await deposit(app, a, 'cNGN', '100').expect(201);
    const local = `080${String(Date.now()).slice(-8)}`;
    const created = await request(app.getHttpServer())
      .post('/api/v1/wallets')
      .send({ phoneNumber: local, password: PASSWORD })
      .expect(201);
    const receiver = created.body.data.walletId as string;
    const international = `+234${local.slice(1)}`;
    for (const toPhoneNumber of [international, local]) {
      const res = await transfer(app, a, {
        toPhoneNumber,
        fromCurrency: 'cNGN',
        amount: '1',
      }).expect(201);
      expect(res.body.data.transaction.toWalletId).toBe(receiver);
    }
  });

  it('answers an unknown address exactly like an unknown wallet', async () => {
    const a = await createWallet(app);
    await deposit(app, a, 'USDx', '1').expect(201);
    const byEmail = await transfer(app, a, {
      toEmail: `nobody-${Date.now()}@example.com`,
      fromCurrency: 'USDx',
      amount: '1',
    }).expect(404);
    const byId = await transfer(app, a, {
      toWalletId: '00000000-0000-4000-8000-000000000000',
      fromCurrency: 'USDx',
      amount: '1',
    }).expect(404);
    expect(byEmail.body.code).toBe(byId.body.code);
    expect(byEmail.body.message).toBe(byId.body.message);
  });

  it('refuses sending to your own email, and needs exactly one receiver', async () => {
    const a = await createWallet(app);
    const b = await createWallet(app);
    await deposit(app, a, 'USDx', '5').expect(201);
    const self = await transfer(app, a, {
      toEmail: a.email,
      fromCurrency: 'USDx',
      amount: '1',
    }).expect(422);
    expect(self.body.code).toBe('SAME_WALLET');
    for (const receiver of [
      {},
      { toWalletId: b.walletId, toEmail: b.email },
      { toEmail: b.email, toPhoneNumber: '+2348012345678' },
    ]) {
      const res = await transfer(app, a, {
        fromCurrency: 'USDx',
        amount: '1',
        ...receiver,
      }).expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    }
    await transfer(app, a, {
      toEmail: 'not-an-email',
      fromCurrency: 'USDx',
      amount: '1',
    }).expect(400);
    expect((await balancesOf(db, a.walletId)).USDx).toBe('5000000');
  });
});
