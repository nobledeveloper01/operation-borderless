import { validateEnv } from '../../../../src/common/config/env.validation.js';

const base = {
  DB_PASSWORD: 'x',
  PII_ENCRYPTION_KEYS: '1:bG9jYWwtcGlpLWVuY3J5cHRpb24ta2V5LXYxLTAwMDE=',
  PII_LOOKUP_KEY: 'bG9jYWwtcGlpLWxvb2t1cC1rZXktZm9yLWRldi0wMDA=',
};

describe('validateEnv', () => {
  it('applies defaults and converts numbers', () => {
    const env = validateEnv({ ...base, PORT: '4000' });
    expect(env.PORT).toBe(4000);
    expect(env.DB_SSL).toBe('disable');
    expect(env.RATE_LIMIT_PER_MINUTE).toBe(120);
  });

  it('refuses a missing database password', () => {
    expect(() => validateEnv({ ...base, DB_PASSWORD: undefined })).toThrow(
      /DB_PASSWORD/,
    );
  });

  it('refuses unknown values', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV/,
    );
  });

  it('only lets the API fetch rates from https addresses', () => {
    for (const url of [
      'http://open.er-api.com/v6/latest/USD',
      'file:///etc/passwd',
      'ftp://x.example',
    ]) {
      expect(() => validateEnv({ ...base, FX_PRIMARY_URL: url })).toThrow(
        /FX_PRIMARY_URL/,
      );
      expect(() => validateEnv({ ...base, FX_SECONDARY_URL: url })).toThrow(
        /FX_SECONDARY_URL/,
      );
    }
  });

  it('treats an empty operator token as unset and refuses a short or local one in production', () => {
    expect(validateEnv({ ...base, OPS_TOKEN: '' }).OPS_TOKEN).toBeUndefined();
    expect(() => validateEnv({ ...base, OPS_TOKEN: 'short' })).toThrow(
      /OPS_TOKEN/,
    );
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        DB_SSL: 'require',
        PII_ENCRYPTION_KEYS: '1:' + Buffer.alloc(32, 7).toString('base64'),
        PII_LOOKUP_KEY: Buffer.alloc(32, 9).toString('base64'),
        OPS_TOKEN: 'local-ops-token-for-the-compose-stack-only',
      }),
    ).toThrow(/local-only OPS_TOKEN/);
  });

  it('TC-061 refuses the local-only keys in production', () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        DB_SSL: 'verify-full',
        DB_SSL_CA: '/ca.pem',
      }),
    ).toThrow(/local-only encryption keys/);
  });

  it('refuses malformed or missing encryption keys', () => {
    expect(() =>
      validateEnv({ ...base, PII_ENCRYPTION_KEYS: '1:c2hvcnQ=' }),
    ).toThrow(/32 bytes/);
    expect(() => validateEnv({ ...base, PII_ACTIVE_KEY_VERSION: '2' })).toThrow(
      /version 2/,
    );
    expect(() => validateEnv({ ...base, PII_LOOKUP_KEY: '' })).toThrow(
      /PII_LOOKUP_KEY/,
    );
  });

  it('TC-061 refuses production without verified database TLS', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(
      /verify-full/,
    );
    expect(() => validateEnv({ ...base, DB_SSL: 'verify-full' })).toThrow(
      /DB_SSL_CA/,
    );
  });
});
