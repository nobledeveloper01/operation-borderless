import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { AppError } from '../../common/errors/app-error.js';
import { isTransientConflict } from '../../common/database/db-errors.js';
import { returned } from '../../common/database/returned.js';
import { DB_CONFLICT_RETRY, withRetry } from '../../common/retry/retry.js';
import { sameHash } from '../auth/secrets.js';
import type { IdempotencyRequest } from './idempotency-key.decorator.js';

export const KEY_TTL_HOURS = 24;
const CLEANUP_EVERY_MS = 3_600_000;

export interface IdempotentResult<T> {
  body: T;
  replayed: boolean;
}

@Injectable()
export class IdempotencyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IdempotencyService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly db: DataSource) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.removeExpired(), CLEANUP_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  // Claims the key in the same transaction as the money movement, so it is stored only if the movement commits.
  async run<T>(
    accountId: string,
    request: IdempotencyRequest,
    work: (
      manager: EntityManager,
    ) => Promise<{ body: T; transactionId: string }>,
  ): Promise<IdempotentResult<T>> {
    return withRetry(
      () => this.attempt(accountId, request, work),
      DB_CONFLICT_RETRY,
      isTransientConflict,
      {
        onRetry: (attempt, error, delayMs) =>
          this.logger.warn(
            { attempt, code: (error as { code?: string }).code, delayMs },
            'Retrying a money transaction after a database conflict',
          ),
      },
    );
  }

  private attempt<T>(
    accountId: string,
    request: IdempotencyRequest,
    work: (
      manager: EntityManager,
    ) => Promise<{ body: T; transactionId: string }>,
  ): Promise<IdempotentResult<T>> {
    return this.db.transaction(async (manager) => {
      // An expired key may be used again, so its old row is cleared first.
      await manager.query(
        'DELETE FROM idempotency_keys WHERE account_id = $1 AND key = $2 AND expires_at <= now()',
        [accountId, request.key],
      );
      // A parallel request with the same key waits here until the first one commits or rolls back.
      const claimed = await manager.query<{ key: string }[]>(
        `INSERT INTO idempotency_keys (account_id, key, request_hash, expires_at)
         VALUES ($1, $2, $3, now() + make_interval(hours => $4))
         ON CONFLICT (account_id, key) DO NOTHING RETURNING key`,
        [accountId, request.key, request.fingerprint, KEY_TTL_HOURS],
      );
      if (claimed.length === 0)
        return this.replay<T>(manager, accountId, request);

      const { body, transactionId } = await work(manager);
      await manager.query(
        `UPDATE idempotency_keys SET status_code = 201, response_body = $3, transaction_id = $4
          WHERE account_id = $1 AND key = $2`,
        [accountId, request.key, JSON.stringify(body), transactionId],
      );
      return { body, replayed: false };
    });
  }

  private async replay<T>(
    manager: EntityManager,
    accountId: string,
    request: IdempotencyRequest,
  ): Promise<IdempotentResult<T>> {
    const rows = await manager.query<
      { request_hash: Buffer; response_body: T }[]
    >(
      'SELECT request_hash, response_body FROM idempotency_keys WHERE account_id = $1 AND key = $2',
      [accountId, request.key],
    );
    const row = rows[0];
    if (!row)
      throw new AppError(
        'SERVICE_BUSY',
        'This request is still being processed. Try again shortly.',
      );
    if (!sameHash(row.request_hash, request.fingerprint)) {
      throw new AppError(
        'IDEMPOTENCY_KEY_REUSED',
        'This Idempotency-Key was already used for a different request. Use a new key for a new request.',
      );
    }
    return { body: row.response_body, replayed: true };
  }

  async removeExpired(): Promise<number> {
    try {
      return returned<{ key: string }>(
        await this.db.query(
          'DELETE FROM idempotency_keys WHERE expires_at <= now() RETURNING key',
        ),
      ).length;
    } catch (error) {
      this.logger.warn(
        { reason: (error as Error).message },
        'Could not remove expired idempotency keys',
      );
      return 0;
    }
  }
}
