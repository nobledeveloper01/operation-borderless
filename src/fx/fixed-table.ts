import type { Fiat } from './fx.types.js';

// Offline demo rates, set from ExchangeRate-API on 29 Oct 2026; cXAF uses the official 655.957 XAF per EUR peg.
export const FIXED_TABLE_DATE = '2026-10-29';

export const FIXED_RATES_PER_USD: Record<Fiat, string> = {
  USD: '1.000000000000',
  NGN: '1346.236888000000',
  GHS: '11.639916000000',
  XAF: '588.534460000000',
  EUR: '0.897215000000',
};
