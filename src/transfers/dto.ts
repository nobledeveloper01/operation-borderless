import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { AmountField } from '../common/validation/amount.js';
import { UuidField } from '../common/validation/id-param.js';
import { STABLECOINS, type Stablecoin } from '../currencies/currency.js';

const coin = { message: `currency must be one of ${STABLECOINS.join(', ')}.` };

export class CreateTransferDto {
  @UuidField('fromWalletId', 'Your wallet, which sends the money.')
  fromWalletId: string;

  @UuidField('toWalletId', 'The wallet that receives the money.')
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
