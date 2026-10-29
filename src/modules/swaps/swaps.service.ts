import { Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error.js';
import { parseAmount } from '../../common/money/amount.js';
import { convert, formatRate } from '../../common/money/rate.js';
import { FxService } from '../fx/fx.service.js';
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
import type { CreateSwapDto } from './dto.js';

@Injectable()
export class SwapsService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly idempotency: IdempotencyService,
    private readonly fx: FxService,
  ) {}

  swap(
    accountId: string,
    walletId: string,
    dto: CreateSwapDto,
    request: IdempotencyRequest,
  ): Promise<IdempotentResult<MovementResultDto>> {
    if (dto.fromCurrency === dto.toCurrency) {
      throw new AppError(
        'SAME_CURRENCY',
        'A swap needs two different currencies.',
      );
    }
    return this.idempotency.run(accountId, request, async (manager) => {
      // Priced inside the claim, so a replay returns the first answer even if the rates have gone stale since.
      const quote = this.fx.quote(dto.fromCurrency, dto.toCurrency);
      const amount = parseAmount(dto.amount);
      const received = convert(amount, quote.rate);
      if (received === 0n) {
        throw new AppError(
          'AMOUNT_TOO_SMALL',
          `This amount is worth less than 0.000001 ${dto.toCurrency}.`,
        );
      }
      const posted = await this.ledger.post(
        manager,
        {
          type: 'SWAP',
          fromWalletId: walletId,
          toWalletId: walletId,
          fromCurrency: dto.fromCurrency,
          fromAmount: amount,
          toCurrency: dto.toCurrency,
          toAmount: received,
          rate: formatRate(quote.rate),
          rateSource: quote.source,
          rateAsOf: quote.asOf,
          fxSnapshotId: quote.snapshotId,
        },
        [
          { walletId, currency: dto.fromCurrency, delta: -amount },
          { walletId, currency: dto.toCurrency, delta: received },
        ],
      );
      return {
        body: toMovementResult(posted, walletId),
        transactionId: posted.transaction.id,
        type: posted.transaction.type,
      };
    });
  }
}
