import { ApiProperty } from '@nestjs/swagger';
import {
  STABLECOINS,
  type Stablecoin,
} from '../../common/currencies/currency.js';

export type TransactionType = 'DEPOSIT' | 'SWAP' | 'TRANSFER';

export class TransactionDto {
  @ApiProperty({ example: '0192f5c9-0d3e-7a11-8c2b-6f4e2d1a9b77' })
  transactionId: string;

  @ApiProperty({ enum: ['DEPOSIT', 'SWAP', 'TRANSFER'] })
  type: TransactionType;

  @ApiProperty({ enum: ['COMPLETED'] })
  status: 'COMPLETED';

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Null for deposits.',
  })
  fromWalletId: string | null;

  @ApiProperty()
  toWalletId: string;

  @ApiProperty({ nullable: true, enum: STABLECOINS })
  fromCurrency: Stablecoin | null;

  @ApiProperty({ nullable: true, type: String, example: '10000.000000' })
  fromAmount: string | null;

  @ApiProperty({ enum: STABLECOINS })
  toCurrency: Stablecoin;

  @ApiProperty({ example: '7.428113' })
  toAmount: string;

  @ApiProperty({
    example: '0.0007428113',
    description: 'Units of toCurrency per 1 fromCurrency, 10 decimal places.',
  })
  rate: string;

  @ApiProperty({
    enum: ['none', 'exchangerate-api', 'currency-api', 'fixed-table'],
  })
  rateSource: string;

  @ApiProperty({
    nullable: true,
    type: String,
    example: '2026-10-29T00:02:31.000Z',
  })
  rateAsOf: string | null;

  @ApiProperty({ example: '2026-10-29T10:05:00.000Z' })
  createdAt: string;
}

export interface TransactionRow {
  id: string;
  type: TransactionType;
  status: 'COMPLETED';
  from_wallet_id: string | null;
  to_wallet_id: string;
  from_currency: Stablecoin | null;
  from_amount: string | null;
  to_currency: Stablecoin;
  to_amount: string;
  rate: string;
  rate_source: string;
  rate_as_of: Date | null;
  created_at: Date;
}
