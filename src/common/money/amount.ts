import { formatDecimal, parseDecimal, pow10 } from './decimal.js';

// Every stablecoin uses 6 decimal places, so a balance is a whole number of millionths.
export const AMOUNT_SCALE = 6;
export const ONE_UNIT = pow10(AMOUNT_SCALE);
export const MAX_OPERATION_AMOUNT = 1_000_000_000n * ONE_UNIT;
export const AMOUNT_PATTERN = /^\d{1,15}(\.\d{1,6})?$/;

export function parseAmount(text: string): bigint {
  if (!AMOUNT_PATTERN.test(text))
    throw new RangeError(`Not a valid amount: ${text}`);
  return parseDecimal(text, AMOUNT_SCALE);
}

export function formatAmount(minor: bigint): string {
  return formatDecimal(minor, AMOUNT_SCALE);
}
