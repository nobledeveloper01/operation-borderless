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
}

export class WalletDto {
  @ApiProperty({ example: '0192f5c2-7b1e-7c40-9d1a-2f6b8f0c9e11' })
  walletId: string;

  @ApiProperty({ nullable: true, type: String, example: 'ada@example.com' })
  email: string | null;

  @ApiProperty({ nullable: true, type: String, example: null })
  phoneNumber: string | null;

  @ApiProperty({ type: [BalanceDto] })
  balances: BalanceDto[];

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

export class WalletBalancesDto {
  @ApiProperty()
  walletId: string;

  @ApiProperty({ type: [BalanceDto] })
  balances: BalanceDto[];
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
