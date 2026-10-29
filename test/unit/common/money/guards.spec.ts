import { parseAmount } from '../../../../src/common/money/amount.js';
import {
  divideHalfEven,
  formatDecimal,
  numberToDecimal,
  parseDecimal,
} from '../../../../src/common/money/decimal.js';
import {
  MAX_FEE_BPS,
  parseFeeOverrides,
} from '../../../../src/common/money/fees.js';
import {
  convert,
  crossRate,
  formatRate,
} from '../../../../src/common/money/rate.js';

describe('money input guards', () => {
  it('refuses text that is not a plain decimal, and extra places unless asked to round', () => {
    for (const bad of ['abc', '1.', '.5', '-1', '1e3', ' 1'])
      expect(() => parseDecimal(bad, 6)).toThrow(
        `Not a decimal number: ${bad}`,
      );
    expect(() => parseDecimal('1.1234567', 6)).toThrow(
      'More than 6 decimal places: 1.1234567',
    );
    expect(parseDecimal('1.2345675', 6, true)).toBe(1_234_568n);
    expect(parseDecimal('1.2345665', 6, true)).toBe(1_234_566n);
    expect(parseDecimal('7', 2)).toBe(700n);
    expect(() => parseAmount('ten')).toThrow('Not a valid amount: ten');
  });

  it('formats negatives, zero and whole numbers', () => {
    expect(formatDecimal(-1_500_000n, 6)).toBe('-1.500000');
    expect(formatDecimal(0n, 6)).toBe('0.000000');
    expect(formatDecimal(5n, 0)).toBe('5');
    expect(formatDecimal(-5n, 0)).toBe('-5');
  });

  it('only divides non-negative numbers by positive ones', () => {
    expect(() => divideHalfEven(-1n, 2n)).toThrow(
      'divideHalfEven needs a >= 0 and b > 0',
    );
    expect(() => divideHalfEven(1n, 0n)).toThrow(RangeError);
    expect(() => divideHalfEven(1n, -1n)).toThrow(RangeError);
    expect(divideHalfEven(0n, 3n)).toBe(0n);
  });

  it('turns provider numbers into decimals and refuses non-positive ones', () => {
    expect(numberToDecimal(1346.236888, 12)).toBe('1346.236888000000');
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY])
      expect(() => numberToDecimal(bad, 12)).toThrow(
        `Not a positive number: ${bad}`,
      );
  });

  it('refuses zero rates and negative amounts, and rounds over-long provider rates', () => {
    expect(() => crossRate('0', '1')).toThrow('Rates must be positive');
    expect(() => crossRate('1', '0')).toThrow('Rates must be positive');
    expect(() => crossRate('0.0000000000001', '1')).toThrow(
      'Rates must be positive',
    );
    // Providers can send more than 12 places; they round instead of failing.
    expect(formatRate(crossRate('2.0000000000004', '1'))).toBe('0.5000000000');
    expect(formatRate(crossRate('1', '2.0000000000004'))).toBe('2.0000000000');
    expect(() => convert(-1n, 1n)).toThrow(
      'convert needs amount >= 0 and rate > 0',
    );
    expect(() => convert(1n, 0n)).toThrow(RangeError);
    expect(convert(0n, 5n)).toBe(0n);
  });

  it('reads fee pairs only when the whole entry matches, up to the maximum', () => {
    for (const bad of ['xcNGN:cGHS=5', 'cNGN:cGHS=5x', 'cNGN:cGHS=12345'])
      expect(() => parseFeeOverrides(bad)).toThrow(/FEE_BPS_BY_PAIR/);
    expect(parseFeeOverrides(`cNGN:cGHS=${MAX_FEE_BPS}`).get('cNGN:cGHS')).toBe(
      MAX_FEE_BPS,
    );
  });
});
