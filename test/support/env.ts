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
});
