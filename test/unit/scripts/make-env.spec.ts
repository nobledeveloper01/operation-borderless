import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateEnv } from '../../../src/common/config/env.validation.js';

const SCRIPT = new URL('../../../scripts/make-env.mjs', import.meta.url)
  .pathname;

const parse = (file: string): Record<string, string> =>
  Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => /^[A-Z0-9_]+=/.test(line))
      .map((line) => [
        line.slice(0, line.indexOf('=')),
        line.slice(line.indexOf('=') + 1),
      ]),
  );

describe('yarn env:new', () => {
  it('writes fresh secrets that pass the startup checks and never repeats them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'borderless-env-'));
    execFileSync('node', [SCRIPT, '--out', join(dir, 'a.env')]);
    execFileSync('node', [SCRIPT, '--out', join(dir, 'b.env')]);
    const a = parse(join(dir, 'a.env'));
    const b = parse(join(dir, 'b.env'));
    expect(() => validateEnv(a)).not.toThrow();
    for (const key of [
      'DB_PASSWORD',
      'REDIS_PASSWORD',
      'PII_ENCRYPTION_KEYS',
      'PII_LOOKUP_KEY',
      'OPS_TOKEN',
    ]) {
      expect([key, a[key] === b[key]]).toEqual([key, false]);
      expect([key, /bG9jYWwt|^local-|change-me/.test(a[key]!)]).toEqual([
        key,
        false,
      ]);
    }
    expect(statSync(join(dir, 'a.env')).mode & 0o777).toBe(0o600);
  });

  it('refuses to overwrite a .env without --force', () => {
    const dir = mkdtempSync(join(tmpdir(), 'borderless-env-'));
    execFileSync('node', [SCRIPT, '--out', join(dir, '.env')]);
    const before = readFileSync(join(dir, '.env'), 'utf8');
    const again = spawnSync('node', [SCRIPT, '--out', join(dir, '.env')]);
    expect(again.status).toBe(1);
    expect(readFileSync(join(dir, '.env'), 'utf8')).toBe(before);
  });

  it('makes production settings and a signing key, leaving only the server details to fill in', () => {
    const dir = mkdtempSync(join(tmpdir(), 'borderless-env-'));
    execFileSync('node', [SCRIPT, '--production', '--out', join(dir, '.env')]);
    const env = parse(join(dir, '.env'));
    expect(env.NODE_ENV).toBe('production');
    expect(existsSync(join(dir, 'keys/jwt', `${env.JWT_ACTIVE_KID}.pem`))).toBe(
      true,
    );
    // The database CA is the one value only the operator can supply.
    expect(() => validateEnv(env)).toThrow(
      /^Invalid environment: DB_SSL_CA is required when DB_SSL is verify-full$/,
    );
  });
});
