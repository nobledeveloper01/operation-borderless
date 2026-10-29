import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  RedisContainer,
  type StartedRedisContainer,
} from '@testcontainers/redis';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import type { TestProject } from 'vitest/node';
import { migrations } from '../../src/migrations/index.js';
import { checkRouteCoverage } from './route-coverage.js';

let container: StartedPostgreSqlContainer | undefined;
let redis: StartedRedisContainer | undefined;
const routeHits = mkdtempSync(join(tmpdir(), 'borderless-routes-'));

declare module 'vitest' {
  export interface ProvidedContext {
    db: {
      host: string;
      port: number;
      database: string;
      user: string;
      password: string;
    };
    routeHits: string;
    redisUrl: string;
  }
}

// Starts a throwaway PostgreSQL and Redis and migrates the database once, so no test touches real ones.
export async function setup(project: TestProject): Promise<void> {
  redis = await new RedisContainer('redis:7.4-alpine').start();
  project.provide('redisUrl', redis.getConnectionUrl());
  container = await new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase('borderless_test')
    .withUsername('borderless')
    .withPassword('borderless-test')
    .start();
  const dataSource = new DataSource({
    type: 'postgres',
    host: container.getHost(),
    port: container.getPort(),
    database: container.getDatabase(),
    username: container.getUsername(),
    password: container.getPassword(),
    migrations,
  });
  await dataSource.initialize();
  await dataSource.runMigrations({ transaction: 'each' });
  await dataSource.destroy();
  project.provide('db', {
    host: container.getHost(),
    port: container.getPort(),
    database: container.getDatabase(),
    user: container.getUsername(),
    password: container.getPassword(),
  });
  project.provide('routeHits', routeHits);
}

// After a full run (yarn test), each documented route must have answered with success at least once.
export async function teardown(): Promise<void> {
  await container?.stop();
  await redis?.stop();
  if (process.env.ROUTE_COVERAGE !== 'check') return;
  checkRouteCoverage(
    routeHits,
    process.env.UPDATE_ROUTE_COVERAGE === '1'
      ? new URL('../../docs/api-test-coverage.md', import.meta.url)
      : undefined,
  );
}
