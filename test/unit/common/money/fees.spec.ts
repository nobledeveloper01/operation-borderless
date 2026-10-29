import {
  feeFor,
  parseFeeOverrides,
  priceConversion,
} from '../../../../src/common/money/fees.js';
import { convert, parseRate } from '../../../../src/common/money/rate.js';

describe('fees', () => {
  it('rounds the fee up to the next millionth', () => {
    expect(feeFor(0n, 50)).toBe(0n);
    expect(feeFor(1n, 50)).toBe(1n);
    expect(feeFor(1_000_000n, 50)).toBe(5_000n);
    expect(feeFor(1_000_001n, 50)).toBe(5_001n);
    expect(feeFor(1_000_000n, 0)).toBe(0n);
  });

  it('prices 1 cNGN to USDx and books the leftover millionths as rounding', () => {
    expect(priceConversion(1_000_000n, parseRate('0.0007428113'), 50)).toEqual({
      fee: 5_000n,
      rounding: 130n,
      received: 739n,
    });
  });

  it('prices 10 USDx to cNGN with nothing left to round', () => {
    expect(
      priceConversion(10_000_000n, parseRate('1346.2368880000'), 50),
    ).toEqual({ fee: 50_000n, rounding: 0n, received: 13_395_057_035n });
  });

  it('never hands out more than the net amount is worth and accounts for every source millionth', () => {
    const rates = ['0.0007428113', '1346.2368880000', '1', '0.9', '655.957'];
    for (const text of rates) {
      const rate = parseRate(text);
      for (const amount of [1n, 7n, 999n, 1_000_000n, 123_456_789n]) {
        const p = priceConversion(amount, rate, 50);
        const net = amount - p.fee;
        expect(p.received).toBe(convert(net, rate));
        expect(p.rounding >= 0n && p.rounding <= net).toBe(true);
        // Converting what was used must still give at least what was paid out.
        expect(convert(net - p.rounding, rate) >= p.received).toBe(true);
      }
    }
  });

  it('reads per-pair overrides and refuses bad ones', () => {
    expect([...parseFeeOverrides('cNGN:cGHS=25, USDx:EURx=0')]).toEqual([
      ['cNGN:cGHS', 25],
      ['USDx:EURx', 0],
    ]);
    expect(parseFeeOverrides(undefined).size).toBe(0);
    for (const bad of [
      'cNGN:cNGN=5',
      'NGN:cGHS=5',
      'cNGN:cGHS=1001',
      'cNGN-cGHS=5',
      'cNGN:cGHS=25,cNGN:cGHS=0',
    ]) {
      expect(() => parseFeeOverrides(bad)).toThrow(/FEE_BPS_BY_PAIR/);
    }
  });
});
