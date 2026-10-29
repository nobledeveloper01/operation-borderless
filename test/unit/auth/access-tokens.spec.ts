import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccessTokens } from '../../../src/auth/access-tokens.js';
import { loadSigningKeys } from '../../../src/auth/signing-keys.js';
import { validateEnv } from '../../../src/config/env.validation.js';

const base = {
  DB_PASSWORD: 'x',
  PII_ENCRYPTION_KEYS: '1:bG9jYWwtcGlpLWVuY3J5cHRpb24ta2V5LXYxLTAwMDE=',
  PII_LOOKUP_KEY: 'bG9jYWwtcGlpLWxvb2t1cC1rZXktZm9yLWRldi0wMDA=',
};

const tokensFor = (dir: string, kid: string) =>
  new AccessTokens(
    validateEnv({ ...base, JWT_KEYS_DIR: dir, JWT_ACTIVE_KID: kid }),
  );

describe('access tokens', () => {
  it('creates a missing key outside production and refuses to in production', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jwt-'));
    loadSigningKeys(dir, 'dev-1', true);
    expect(readdirSync(dir)).toEqual(['dev-1.pem']);
    expect(() =>
      loadSigningKeys(mkdtempSync(join(tmpdir(), 'jwt-')), 'dev-1', false),
    ).toThrow(/No signing key/);
  });

  it('TC-058 keeps old tokens valid while keys rotate, and drops them once the old key is gone', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jwt-'));
    const before = tokensFor(dir, 'k1');
    const old = await before.issue({ accountId: 'a', sessionId: 's' });

    writeFileSync(
      join(dir, 'k2.pem'),
      generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({
        type: 'pkcs8',
        format: 'pem',
      }),
    );
    const after = tokensFor(dir, 'k2');
    expect(await after.verify(old.token)).toEqual({
      accountId: 'a',
      sessionId: 's',
    });
    const fresh = await after.issue({ accountId: 'a', sessionId: 's2' });
    expect(
      JSON.parse(
        Buffer.from(fresh.token.split('.')[0]!, 'base64url').toString(),
      ),
    ).toMatchObject({ alg: 'ES256', kid: 'k2' });

    const otherDir = mkdtempSync(join(tmpdir(), 'jwt-'));
    expect(await tokensFor(otherDir, 'k1').verify(old.token)).toBeUndefined();
  });

  it('refuses a key file that is not EC P-256', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jwt-'));
    writeFileSync(
      join(dir, 'rsa.pem'),
      generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
        type: 'pkcs8',
        format: 'pem',
      }),
    );
    expect(() => loadSigningKeys(dir, 'rsa', false)).toThrow(/P-256/);
  });
});
