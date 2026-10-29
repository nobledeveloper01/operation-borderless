import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service.js';
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
    private readonly accounts: AccountsService,
  ) {}

  // Moves money to another wallet, converting at the current rate when the currencies differ.
  transfer(
    accountId: string,
    dto: CreateTransferDto,
    request: IdempotencyRequest,
  ): Promise<IdempotentResult<MovementResultDto>> {
    const given = [dto.toWalletId, dto.toEmail, dto.toPhoneNumber].filter(
      (v) => v !== undefined,
    );
    if (given.length !== 1) {
      throw new AppError(
        'VALIDATION_FAILED',
        'Give exactly one of toWalletId, toEmail or toPhoneNumber.',
      );
    }
    if (dto.toWalletId !== undefined)
      refuseSelf(dto.fromWalletId, dto.toWalletId);
    const toCurrency = dto.toCurrency ?? dto.fromCurrency;
    return this.idempotency.run(accountId, request, async (manager) => {
      const toWalletId =
        dto.toWalletId ?? (await this.receiverFor(manager, dto));
      refuseSelf(dto.fromWalletId, toWalletId);
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
          toWalletId,
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
            walletId: toWalletId,
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

  // An unknown email or phone looks exactly like an unknown wallet ID.
  private async receiverFor(
    manager: EntityManager,
    dto: CreateTransferDto,
  ): Promise<string> {
    const walletId = await this.accounts.walletIdFor(manager, {
      email: dto.toEmail,
      phoneNumber: dto.toPhoneNumber,
    });
    if (!walletId)
      throw new AppError('WALLET_NOT_FOUND', 'No wallet with this ID.');
    return walletId;
  }
}

function refuseSelf(fromWalletId: string, toWalletId: string): void {
  if (fromWalletId === toWalletId) {
    throw new AppError(
      'SAME_WALLET',
      'A wallet cannot send to itself. Use a swap to change currency inside one wallet.',
    );
  }
}
