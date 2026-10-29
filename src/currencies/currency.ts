export const STABLECOINS = ['cNGN', 'cGHS', 'cXAF', 'USDx', 'EURx'] as const;

export type Stablecoin = (typeof STABLECOINS)[number];

// Each coin is pegged 1:1 to a fiat currency, and FX rates are looked up by that fiat code.
export const FIAT_OF = {
  cNGN: 'NGN',
  cGHS: 'GHS',
  cXAF: 'XAF',
  USDx: 'USD',
  EURx: 'EUR',
} as const satisfies Record<Stablecoin, string>;

export function isStablecoin(value: unknown): value is Stablecoin {
  return (
    typeof value === 'string' &&
    (STABLECOINS as readonly string[]).includes(value)
  );
}
