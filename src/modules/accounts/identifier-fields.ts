import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, Matches, MaxLength } from 'class-validator';
import { normaliseEmail, normalisePhone } from './identifiers.js';

const trimmedLower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? normaliseEmail(value) : value;
const toE164 = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? (normalisePhone(value) ?? value) : value;

// Sign-up, login and transfers all read an email the same way, so it always matches the same account.
export const EmailField = (name: string, description?: string) =>
  applyDecorators(
    ApiPropertyOptional({
      example: 'ada@example.com',
      maxLength: 254,
      description,
    }),
    IsOptional(),
    Transform(trimmedLower),
    IsEmail({}, { message: `${name} must be a valid email address.` }),
    MaxLength(254),
  );

// Stored and compared in E.164, so +2348012345678 and 08012345678 are the same number.
export const PhoneField = (
  name: string,
  description = 'International format, or Nigerian local format.',
) =>
  applyDecorators(
    ApiPropertyOptional({ example: '+2348012345678', description }),
    IsOptional(),
    Transform(toE164),
    Matches(/^\+[1-9]\d{7,14}$/, {
      message: `${name} must be a valid phone number.`,
    }),
  );
