// Money maths stays in bigint, where a value with 6 decimals is simply stored as value × 10^6.

const DECIMAL = /^(\d+)(?:\.(\d+))?$/;

export function pow10(n: number): bigint {
  return 10n ** BigInt(n);
}

// Reads a plain decimal string, refusing extra decimals unless the caller asks for rounding.
export function parseDecimal(
  text: string,
  scale: number,
  round = false,
): bigint {
  const match = DECIMAL.exec(text);
  if (!match) throw new RangeError(`Not a decimal number: ${text}`);
  const whole = match[1] ?? '0';
  const fraction = match[2] ?? '';
  if (fraction.length <= scale) {
    return BigInt(whole + fraction.padEnd(scale, '0'));
  }
  if (!round)
    throw new RangeError(`More than ${scale} decimal places: ${text}`);
  const exact = BigInt(whole + fraction);
  return divideHalfEven(exact, pow10(fraction.length - scale));
}

export function formatDecimal(value: bigint, scale: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value)
    .toString()
    .padStart(scale + 1, '0');
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale);
  return `${negative ? '-' : ''}${whole}${scale > 0 ? `.${fraction}` : ''}`;
}

// Rounds a / b to the nearest whole number, sending exact halves to the even side.
export function divideHalfEven(a: bigint, b: bigint): bigint {
  if (a < 0n || b <= 0n)
    throw new RangeError('divideHalfEven needs a >= 0 and b > 0');
  const q = a / b;
  const twice = (a % b) * 2n;
  if (twice > b || (twice === b && q % 2n === 1n)) return q + 1n;
  return q;
}

// Providers send rates as JSON numbers, so this pins each one to an exact decimal string.
export function numberToDecimal(value: number, scale: number): string {
  if (!Number.isFinite(value) || value <= 0)
    throw new RangeError(`Not a positive number: ${value}`);
  const text = value.toFixed(Math.min(scale, 20));
  return formatDecimal(parseDecimal(text, scale, true), scale);
}
