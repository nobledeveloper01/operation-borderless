import { numberToDecimal } from '../common/money/decimal.js';
import { PROVIDER_RATE_SCALE } from '../common/money/rate.js';
import { FIAT_CODES, type Fiat, type ProviderRates } from './fx.types.js';

export const MAX_JUMP = 0.2;
const FUTURE_TOLERANCE_MS = 5 * 60_000;

export class InvalidRates extends Error {
  override name = 'InvalidRates';
}

// Both providers' answers pass through here, so a bad number never reaches a price.
export function checkedRates(
  raw: Record<string, unknown>,
  upperCase: boolean,
): Record<Fiat, string> {
  const rates = {} as Record<Fiat, string>;
  for (const code of FIAT_CODES) {
    const value = raw[upperCase ? code : code.toLowerCase()];
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value <= 0 ||
      value >= 1e15
    ) {
      throw new InvalidRates(`Missing or impossible rate for ${code}`);
    }
    const text = numberToDecimal(value, PROVIDER_RATE_SCALE);
    if (/^0\.0+$/.test(text))
      throw new InvalidRates(`Rate for ${code} is too small to use`);
    rates[code] = text;
  }
  if (rates.USD !== numberToDecimal(1, PROVIDER_RATE_SCALE))
    throw new InvalidRates('USD must be the base at 1');
  return rates;
}

export function checkedTime(value: unknown, now = new Date()): Date {
  const time =
    value instanceof Date
      ? value
      : new Date(typeof value === 'number' ? value * 1000 : String(value));
  if (Number.isNaN(time.getTime()))
    throw new InvalidRates('The update time is not a date');
  if (time.getTime() > now.getTime() + FUTURE_TOLERANCE_MS)
    throw new InvalidRates('The update time is in the future');
  return time;
}

// A move of more than 20% in a day is far more likely a broken feed than a real market.
export function checkJump(
  next: ProviderRates,
  previous: ProviderRates | undefined,
): void {
  if (!previous) return;
  for (const code of FIAT_CODES) {
    const change =
      Number(next.ratesPerUsd[code]) / Number(previous.ratesPerUsd[code]) - 1;
    if (Math.abs(change) > MAX_JUMP) {
      throw new InvalidRates(
        `${code} moved ${(change * 100).toFixed(1)}% since the last snapshot`,
      );
    }
  }
}
