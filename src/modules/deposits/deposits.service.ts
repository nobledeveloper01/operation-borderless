import { Injectable } from '@nestjs/common';
import { parseAmount } from '../../common/money/amount.js';
import { pow10 } from '../../common/money/decimal.js';
import { formatRate, RATE_SCALE } from '../../common/money/rate.js';
import type { IdempotencyRequest } from '../idempotency/idempotency-key.decorator.js';
import {
  IdempotencyService,
  type IdempotentResult,
} from '../idempotency/idempotency.service.js';
import { LedgerService } from '../ledger/ledger.service.js';
import {
  type MovementResultDto,
  toMovementResult,
} from '../transactions/movement-result.dto.js';
import type { CreateDepositDto } from './dto.js';

@Injectable()
export class DepositsService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly idempotency: IdempotencyService,
  ) {}

  // A simulated deposit: money arrives at once, with one transaction and one ledger line.
  deposit(
    accountId: string,
    walletId: string,
    dto: CreateDepositDto,
    request: IdempotencyRequest,
  ): Promise<IdempotentResult<MovementResultDto>> {
    return this.idempotency.run(accountId, request, async (manager) => {
      const amount = parseAmount(dto.amount);
      const posted = await this.ledger.post(
        manager,
        {
          type: 'DEPOSIT',
          fromWalletId: null,
          toWalletId: walletId,
          fromCurrency: null,
          fromAmount: null,
          toCurrency: dto.currency,
          toAmount: amount,
          rate: formatRate(pow10(RATE_SCALE)),
          rateSource: 'none',
          rateAsOf: null,
          fxSnapshotId: null,
        },
        [{ walletId, currency: dto.currency, delta: amount }],
      );
      return {
        body: toMovementResult(posted, walletId),
        transactionId: posted.transaction.id,
        type: posted.transaction.type,
      };
    });
  }
}
