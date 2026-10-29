import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import {
  STABLECOINS,
  type Stablecoin,
} from '../../common/currencies/currency.js';
import { AmountField } from '../../common/validation/amount.js';

const coin = { message: `currency must be one of ${STABLECOINS.join(', ')}.` };

export class CreateQuoteDto {
  @ApiProperty({ enum: STABLECOINS, example: 'USDx' })
  @IsIn(STABLECOINS, coin)
  fromCurrency: Stablecoin;

  @ApiProperty({ enum: STABLECOINS, example: 'cGHS' })
  @IsIn(STABLECOINS, coin)
  toCurrency: Stablecoin;

  @AmountField(
    'Amount of fromCurrency to send, decimal string with up to 6 places.',
  )
  amount: string;
}

export class QuoteDto {
  @ApiProperty({ description: 'Pass this as quoteId on a swap or transfer.' })
  quoteId: string;

  @ApiProperty({ enum: STABLECOINS })
  fromCurrency: Stablecoin;

  @ApiProperty({ enum: STABLECOINS })
  toCurrency: Stablecoin;

  @ApiProperty({ example: '25.000000' })
  fromAmount: string;

  @ApiProperty({ example: 50 })
  feeBps: number;

  @ApiProperty({ example: '0.125000' })
  feeAmount: string;

  @ApiProperty({ example: '0.000000' })
  roundingAmount: string;

  @ApiProperty({
    example: '289.542910',
    description: 'Exactly what the receiver gets if the quote is used in time.',
  })
  toAmount: string;

  @ApiProperty({ example: '11.6399160000' })
  rate: string;

  @ApiProperty({ example: 'exchangerate-api' })
  rateSource: string;

  @ApiProperty({
    nullable: true,
    type: String,
    example: '2026-10-29T00:02:31.000Z',
  })
  rateAsOf: string | null;

  @ApiProperty({ example: '2026-10-29T14:00:30.000Z' })
  expiresAt: string;
}
