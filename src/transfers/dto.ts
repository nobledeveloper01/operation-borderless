import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { AmountField } from '../common/validation/amount.js';
import { STABLECOINS, type Stablecoin } from '../currencies/currency.js';

const coin = { message: `currency must be one of ${STABLECOINS.join(', ')}.` };

export class CreateTransferDto {
  @ApiProperty({ description: 'Your wallet, which sends the money.' })
  @IsUUID('all', { message: 'fromWalletId must be a UUID.' })
  fromWalletId: string;

  @ApiProperty({ description: 'The wallet that receives the money.' })
  @IsUUID('all', { message: 'toWalletId must be a UUID.' })
  toWalletId: string;

  @ApiProperty({ enum: STABLECOINS, example: 'USDx' })
  @IsIn(STABLECOINS, coin)
  fromCurrency: Stablecoin;

  @ApiPropertyOptional({
    enum: STABLECOINS,
    example: 'cGHS',
    description: 'What the receiver gets; defaults to fromCurrency.',
  })
  @IsOptional()
  @IsIn(STABLECOINS, coin)
  toCurrency?: Stablecoin;

  @AmountField(
    'Amount of fromCurrency to send, decimal string with up to 6 places.',
  )
  amount: string;
}
