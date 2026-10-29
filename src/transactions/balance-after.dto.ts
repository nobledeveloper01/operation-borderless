import { ApiProperty } from '@nestjs/swagger';
import { STABLECOINS, type Stablecoin } from '../currencies/currency.js';

export class BalanceAfterDto {
  @ApiProperty({ enum: STABLECOINS })
  currency: Stablecoin;

  @ApiProperty({ example: '48500.000000' })
  amount: string;
}
