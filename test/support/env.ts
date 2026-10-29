import { inject } from 'vitest';

const db = inject('db');
Object.assign(process.env, {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DB_HOST: db.host,
  DB_PORT: String(db.port),
  DB_NAME: db.database,
  DB_USER: db.user,
  DB_PASSWORD: db.password,
  DB_SSL: 'disable',
  RATE_LIMIT_PER_MINUTE: '1000',
  PII_ENCRYPTION_KEYS: '1:bG9jYWwtcGlpLWVuY3J5cHRpb24ta2V5LXYxLTAwMDE=',
  PII_LOOKUP_KEY: 'bG9jYWwtcGlpLWxvb2t1cC1rZXktZm9yLWRldi0wMDA=',
});
