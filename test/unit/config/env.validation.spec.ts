import { validateEnv } from '../../../src/config/env.validation.js';

const base = { DB_PASSWORD: 'x' };

describe('validateEnv', () => {
  it('applies defaults and converts numbers', () => {
    const env = validateEnv({ ...base, PORT: '4000' });
    expect(env.PORT).toBe(4000);
    expect(env.DB_SSL).toBe('disable');
    expect(env.RATE_LIMIT_PER_MINUTE).toBe(120);
  });

  it('refuses a missing database password', () => {
    expect(() => validateEnv({})).toThrow(/DB_PASSWORD/);
  });

  it('refuses unknown values', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV/,
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
