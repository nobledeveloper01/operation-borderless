import fc from 'fast-check';
import {
  formatAmount,
  MAX_OPERATION_AMOUNT,
  parseAmount,
} from '../../../src/common/money/amount.js';
import { pow10 } from '../../../src/common/money/decimal.js';
import { feeFor, priceConversion } from '../../../src/common/money/fees.js';
import {
  convert,
  crossRate,
  RATE_SCALE,
} from '../../../src/common/money/rate.js';

// Any amount the API accepts: 1 millionth up to the per-operation cap.
const amount = fc.bigInt({ min: 1n, max: MAX_OPERATION_AMOUNT });
// Rates from 0.0000000001 to 100,000,000 units per unit, scaled by 10^10.
const rate = fc.bigInt({ min: 1n, max: 10n ** 18n });
const bps = fc.integer({ min: 0, max: 1000 });
// Provider quotes per USD across the range the API accepts, 0.001 to 10,000,000, as decimal strings.
const perUsd = fc
  .bigInt({ min: 10n ** 9n, max: 10n ** 19n })
  .map(
    (n) => `${n / 10n ** 12n}.${(n % 10n ** 12n).toString().padStart(12, '0')}`,
  );

describe('money properties', () => {
  it('formats and parses every amount back to itself', () => {
    fc.assert(fc.property(amount, (a) => parseAmount(formatAmount(a)) === a));
  });

  it('never charges less than the fee rate or a millionth more than it', () => {
    fc.assert(
      fc.property(amount, bps, (a, b) => {
        const fee = feeFor(a, b);
        return (
          fee * 10_000n >= a * BigInt(b) && (fee - 1n) * 10_000n < a * BigInt(b)
        );
      }),
    );
  });

  it('never pays out more than the money after the fee is worth, and accounts for every whole millionth', () => {
    fc.assert(
      fc.property(amount, rate, bps, (a, r, b) => {
        const p = priceConversion(a, r, b);
        const net = a - p.fee;
        const used = net - p.rounding;
        return (
          p.fee >= 0n &&
          p.rounding >= 0n &&
          used >= 0n &&
          p.received === convert(net, r) &&
          // What was converted is worth at least what was paid out...
          used * r >= p.received * pow10(RATE_SCALE) &&
          // ...and one millionth less would not have been enough.
          (used === 0n || (used - 1n) * r < p.received * pow10(RATE_SCALE))
        );
      }),
      { numRuns: 2_000 },
    );
  });

  it('gives every pair inside the accepted range a non-zero rate', () => {
    fc.assert(fc.property(perUsd, perUsd, (x, y) => crossRate(x, y) > 0n));
  });

  it('never gains value going there and back', () => {
    fc.assert(
      fc.property(amount, perUsd, perUsd, (a, x, y) => {
        const back = convert(convert(a, crossRate(x, y)), crossRate(y, x));
        // Rates and conversions both round down, so a round trip can only shrink.
        return back <= a;
      }),
      { numRuns: 2_000 },
    );
  });

  it('keeps conversion monotonic: sending more never gets less', () => {
    fc.assert(
      fc.property(amount, amount, rate, (a, b, r) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        return convert(lo, r) <= convert(hi, r);
      }),
    );
  });
});
