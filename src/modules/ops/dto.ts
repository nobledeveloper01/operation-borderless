import { ApiProperty } from '@nestjs/swagger';
import {
  STABLECOINS,
  type Stablecoin,
} from '../../common/currencies/currency.js';

export class LedgerMismatchDto {
  @ApiProperty()
  walletId: string;

  @ApiProperty({ enum: STABLECOINS })
  currency: Stablecoin;

  @ApiProperty({ example: '10.000000' })
  balance: string;

  @ApiProperty({
    example: '9.000000',
    description: "The sum of this balance's ledger lines.",
  })
  ledger: string;
}

export class LedgerCheckDto {
  @ApiProperty({
    description: 'True when every balance equals its ledger lines.',
  })
  ok: boolean;

  @ApiProperty({ example: '2026-10-29T12:00:00.000Z' })
  checkedAt: string;

  @ApiProperty({ example: 540 })
  balancesChecked: number;

  @ApiProperty({ example: 0 })
  mismatchCount: number;

  @ApiProperty({
    example: 0,
    description:
      'Transactions with no ledger lines, which should never happen.',
  })
  transactionsWithoutLines: number;

  @ApiProperty({
    type: [LedgerMismatchDto],
    description: 'The first 100 balances that differ from their ledger lines.',
  })
  mismatches: LedgerMismatchDto[];
}
