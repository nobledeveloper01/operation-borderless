import { fetchJson } from '../../common/http/fetch-json.js';
import { checkedRates, checkedTime, InvalidRates } from '../rate-validation.js';
import type { ProviderRates } from '../fx.types.js';
import type { FxProvider } from './fx-provider.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseCurrencyApi(
  body: unknown,
  now = new Date(),
): ProviderRates {
  const data = (body ?? {}) as { date?: unknown; usd?: unknown };
  if (typeof data.date !== 'string' || !DATE.test(data.date))
    throw new InvalidRates('The answer has no publication date');
  if (typeof data.usd !== 'object' || data.usd === null)
    throw new InvalidRates('The answer has no USD rates');
  // This feed only gives the day, so its data counts as published at the start of that day in UTC.
  return {
    source: 'currency-api',
    ratesPerUsd: checkedRates(data.usd as Record<string, unknown>, false),
    providerUpdatedAt: checkedTime(`${data.date}T00:00:00Z`, now),
  };
}

// The secondary source, used only when the primary fails or has gone stale.
export class CurrencyApiProvider implements FxProvider {
  readonly name = 'currency-api' as const;

  constructor(
    private readonly url: string,
    private readonly timeoutMs: number,
  ) {}

  async fetchLatest(): Promise<ProviderRates> {
    return parseCurrencyApi(
      await fetchJson(this.url, { timeoutMs: this.timeoutMs }),
    );
  }
}
