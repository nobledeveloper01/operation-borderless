// Writes a .env with fresh secrets from .env.example: yarn env:new [--production] [--force] [--out <file>]
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const production = args.includes('--production');
const force = args.includes('--force');
const outIndex = args.indexOf('--out');
const out = resolve(outIndex >= 0 ? args[outIndex + 1] : '.env');

const secret = (bytes) => randomBytes(bytes).toString('base64');
// Letters and digits only, so the value is safe in a shell, a URL and the compose file.
const password = () =>
  randomBytes(24).toString('base64url').replace(/[-_]/g, 'x');

const fresh = {
  DB_PASSWORD: password(),
  REDIS_PASSWORD: password(),
  PII_ENCRYPTION_KEYS: `1:${secret(32)}`,
  PII_ACTIVE_KEY_VERSION: '1',
  PII_LOOKUP_KEY: secret(32),
  OPS_TOKEN: `ops-${randomBytes(32).toString('base64url')}`,
  ...(production
    ? {
        NODE_ENV: 'production',
        DB_SSL: 'verify-full',
        JWT_ACTIVE_KID: `prod-${new Date().toISOString().slice(0, 10)}`,
      }
    : {}),
};

if (existsSync(out) && !force) {
  console.error(`${out} already exists. Rerun with --force to replace it.`);
  console.error(
    'Careful: new keys cannot read emails and phones encrypted with the old ones.',
  );
  process.exit(1);
}

// Keeps every line and comment of the example, swapping in the new values.
const template = readFileSync(
  new URL('../.env.example', import.meta.url),
  'utf8',
);
const written = new Set();
const body = template
  .split('\n')
  .map((line) => {
    const key = /^([A-Z0-9_]+)=/.exec(line)?.[1];
    if (!key || !(key in fresh)) return line;
    written.add(key);
    return `${key}=${fresh[key]}`;
  })
  .join('\n')
  .replace(
    /^REDIS_URL=redis:\/\/:[^@]*@/m,
    `REDIS_URL=redis://:${fresh.REDIS_PASSWORD}@`,
  );
const missing = Object.keys(fresh).filter((k) => !written.has(k));
writeFileSync(out, body + missing.map((k) => `${k}=${fresh[k]}\n`).join(''), {
  mode: 0o600,
});
console.log(
  `Wrote ${out} with a new database password, encryption keys and operator token.`,
);

if (production) {
  // Production never makes its own signing key, so one is written next to the settings.
  const dir = resolve(
    dirname(out),
    /^JWT_KEYS_DIR=(.*)$/m.exec(body)?.[1] ?? './keys/jwt',
  );
  const file = join(dir, `${fresh.JWT_ACTIVE_KID}.pem`);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }), {
    mode: 0o600,
  });
  console.log(`Wrote the ES256 signing key ${file}.`);
  console.log(
    'Still to set by hand: DB_HOST, DB_SSL_CA and CORS_ORIGINS for your servers.',
  );
}
console.log(
  'If a database volume already exists, it keeps its old password: run docker compose down -v first, which deletes local data.',
);
