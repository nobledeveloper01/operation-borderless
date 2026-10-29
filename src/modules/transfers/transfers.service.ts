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
import type { CreateTransferDto } from './dto.js';

@Injectable()
export class TransfersService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly idempotency: IdempotencyService,
    private readonly fx: FxService,
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
      const quote = this.fx.quote(dto.fromCurrency, toCurrency);
      const amount = parseAmount(dto.amount);
      const received = convert(amount, quote.rate);
      if (received === 0n) {
        throw new AppError(
          'AMOUNT_TOO_SMALL',
          `This amount is worth less than 0.000001 ${toCurrency}.`,
        );
      }
      const posted = await this.ledger.post(
        manager,
        {
          type: 'TRANSFER',
          fromWalletId: dto.fromWalletId,
          toWalletId: dto.toWalletId,
          fromCurrency: dto.fromCurrency,
          fromAmount: amount,
          toCurrency,
          toAmount: received,
          rate: formatRate(quote.rate),
          rateSource: quote.source,
          rateAsOf: quote.asOf,
          fxSnapshotId: quote.snapshotId,
        },
        [
          {
            walletId: dto.fromWalletId,
            currency: dto.fromCurrency,
            delta: -amount,
          },
          { walletId: dto.toWalletId, currency: toCurrency, delta: received },
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
