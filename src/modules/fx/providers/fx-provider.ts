import type { ProviderRates } from '../fx.types.js';

export const FX_PROVIDERS = Symbol('FX_PROVIDERS');

export interface FxProvider {
  readonly name: ProviderRates['source'];
  fetchLatest(now: Date): Promise<ProviderRates>;
}
