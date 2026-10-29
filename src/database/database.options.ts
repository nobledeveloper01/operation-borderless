import { readFileSync } from 'node:fs';
import type { TlsOptions } from 'node:tls';
import type { DataSourceOptions } from 'typeorm';
import type { EnvironmentVariables } from '../config/env.validation.js';
import {
  Account,
  Balance,
  RefreshToken,
  Session,
  Wallet,
  WalletKey,
} from '../accounts/entities.js';
import { migrations } from '../migrations/index.js';

const entities = [Account, Balance, RefreshToken, Session, Wallet, WalletKey];
import { SnakeNamingStrategy } from './snake-naming.strategy.js';

function ssl(config: EnvironmentVariables): boolean | TlsOptions {
  if (config.DB_SSL === 'disable') return false;
  if (config.DB_SSL === 'require') return { rejectUnauthorized: false };
  return {
    rejectUnauthorized: true,
    ca: readFileSync(config.DB_SSL_CA ?? '', 'utf8'),
  };
}

export function databaseOptions(
  config: EnvironmentVariables,
): DataSourceOptions {
  return {
    type: 'postgres',
    host: config.DB_HOST,
    port: config.DB_PORT,
    database: config.DB_NAME,
    username: config.DB_USER,
    password: config.DB_PASSWORD,
    ssl: ssl(config),
    namingStrategy: new SnakeNamingStrategy(),
    entities,
    migrations,
    synchronize: false,
    migrationsRun: false,
    // Hard time limits stop a stuck query or lock from hanging a request forever.
    extra: {
      max: 10,
      options: '-c statement_timeout=5000 -c lock_timeout=3000 -c TimeZone=UTC',
    },
  };
}
