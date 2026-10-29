import { Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error.js';
import { parseAmount } from '../../common/money/amount.js';
import { pricedFields } from '../pricing/pricing.service.js';
import { QuotesService } from '../quotes/quotes.service.js';
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
    private readonly quotes: QuotesService,
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
      const price = await this.quotes.priceMovement(
        manager,
        accountId,
        {
          from: dto.fromCurrency,
          to: dto.toCurrency,
          amount: parseAmount(dto.amount),
        },
        dto.quoteId,
      );
      const posted = await this.ledger.post(
        manager,
        {
          type: 'SWAP',
          fromWalletId: walletId,
          toWalletId: walletId,
          fromCurrency: dto.fromCurrency,
          toCurrency: dto.toCurrency,
          ...pricedFields(price),
        },
        [
          { walletId, currency: dto.fromCurrency, delta: -price.amount },
          { walletId, currency: dto.toCurrency, delta: price.received },
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
