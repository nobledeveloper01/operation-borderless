import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  Matches,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import {
  AMOUNT_PATTERN,
  MAX_OPERATION_AMOUNT,
  parseAmount,
} from '../money/amount.js';

@ValidatorConstraint({ name: 'positiveCappedAmount' })
class PositiveCappedAmount implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || !AMOUNT_PATTERN.test(value)) return false;
    const minor = parseAmount(value);
    return minor > 0n && minor <= MAX_OPERATION_AMOUNT;
  }

  defaultMessage(): string {
    return 'amount must be more than 0 and at most 1000000000.';
  }
}

// Every money field takes a decimal string, never a JSON number, so no float ever reaches the maths.
export const AmountField = (
  description = 'Decimal string, up to 6 decimal places.',
) =>
  applyDecorators(
    ApiProperty({
      type: String,
      example: '1500.25',
      pattern: AMOUNT_PATTERN.source,
      description,
    }),
    IsString({
      message:
        'amount must be a decimal string such as "1500.25", not a number.',
    }),
    Matches(AMOUNT_PATTERN, {
      message: 'amount must be a plain decimal with at most 6 decimal places.',
    }),
    Validate(PositiveCappedAmount),
  );
