import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  Length,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  type ValidationArguments,
} from 'class-validator';
import { EmailField, PhoneField } from '../accounts/identifier-fields.js';

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
  @EmailField('email')
  email?: string;

  @PhoneField('phoneNumber')
  phoneNumber?: string;
}

@ValidatorConstraint({ name: 'notIdentifier' })
class NotIdentifier implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as { email?: string; phoneNumber?: string };
    const password =
      typeof value === 'string' ? value.trim().toLowerCase() : '';
    const phoneDigits = dto.phoneNumber?.replace(/\D/g, '');
    return (
      password !== dto.email && password.replace(/\D/g, '') !== phoneDigits
    );
  }

  defaultMessage(): string {
    return 'password must not be your email or phone number.';
  }
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
  @Validate(NotIdentifier)
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

export class LogoutAllDto {
  @ApiProperty({ example: 2, description: 'Sessions that were still open.' })
  sessionsEnded: number;

  @ApiProperty({
    example: 1,
    description: 'Wallet keys that were still active.',
  })
  keysRevoked: number;
}
