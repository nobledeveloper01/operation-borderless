import { ApiProperty } from '@nestjs/swagger';
import type { Response } from 'express';
import { formatAmount } from '../../common/money/amount.js';
import type { IdempotentResult } from '../idempotency/idempotency.service.js';
import type { Posted } from '../ledger/ledger.service.js';
import { BalanceAfterDto } from './balance-after.dto.js';
import { TransactionDto } from './transaction.dto.js';
import { toTransactionDto } from './transaction.mapper.js';

export class MovementResultDto {
  @ApiProperty({ type: TransactionDto })
  transaction: TransactionDto;

  @ApiProperty({
    type: [BalanceAfterDto],
    description: "The caller's balances this movement touched, after it.",
  })
  balances: BalanceAfterDto[];
}

export function toMovementResult(
  posted: Posted,
  walletId: string,
): MovementResultDto {
  return {
    transaction: toTransactionDto(posted.transaction),
    balances: posted.balancesAfter
      .filter((b) => b.walletId === walletId)
      .map((b) => ({ currency: b.currency, amount: formatAmount(b.amount) })),
  };
}

// A replayed answer is marked, so a client can tell its retry did not move money again.
export function sendMovement(
  res: Response,
  result: IdempotentResult<MovementResultDto>,
): MovementResultDto {
  if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
  return result.body;
}
