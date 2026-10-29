import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

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

// Starts a throwaway PostgreSQL for the whole run, so tests never touch a real database.
export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase('borderless_test')
    .withUsername('borderless')
    .withPassword('borderless-test')
    .start();
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
