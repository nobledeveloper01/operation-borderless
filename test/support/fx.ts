import { readFileSync } from 'node:fs';
import { FetchFailure } from '../../src/common/http/fetch-json.js';
import type { ProviderRates } from '../../src/modules/fx/fx.types.js';
import type { FxProvider } from '../../src/modules/fx/providers/fx-provider.js';
import { parseCurrencyApi } from '../../src/modules/fx/providers/currency-api.provider.js';
import { parseExchangeRateApi } from '../../src/modules/fx/providers/exchangerate-api.provider.js';

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      new URL(`../fixtures/fx/${name}.json`, import.meta.url),
      'utf8',
    ),
  );

// Real recorded answers, re-dated to `now` (or hours before it), so a test's own refresh is always the newest snapshot its app has seen.
export function primaryRates(now: Date, hoursOld = 0): ProviderRates {
  const body = fixture('exchangerate-api') as Record<string, unknown>;
  const published = Math.floor((now.getTime() - hoursOld * 3_600_000) / 1000);
  return parseExchangeRateApi(
    {
      ...body,
      time_last_update_unix: published,
      time_next_update_unix: published + 86_400,
    },
    now,
  );
}

// Re-dated to `now`, so the answer is never stale on a later day and is the newest snapshot in a shared test database.
export function secondaryRates(now: Date): ProviderRates {
  // Whole seconds, like the primary's unix timestamps, so equal publish times compare equal.
  return {
    ...parseCurrencyApi(fixture('currency-api'), now),
    providerUpdatedAt: new Date(Math.floor(now.getTime() / 1000) * 1000),
  };
}

// A provider the test can switch between answering and failing.
export class FakeProvider implements FxProvider {
  calls = 0;
  answer: (() => ProviderRates) | FetchFailure = new FetchFailure(
    'network',
    'not set',
  );

  constructor(readonly name: ProviderRates['source']) {}

  fetchLatest(_now: Date): Promise<ProviderRates> {
    this.calls++;
    return this.answer instanceof FetchFailure
      ? Promise.reject(this.answer)
      : Promise.resolve(this.answer());
  }
}
