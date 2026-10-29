import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { AmountField } from '../../common/validation/amount.js';
import {
  STABLECOINS,
  type Stablecoin,
} from '../../common/currencies/currency.js';

export class CreateDepositDto {
  @ApiProperty({ enum: STABLECOINS, example: 'cNGN' })
  @IsIn(STABLECOINS, {
    message: `currency must be one of ${STABLECOINS.join(', ')}.`,
  })
  currency: Stablecoin;

  @AmountField()
  amount: string;
}
