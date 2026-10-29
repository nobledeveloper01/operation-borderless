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
import type { CreateTransferDto } from './dto.js';

@Injectable()
export class TransfersService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly idempotency: IdempotencyService,
    private readonly quotes: QuotesService,
  ) {}

  // Moves money to another wallet, converting at the current rate when the currencies differ.
  transfer(
    accountId: string,
    dto: CreateTransferDto,
    request: IdempotencyRequest,
  ): Promise<IdempotentResult<MovementResultDto>> {
    if (dto.fromWalletId === dto.toWalletId) {
      throw new AppError(
        'SAME_WALLET',
        'A wallet cannot send to itself. Use a swap to change currency inside one wallet.',
      );
    }
    const toCurrency = dto.toCurrency ?? dto.fromCurrency;
    return this.idempotency.run(accountId, request, async (manager) => {
      const price = await this.quotes.priceMovement(
        manager,
        accountId,
        {
          from: dto.fromCurrency,
          to: toCurrency,
          amount: parseAmount(dto.amount),
        },
        dto.quoteId,
      );
      const posted = await this.ledger.post(
        manager,
        {
          type: 'TRANSFER',
          fromWalletId: dto.fromWalletId,
          toWalletId: dto.toWalletId,
          fromCurrency: dto.fromCurrency,
          toCurrency,
          ...pricedFields(price),
        },
        [
          {
            walletId: dto.fromWalletId,
            currency: dto.fromCurrency,
            delta: -price.amount,
          },
          {
            walletId: dto.toWalletId,
            currency: toCurrency,
            delta: price.received,
          },
        ],
      );
      // The answer shows only the sender's own balance, never the receiver's.
      return {
        body: toMovementResult(posted, dto.fromWalletId),
        transactionId: posted.transaction.id,
        type: posted.transaction.type,
      };
    });
  }
}
