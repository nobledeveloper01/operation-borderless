import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';
import { SessionTokensDto } from '../auth/dto.js';
import { STABLECOINS, type Stablecoin } from '../currencies/currency.js';

export class BalanceDto {
  @ApiProperty({ enum: STABLECOINS, example: 'cNGN' })
  currency: Stablecoin;

  @ApiProperty({
    example: '50000.000000',
    description: 'Decimal string with 6 places.',
  })
  amount: string;

  @ApiProperty({
    nullable: true,
    type: String,
    example: '37.140545',
    description: 'Value in USDx, rounded down; null when no fresh rate exists.',
  })
  usdValue: string | null;
}

export class ValuationRatesDto {
  @ApiProperty({ nullable: true, type: String, example: 'exchangerate-api' })
  source: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    example: '2026-10-29T00:02:31.000Z',
  })
  asOf: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    example: null,
    description: 'Why USD values are missing, when they are.',
  })
  unavailableReason: string | null;
}

// Balances always travel with their USD values and the rate they used, so both answers share this.
export class WalletValuationDto {
  @ApiProperty({ type: [BalanceDto] })
  balances: BalanceDto[];

  @ApiProperty({ nullable: true, type: String, example: '47.140545' })
  totalUsd: string | null;

  @ApiProperty({ type: ValuationRatesDto })
  rates: ValuationRatesDto;
}

export class WalletDto extends WalletValuationDto {
  @ApiProperty({ example: '0192f5c2-7b1e-7c40-9d1a-2f6b8f0c9e11' })
  walletId: string;

  @ApiProperty({ nullable: true, type: String, example: 'ada@example.com' })
  email: string | null;

  @ApiProperty({ nullable: true, type: String, example: null })
  phoneNumber: string | null;

  @ApiProperty({ example: '2026-10-29T10:00:00.000Z' })
  createdAt: string;
}

export class CreatedWalletDto extends WalletDto {
  @ApiProperty({
    type: SessionTokensDto,
    description: 'A first session, so the new holder is signed in at once.',
  })
  session: SessionTokensDto;
}

export class WalletBalancesDto extends WalletValuationDto {
  @ApiProperty()
  walletId: string;
}

export class CreateWalletKeyDto {
  @ApiProperty({ example: 'payroll-script', minLength: 1, maxLength: 60 })
  @IsString()
  @Length(1, 60, { message: 'name must be 1 to 60 characters long.' })
  @Matches(/^[\w .-]+$/, {
    message:
      'name may only use letters, digits, spaces, dots, dashes and underscores.',
  })
  name: string;
}

export class WalletKeyDto {
  @ApiProperty({ example: 'k_3f9a1c0b7d2e' })
  keyId: string;

  @ApiProperty({ example: 'payroll-script' })
  name: string;

  @ApiProperty({ example: '2026-10-29T10:20:00.000Z' })
  createdAt: string;

  @ApiProperty({ nullable: true, type: String })
  lastUsedAt: string | null;
}

export class CreatedWalletKeyDto extends WalletKeyDto {
  @ApiProperty({
    example: 'bwk_k_3f9a1c0b7d2e_Vb7...',
    description: 'Shown only in this answer. Send it as X-Wallet-Key.',
  })
  key: string;
}
