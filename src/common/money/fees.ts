import { STABLECOINS, type Stablecoin } from '../currencies/currency.js';
import { pow10 } from './decimal.js';
import { convert, RATE_SCALE } from './rate.js';

export const MAX_FEE_BPS = 1_000;
const BPS = 10_000n;

export interface PricedConversion {
  fee: bigint;
  rounding: bigint;
  received: bigint;
}

// Rounded up to the next millionth, so the fee is never less than the rate says.
export function feeFor(amount: bigint, bps: number): bigint {
  return (amount * BigInt(bps) + BPS - 1n) / BPS;
}

// Takes the fee, converts what is left rounding down, and books the source millionths that bought nothing as rounding.
export function priceConversion(
  amount: bigint,
  rate: bigint,
  bps: number,
): PricedConversion {
  const fee = feeFor(amount, bps);
  const net = amount - fee;
  const received = convert(net, rate);
  const used = (received * pow10(RATE_SCALE) + rate - 1n) / rate;
  return { fee, rounding: net - used, received };
}

export type FeeOverrides = Map<string, number>;

export const pairKey = (from: Stablecoin, to: Stablecoin) => `${from}:${to}`;

// Reads "cNGN:cGHS=25,USDx:EURx=0"; each pair is one direction, in basis points.
export function parseFeeOverrides(text: string | undefined): FeeOverrides {
  const overrides: FeeOverrides = new Map();
  for (const part of (text ?? '').split(',').map((p) => p.trim())) {
    if (!part) continue;
    const match = /^([A-Za-z]+):([A-Za-z]+)=(\d{1,4})$/.exec(part);
    const [from, to, bps] = match ? [match[1], match[2], Number(match[3])] : [];
    if (
      !match ||
      !STABLECOINS.includes(from as Stablecoin) ||
      !STABLECOINS.includes(to as Stablecoin) ||
      from === to ||
      bps! > MAX_FEE_BPS
    ) {
      throw new Error(
        `FEE_BPS_BY_PAIR entry "${part}" must look like cNGN:cGHS=25, with two different stablecoins and at most ${MAX_FEE_BPS} basis points`,
      );
    }
    overrides.set(pairKey(from as Stablecoin, to as Stablecoin), bps!);
  }
  return overrides;
}
