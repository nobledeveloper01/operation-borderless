import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  type ValidationArguments,
} from 'class-validator';
import { normaliseEmail, normalisePhone } from '../accounts/identifiers.js';

const trimmedLower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? normaliseEmail(value) : value;
const toE164 = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? (normalisePhone(value) ?? value) : value;

@ValidatorConstraint({ name: 'hasIdentifier' })
class HasIdentifier implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as { email?: unknown; phoneNumber?: unknown };
    return dto.email !== undefined || dto.phoneNumber !== undefined;
  }

  defaultMessage(): string {
    return 'Give an email or a phoneNumber.';
  }
}

// Both wallet creation and login identify a holder the same way, so they share this base.
export class IdentifierDto {
  @ApiPropertyOptional({ example: 'ada@example.com', maxLength: 254 })
  @IsOptional()
  @Transform(trimmedLower)
  @IsEmail({}, { message: 'email must be a valid email address.' })
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({
    example: '+2348012345678',
    description: 'International format, or Nigerian local format.',
  })
  @IsOptional()
  @Transform(toE164)
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phoneNumber must be a valid phone number.',
  })
  phoneNumber?: string;
}

export class CreateWalletDto extends IdentifierDto {
  @ApiProperty({
    example: 'correct horse battery staple',
    minLength: 12,
    maxLength: 128,
  })
  @IsString()
  @Length(12, 128, { message: 'password must be 12 to 128 characters long.' })
  @Validate(HasIdentifier)
  password: string;
}

export class LoginDto extends IdentifierDto {
  @ApiProperty({ example: 'correct horse battery staple' })
  @IsString()
  @Length(1, 128)
  @Validate(HasIdentifier)
  password: string;
}

export class RefreshDto {
  @ApiProperty({ example: 'q9X2...' })
  @IsString()
  @Length(20, 100)
  refreshToken: string;
}

export class SessionTokensDto {
  @ApiProperty({ example: 'Bearer' })
  tokenType: 'Bearer';

  @ApiProperty({ example: 'eyJhbGciOiJFUzI1NiIs...' })
  accessToken: string;

  @ApiProperty({ example: '2026-10-29T10:15:00.000Z' })
  accessTokenExpiresAt: string;

  @ApiProperty({
    example: 'q9X2...',
    description: 'Shown once; each use returns a new one.',
  })
  refreshToken: string;

  @ApiProperty({ example: '2026-11-28T10:00:00.000Z' })
  refreshTokenExpiresAt: string;
}

export class LoginResultDto {
  @ApiProperty({ example: '0192f5c2-7b1e-7c40-9d1a-2f6b8f0c9e11' })
  walletId: string;

  @ApiProperty({ type: SessionTokensDto })
  session: SessionTokensDto;
}

export class MeDto {
  @ApiProperty()
  accountId: string;

  @ApiProperty()
  walletId: string;

  @ApiProperty({ enum: ['session', 'walletKey'] })
  via: 'session' | 'walletKey';

  @ApiPropertyOptional({ nullable: true, type: String })
  email: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  phoneNumber: string | null;
}
