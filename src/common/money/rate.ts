import {
  divideHalfEven,
  formatDecimal,
  parseDecimal,
  pow10,
} from './decimal.js';

// Applied rates keep 10 decimal places, while raw provider rates keep 12.
export const RATE_SCALE = 10;
export const PROVIDER_RATE_SCALE = 12;

// Both rates are quoted per 1 USD, so the rate from A to B is B divided by A.
export function crossRate(fromPerUsd: string, toPerUsd: string): bigint {
  const from = parseDecimal(fromPerUsd, PROVIDER_RATE_SCALE, true);
  const to = parseDecimal(toPerUsd, PROVIDER_RATE_SCALE, true);
  if (from <= 0n || to <= 0n) throw new RangeError('Rates must be positive');
  return divideHalfEven(to * pow10(RATE_SCALE), from);
}

// Rounds down, so a conversion can never hand out more value than it took in.
export function convert(amountMinor: bigint, rate: bigint): bigint {
  if (amountMinor < 0n || rate <= 0n)
    throw new RangeError('convert needs amount >= 0 and rate > 0');
  return (amountMinor * rate) / pow10(RATE_SCALE);
}

export function formatRate(rate: bigint): string {
  return formatDecimal(rate, RATE_SCALE);
}

export function parseRate(text: string): bigint {
  return parseDecimal(text, RATE_SCALE);
}
