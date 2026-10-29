import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { AmountField } from '../../common/validation/amount.js';
import { UuidField } from '../../common/validation/id-param.js';
import {
  STABLECOINS,
  type Stablecoin,
} from '../../common/currencies/currency.js';

const coin = { message: `currency must be one of ${STABLECOINS.join(', ')}.` };

export class CreateSwapDto {
  @ApiProperty({ enum: STABLECOINS, example: 'cNGN' })
  @IsIn(STABLECOINS, coin)
  fromCurrency: Stablecoin;

  @ApiProperty({ enum: STABLECOINS, example: 'USDx' })
  @IsIn(STABLECOINS, coin)
  toCurrency: Stablecoin;

  @AmountField(
    'Amount of fromCurrency to swap, decimal string with up to 6 places.',
  )
  amount: string;

  @UuidField(
    'quoteId',
    'A quote from POST /quotes; the movement then gets exactly that price.',
    { required: false },
  )
  @IsOptional()
  quoteId?: string;
}
