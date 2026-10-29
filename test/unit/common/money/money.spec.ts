import {
  formatAmount,
  MAX_OPERATION_AMOUNT,
  parseAmount,
} from '../../../../src/common/money/amount.js';
import {
  divideHalfEven,
  numberToDecimal,
  parseDecimal,
} from '../../../../src/common/money/decimal.js';
import {
  convert,
  crossRate,
  formatRate,
} from '../../../../src/common/money/rate.js';

describe('amounts', () => {
  it('parses and formats exactly', () => {
    expect(parseAmount('100.5')).toBe(100_500_000n);
    expect(parseAmount('0.000001')).toBe(1n);
    expect(formatAmount(1n)).toBe('0.000001');
    expect(formatAmount(1_500_250_000n)).toBe('1500.250000');
    expect(formatAmount(-3_000_000n)).toBe('-3.000000');
    expect(formatAmount(parseAmount('999999999999999.999999'))).toBe(
      '999999999999999.999999',
    );
  });

  it('TC-010 refuses bad amounts instead of rounding them', () => {
    for (const bad of [
      '',
      '1.',
      '.5',
      '-1',
      '1e3',
      '1,000',
      ' 1',
      '0.0000001',
      '1234567890123456',
    ]) {
      expect(() => parseAmount(bad), bad).toThrow(RangeError);
    }
  });

  it('keeps the per-operation cap inside bigint range', () => {
    expect(MAX_OPERATION_AMOUNT).toBe(1_000_000_000_000_000n);
    expect(MAX_OPERATION_AMOUNT * 9000n < 2n ** 63n).toBe(true);
  });

  it('avoids float drift that plain numbers would have', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(formatAmount(parseAmount('0.1') + parseAmount('0.2'))).toBe(
      '0.300000',
    );
  });
});

describe('rates', () => {
  it('rounds half to even', () => {
    expect(divideHalfEven(5n, 2n)).toBe(2n);
    expect(divideHalfEven(7n, 2n)).toBe(4n);
    expect(divideHalfEven(10n, 3n)).toBe(3n);
    expect(divideHalfEven(11n, 3n)).toBe(4n);
  });

  it('computes cross rates from USD-based rates, rounded down', () => {
    // 1346.236888 NGN and 11.639916 GHS per USD: 0.00864626137... rounds down, not to ...614.
    expect(formatRate(crossRate('1346.236888', '11.639916'))).toBe(
      '0.0086462613',
    );
    expect(formatRate(crossRate('1', '1346.236888'))).toBe('1346.2368880000');
    expect(formatRate(crossRate('1346.236888', '1'))).toBe('0.0007428113');
    expect(formatRate(crossRate('2', '2'))).toBe('1.0000000000');
  });

  it('TC-012 converts and rounds down', () => {
    const rate = crossRate('1346.236888', '1');
    // 10,000 cNGN at 0.0007428113 is exactly 7.428113 USDx.
    expect(formatAmount(convert(parseAmount('10000'), rate))).toBe('7.428113');
    // 1 cNGN is worth 0.0007428113 USDx, which rounds down to 0.000742.
    expect(formatAmount(convert(parseAmount('1'), rate))).toBe('0.000742');
    // One millionth of a cNGN is worth less than one millionth of a USDx.
    expect(convert(1n, rate)).toBe(0n);
  });

  it('never gives back more than it took in a round trip', () => {
    const there = crossRate('1', '1346.236888');
    const back = crossRate('1346.236888', '1');
    const start = parseAmount('123.456789');
    expect(convert(convert(start, there), back) <= start).toBe(true);
  });

  it('turns provider numbers into exact decimal strings', () => {
    expect(numberToDecimal(1346.236888, 12)).toBe('1346.236888000000');
    expect(numberToDecimal(0.897215, 12)).toBe('0.897215000000');
    expect(() => numberToDecimal(0, 12)).toThrow(RangeError);
    expect(() => numberToDecimal(Number.NaN, 12)).toThrow(RangeError);
    expect(parseDecimal('1.23456789012345', 12, true)).toBe(1_234567890123n);
  });
});
