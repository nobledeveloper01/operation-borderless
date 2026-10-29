import { fetchJson } from '../../common/http/fetch-json.js';
import { checkedRates, checkedTime, InvalidRates } from '../rate-validation.js';
import type { ProviderRates } from '../fx.types.js';
import type { FxProvider } from './fx-provider.js';

interface OpenErApiBody {
  result?: unknown;
  base_code?: unknown;
  rates?: unknown;
  time_last_update_unix?: unknown;
  time_next_update_unix?: unknown;
}

export function parseExchangeRateApi(
  body: unknown,
  now = new Date(),
): ProviderRates {
  const data = (body ?? {}) as OpenErApiBody;
  if (data.result !== 'success' || data.base_code !== 'USD')
    throw new InvalidRates('The answer is not a USD success');
  if (typeof data.rates !== 'object' || data.rates === null)
    throw new InvalidRates('The answer has no rates');
  const next =
    typeof data.time_next_update_unix === 'number'
      ? new Date(data.time_next_update_unix * 1000)
      : undefined;
  return {
    source: 'exchangerate-api',
    ratesPerUsd: checkedRates(data.rates as Record<string, unknown>, true),
    providerUpdatedAt: checkedTime(data.time_last_update_unix, now),
    nextUpdateAt: next && !Number.isNaN(next.getTime()) ? next : undefined,
  };
}

// The primary source: ExchangeRate-API's open endpoint, which asks to be called about once a day.
export class ExchangeRateApiProvider implements FxProvider {
  readonly name = 'exchangerate-api' as const;

  constructor(
    private readonly url: string,
    private readonly timeoutMs: number,
  ) {}

  async fetchLatest(now: Date): Promise<ProviderRates> {
    return parseExchangeRateApi(
      await fetchJson(this.url, { timeoutMs: this.timeoutMs }),
      now,
    );
  }
}
