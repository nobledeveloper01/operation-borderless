import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import type { TestProject } from 'vitest/node';
import { migrations } from '../../src/migrations/index.js';

let container: StartedPostgreSqlContainer | undefined;

declare module 'vitest' {
  export interface ProvidedContext {
    db: {
      host: string;
      port: number;
      database: string;
      user: string;
      password: string;
    };
  }
}

// Starts a throwaway PostgreSQL and migrates it once, so no test ever touches a real database.
export async function setup(project: TestProject): Promise<void> {
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
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
