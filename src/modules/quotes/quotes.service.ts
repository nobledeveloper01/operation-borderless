import { Injectable, Logger } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { EnvironmentVariables } from '../../common/config/env.validation.js';
import type { Stablecoin } from '../../common/currencies/currency.js';
import { returned } from '../../common/database/returned.js';
import { AppError } from '../../common/errors/app-error.js';
import { formatAmount } from '../../common/money/amount.js';
import { parseRate } from '../../common/money/rate.js';
import { type Price, PricingService } from '../pricing/pricing.service.js';
import type { QuoteDto } from './dto.js';

interface QuoteRow {
  id: string;
  account_id: string;
  from_currency: Stablecoin;
  to_currency: Stablecoin;
  amount: string;
  rate: string;
  rate_source: string;
  rate_as_of: Date | null;
  fx_snapshot_id: string | null;
  fee_bps: number;
  expires_at: Date;
  used_at: Date | null;
  expired: boolean;
}

export interface Movement {
  from: Stablecoin;
  to: Stablecoin;
  amount: bigint;
}

@Injectable()
export class QuotesService {
  private readonly logger = new Logger(QuotesService.name);

  constructor(
    private readonly db: DataSource,
    private readonly pricing: PricingService,
    private readonly config: EnvironmentVariables,
  ) {}

  // Prices now and holds that rate and fee for a short time; nothing moves and no funds are reserved.
  async create(accountId: string, movement: Movement): Promise<QuoteDto> {
    const price = this.pricing.price(
      movement.from,
      movement.to,
      movement.amount,
    );
    const [row] = await this.db.query<{ id: string; expires_at: Date }[]>(
      `INSERT INTO fx_quotes (account_id, from_currency, to_currency, amount, rate, rate_source, rate_as_of,
                              fx_snapshot_id, fee_bps, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() + make_interval(secs => $10))
       RETURNING id, expires_at`,
      [
        accountId,
        movement.from,
        movement.to,
        movement.amount.toString(),
        price.rate,
        price.rateSource,
        price.rateAsOf,
        price.fxSnapshotId,
        price.feeBps,
        this.config.QUOTE_TTL_SECONDS,
      ],
    );
    return toQuoteDto(row!.id, movement, price, row!.expires_at);
  }

  // Uses the quote inside the money transaction, so it is spent only if the movement commits.
  async redeem(
    manager: EntityManager,
    accountId: string,
    quoteId: string,
    movement: Movement,
  ): Promise<Price> {
    const rows = await manager.query<QuoteRow[]>(
      `SELECT *, expires_at <= now() AS expired FROM fx_quotes WHERE id = $1 FOR UPDATE`,
      [quoteId],
    );
    const quote = rows[0];
    if (!quote || quote.account_id !== accountId)
      throw new AppError('QUOTE_NOT_FOUND', 'No quote with this ID.');
    if (quote.used_at)
      throw new AppError(
        'QUOTE_ALREADY_USED',
        'This quote has already been used. Ask for a new one.',
      );
    if (quote.expired)
      throw new AppError(
        'QUOTE_EXPIRED',
        'This quote has expired. Ask for a new one.',
      );
    if (
      quote.from_currency !== movement.from ||
      quote.to_currency !== movement.to ||
      BigInt(quote.amount) !== movement.amount
    ) {
      throw new AppError(
        'QUOTE_MISMATCH',
        'The currencies and amount must match the quote exactly.',
        {
          fromCurrency: quote.from_currency,
          toCurrency: quote.to_currency,
          amount: formatAmount(BigInt(quote.amount)),
        },
      );
    }
    await manager.query('UPDATE fx_quotes SET used_at = now() WHERE id = $1', [
      quoteId,
    ]);
    return this.pricing.priceAt(movement.to, movement.amount, {
      rate: parseRate(quote.rate),
      rateSource: quote.rate_source,
      rateAsOf: quote.rate_as_of,
      fxSnapshotId: quote.fx_snapshot_id,
      feeBps: quote.fee_bps,
    });
  }

  // Prices a movement from its quote when one is given, otherwise at the current rate.
  priceMovement(
    manager: EntityManager,
    accountId: string,
    movement: Movement,
    quoteId: string | undefined,
  ): Promise<Price> | Price {
    return quoteId
      ? this.redeem(manager, accountId, quoteId, movement)
      : this.pricing.price(movement.from, movement.to, movement.amount);
  }

  async removeExpired(): Promise<number> {
    try {
      return returned<{ id: string }>(
        await this.db.query(
          `DELETE FROM fx_quotes WHERE expires_at <= now() - interval '1 hour' RETURNING id`,
        ),
      ).length;
    } catch (error) {
      this.logger.warn(
        { reason: (error as Error).message },
        'Could not remove expired quotes',
      );
      return 0;
    }
  }
}

function toQuoteDto(
  id: string,
  movement: Movement,
  price: Price,
  expiresAt: Date,
): QuoteDto {
  return {
    quoteId: id,
    fromCurrency: movement.from,
    toCurrency: movement.to,
    fromAmount: formatAmount(price.amount),
    feeBps: price.feeBps,
    feeAmount: formatAmount(price.fee),
    roundingAmount: formatAmount(price.rounding),
    toAmount: formatAmount(price.received),
    rate: price.rate,
    rateSource: price.rateSource,
    rateAsOf: price.rateAsOf?.toISOString() ?? null,
    expiresAt: expiresAt.toISOString(),
  };
}
