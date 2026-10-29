import { Injectable } from '@nestjs/common';
import { EnvironmentVariables } from '../../common/config/env.validation.js';
import type { Stablecoin } from '../../common/currencies/currency.js';
import { AppError } from '../../common/errors/app-error.js';
import {
  type FeeOverrides,
  pairKey,
  parseFeeOverrides,
  priceConversion,
} from '../../common/money/fees.js';
import { formatRate } from '../../common/money/rate.js';
import { FxService } from '../fx/fx.service.js';

export interface Price {
  amount: bigint;
  feeBps: number;
  fee: bigint;
  rounding: bigint;
  received: bigint;
  rate: string;
  rateSource: string;
  rateAsOf: Date | null;
  fxSnapshotId: string | null;
}

// The ledger stores exactly what the price said, so a record always explains its own amounts.
export function pricedFields(price: Price) {
  return {
    fromAmount: price.amount,
    toAmount: price.received,
    rate: price.rate,
    rateSource: price.rateSource,
    rateAsOf: price.rateAsOf,
    fxSnapshotId: price.fxSnapshotId,
    feeBps: price.feeBps,
    fee: price.fee,
    rounding: price.rounding,
  };
}

// Every conversion is priced here, so a swap, a transfer and a quote can never disagree.
@Injectable()
export class PricingService {
  private readonly overrides: FeeOverrides;

  constructor(
    private readonly fx: FxService,
    private readonly config: EnvironmentVariables,
  ) {
    this.overrides = parseFeeOverrides(config.FEE_BPS_BY_PAIR);
  }

  feeBps(from: Stablecoin, to: Stablecoin): number {
    if (from === to) return 0;
    return this.overrides.get(pairKey(from, to)) ?? this.config.FEE_BPS;
  }

  price(from: Stablecoin, to: Stablecoin, amount: bigint): Price {
    const quote = this.fx.quote(from, to);
    const feeBps = this.feeBps(from, to);
    const priced = priceConversion(amount, quote.rate, feeBps);
    if (priced.received === 0n) {
      throw new AppError(
        'AMOUNT_TOO_SMALL',
        `After fees this amount is worth less than 0.000001 ${to}.`,
      );
    }
    return {
      amount,
      feeBps,
      ...priced,
      rate: formatRate(quote.rate),
      rateSource: quote.source,
      rateAsOf: quote.asOf,
      fxSnapshotId: quote.snapshotId,
    };
  }
}
