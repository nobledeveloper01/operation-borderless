// The five fiat currencies the stablecoins track, all quoted per 1 USD.
export const FIAT_CODES = ['USD', 'NGN', 'GHS', 'XAF', 'EUR'] as const;

export type Fiat = (typeof FIAT_CODES)[number];

export type FxSource = 'exchangerate-api' | 'currency-api' | 'fixed-table';

export interface ProviderRates {
  source: FxSource;
  // Exact decimal strings with 12 places, one per fiat code.
  ratesPerUsd: Record<Fiat, string>;
  providerUpdatedAt: Date;
  // When the provider says its next publication is due, if it says.
  nextUpdateAt?: Date;
}

export interface FxSnapshot extends ProviderRates {
  id: string;
  fetchedAt: Date;
}
