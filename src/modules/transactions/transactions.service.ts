import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../common/errors/app-error.js';
import type {
  HistoryItemDto,
  HistoryPageDto,
  HistoryQueryDto,
} from './history.dto.js';
import type { TransactionDto, TransactionRow } from './transaction.dto.js';
import { TRANSACTION_COLUMNS, toTransactionDto } from './transaction.mapper.js';

// A wallet's transactions are the ones it sent or received; swaps are both at once.
const MATCHING = `(to_wallet_id = $1 OR from_wallet_id = $1)
  AND ($2::text[] IS NULL OR type = ANY ($2))
  AND ($3::text[] IS NULL OR from_currency::text = ANY ($3) OR to_currency::text = ANY ($3))`;

@Injectable()
export class TransactionsService {
  constructor(private readonly db: DataSource) {}

  // The count and the page come from one snapshot, so the total always matches the pages.
  history(walletId: string, query: HistoryQueryDto): Promise<HistoryPageDto> {
    const filters = [walletId, query.type ?? null, query.currency ?? null];
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SET TRANSACTION READ ONLY');
      const [counted] = await manager.query<{ total: number }[]>(
        `SELECT count(*)::int AS total FROM transactions WHERE ${MATCHING}`,
        filters,
      );
      const rows = await manager.query<TransactionRow[]>(
        `SELECT ${TRANSACTION_COLUMNS} FROM transactions WHERE ${MATCHING}
         ORDER BY created_at DESC, id DESC LIMIT $4 OFFSET $5`,
        [...filters, query.limit, (query.page - 1) * query.limit],
      );
      return {
        items: rows.map((row) => withDirection(row, walletId)),
        page: query.page,
        limit: query.limit,
        total: counted?.total ?? 0,
      };
    });
  }

  // Someone else's transaction looks exactly like a missing one.
  async get(transactionId: string, walletId: string): Promise<TransactionDto> {
    const [row] = await this.db.query<TransactionRow[]>(
      `SELECT ${TRANSACTION_COLUMNS} FROM transactions
       WHERE id = $1 AND (to_wallet_id = $2 OR from_wallet_id = $2)`,
      [transactionId, walletId],
    );
    if (!row) {
      throw new AppError(
        'TRANSACTION_NOT_FOUND',
        'No transaction with this ID.',
      );
    }
    return toTransactionDto(row);
  }
}

function withDirection(row: TransactionRow, walletId: string): HistoryItemDto {
  const direction =
    row.type === 'SWAP'
      ? 'INTERNAL'
      : row.from_wallet_id === walletId
        ? 'OUT'
        : 'IN';
  return { ...toTransactionDto(row), direction };
}
