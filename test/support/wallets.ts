import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

export const PASSWORD = 'correct horse battery staple';

export interface TestWallet {
  walletId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

export const uniqueEmail = () => `user-${randomUUID()}@example.com`;

// Creates a fresh wallet through the real API and returns what later calls need.
export async function createWallet(
  app: NestExpressApplication,
  email = uniqueEmail(),
): Promise<TestWallet> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/wallets')
    .send({ email, password: PASSWORD })
    .expect(201);
  const data = res.body.data as {
    walletId: string;
    session: { accessToken: string; refreshToken: string };
  };
  return {
    walletId: data.walletId,
    email,
    accessToken: data.session.accessToken,
    refreshToken: data.session.refreshToken,
  };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
