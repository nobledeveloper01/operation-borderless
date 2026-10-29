import { ApiProperty } from '@nestjs/swagger';
import {
  STABLECOINS,
  type Stablecoin,
} from '../../common/currencies/currency.js';

export const ATTRIBUTION =
  'Rates by Exchange Rate API (https://www.exchangerate-api.com)';

export class RatePairDto {
  @ApiProperty({ enum: STABLECOINS, example: 'USDx' })
  from: Stablecoin;

  @ApiProperty({ enum: STABLECOINS, example: 'cNGN' })
  to: Stablecoin;

  @ApiProperty({
    example: '1346.2368880000',
    description: 'Units of `to` per 1 unit of `from`, 10 decimal places.',
  })
  rate: string;

  @ApiProperty({
    example: '2026-10-29T00:02:31.000Z',
    description: "The provider's publication time for this rate.",
  })
  refreshedAt: string;
}

export class RatesDto {
  @ApiProperty({ example: 'USDx' })
  base: 'USDx';

  @ApiProperty({ enum: ['exchangerate-api', 'currency-api', 'fixed-table'] })
  source: string;

  @ApiProperty({
    description:
      'True once the rates are older than the freshness limit; conversions are then refused.',
  })
  isStale: boolean;

  @ApiProperty({ example: '2026-10-29T00:02:31.000Z' })
  providerUpdatedAt: string;

  @ApiProperty({ example: '2026-10-29T09:00:03.000Z' })
  fetchedAt: string;

  @ApiProperty({
    type: [RatePairDto],
    description: 'Every ordered pair of the five stablecoins (20 pairs).',
  })
  pairs: RatePairDto[];

  @ApiProperty({ example: ATTRIBUTION })
  attribution: string;
}
