import { readFileSync } from 'node:fs';
import { parseCurrencyApi } from '../../../../src/modules/fx/providers/currency-api.provider.js';
import { parseExchangeRateApi } from '../../../../src/modules/fx/providers/exchangerate-api.provider.js';
import {
  InvalidRates,
  movedTooFar,
  sourcesAgree,
} from '../../../../src/modules/fx/rate-validation.js';

const load = (name: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../../../fixtures/fx/${name}.json`, import.meta.url),
      'utf8',
    ),
  ) as Record<string, unknown>;
const now = new Date('2026-10-29T12:00:00Z');

describe('FX provider answers', () => {
  it('reads the primary answer as exact decimal strings with its publication times', () => {
    const rates = parseExchangeRateApi(load('exchangerate-api'), now);
    expect(rates.ratesPerUsd).toEqual({
      USD: '1.000000000000',
      NGN: '1346.236888000000',
      GHS: '11.639916000000',
      XAF: '588.529080000000',
      EUR: '0.897215000000',
    });
    expect(rates.providerUpdatedAt.toISOString()).toBe(
      '2026-10-29T00:02:31.000Z',
    );
    expect(rates.nextUpdateAt?.toISOString()).toBe('2026-10-30T00:19:41.000Z');
  });

  it('reads the secondary answer, dating it from the start of its publication day', () => {
    const rates = parseCurrencyApi(load('currency-api'), now);
    expect(rates.ratesPerUsd.NGN).toBe('1345.463968880000');
    expect(rates.providerUpdatedAt.toISOString()).toBe(
      '2026-10-29T00:00:00.000Z',
    );
  });

  it('TC-017 refuses answers that could not be real', () => {
    const base = load('exchangerate-api');
    const rates = base.rates as Record<string, unknown>;
    const broken: Record<string, unknown>[] = [
      { ...base, result: 'error' },
      { ...base, base_code: 'EUR' },
      { ...base, rates: { ...rates, NGN: undefined } },
      { ...base, rates: { ...rates, GHS: 0 } },
      { ...base, rates: { ...rates, XAF: -5 } },
      { ...base, rates: { ...rates, EUR: 'NaN' } },
      { ...base, rates: { ...rates, NGN: 1e300 } },
      { ...base, rates: { ...rates, EUR: 1e-20 } },
      { ...base, rates: { ...rates, USD: 2 } },
      { ...base, time_last_update_unix: 'yesterday' },
      { ...base, time_last_update_unix: now.getTime() / 1000 + 3600 },
    ];
    for (const body of broken)
      expect(
        () => parseExchangeRateApi(body, now),
        JSON.stringify(body).slice(0, 80),
      ).toThrow(InvalidRates);
    expect(() => parseExchangeRateApi('not json at all', now)).toThrow(
      InvalidRates,
    );
    expect(() =>
      parseCurrencyApi({ date: '29/10/2026', usd: {} }, now),
    ).toThrow(InvalidRates);
  });

  it('TC-017 refuses a move of more than 20% against the last snapshot', () => {
    const previous = parseExchangeRateApi(load('exchangerate-api'), now);
    const moved = {
      ...previous,
      ratesPerUsd: { ...previous.ratesPerUsd, NGN: '1700.000000000000' },
    };
    expect(movedTooFar(moved, previous)).toBe(true);
    const small = {
      ...previous,
      ratesPerUsd: { ...previous.ratesPerUsd, NGN: '1400.000000000000' },
    };
    expect(movedTooFar(small, previous)).toBe(false);
    expect(
      sourcesAgree(previous, parseCurrencyApi(load('currency-api'), now)),
    ).toBe(true);
    expect(sourcesAgree(previous, small)).toBe(false);
  });
});
