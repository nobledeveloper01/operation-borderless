import fc from 'fast-check';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import { STABLECOINS } from '../../src/common/currencies/currency.js';
import { FxService } from '../../src/modules/fx/fx.service.js';
import { connect } from '../support/db.js';
import { FakeProvider, primaryRates } from '../support/fx.js';
import { deposit, swap, transfer } from '../support/money.js';
import { createTestApp } from '../support/test-app.js';
import { createWallet, type TestWallet } from '../support/wallets.js';

const coin = fc.constantFrom(...STABLECOINS);
const who = fc.integer({ min: 0, max: 2 });
// Small and large amounts, so some movements overdraw and some convert to almost nothing.
const amount = fc.oneof(
  fc.constantFrom('0.000001', '0.01', '1', '250', '999999'),
  fc.integer({ min: 1, max: 5_000_000 }).map((n) => (n / 1000).toFixed(3)),
);
const command = fc.oneof(
  fc.record({
    kind: fc.constant('deposit' as const),
    w: who,
    currency: coin,
    amount,
  }),
  fc.record({
    kind: fc.constant('swap' as const),
    w: who,
    from: coin,
    to: coin,
    amount,
  }),
  fc.record({
    kind: fc.constant('transfer' as const),
    w: who,
    to: who,
    from: coin,
    toCurrency: coin,
    amount,
  }),
);

describe('money under random sequences', () => {
  let app: NestExpressApplication;
  let db: pg.Client;
  const now = new Date();
  const primary = new FakeProvider('exchangerate-api');
  const secondary = new FakeProvider('currency-api');

  beforeAll(async () => {
    app = await createTestApp(
      { FEE_BPS: '50' },
      { fxProviders: [primary, secondary], clock: () => now },
    );
    db = await connect();
    primary.answer = () => primaryRates(now);
    await app.get(FxService).refresh();
  });

  afterAll(async () => {
    await db.end();
    await app.close();
  });

  it('never answers 500 and always leaves the books balanced', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(command, { minLength: 5, maxLength: 25 }),
        async (commands) => {
          const wallets: TestWallet[] = [];
          for (let i = 0; i < 3; i++) wallets.push(await createWallet(app));
          const statuses = new Set<number>();
          for (const c of commands) {
            const w = wallets[c.w]!;
            const res =
              c.kind === 'deposit'
                ? await deposit(app, w, c.currency, c.amount)
                : c.kind === 'swap'
                  ? await swap(app, w, {
                      fromCurrency: c.from,
                      toCurrency: c.to,
                      amount: c.amount,
                    })
                  : await transfer(app, w, {
                      toWalletId: wallets[c.to]!.walletId,
                      fromCurrency: c.from,
                      toCurrency: c.toCurrency,
                      amount: c.amount,
                    });
            statuses.add(res.status);
            if (res.status >= 500) return false;
          }
          // Only success and expected refusals: bad pair, overdraft, too small, same wallet.
          expect([...statuses].every((s) => [201, 400, 422].includes(s))).toBe(
            true,
          );
          // Checked for this run's wallets only: other test files share the database and some corrupt it on purpose.
          const ids = wallets.map((w) => w.walletId);
          const [books] = (
            await db.query<{
              negative: number;
              drift: number;
              platform: number;
            }>(
              `SELECT
                 (SELECT count(*)::int FROM balances WHERE amount < 0 AND wallet_id = ANY ($1)) AS negative,
                 (SELECT count(*)::int FROM balances b
                    LEFT JOIN (SELECT wallet_id, currency, sum(amount) AS total FROM ledger_entries GROUP BY 1, 2) l
                      ON l.wallet_id = b.wallet_id AND l.currency = b.currency
                   WHERE b.wallet_id = ANY ($1) AND b.amount <> COALESCE(l.total, 0)) AS drift,
                 (SELECT count(*)::int FROM transactions t
                    LEFT JOIN platform_entries f ON f.transaction_id = t.id AND f.kind = 'fee'
                    LEFT JOIN platform_entries r ON r.transaction_id = t.id AND r.kind = 'rounding'
                   WHERE (t.from_wallet_id = ANY ($1) OR t.to_wallet_id = ANY ($1))
                     AND (t.fee_amount <> COALESCE(f.amount, 0) OR t.rounding_amount <> COALESCE(r.amount, 0))) AS platform`,
              [ids],
            )
          ).rows;
          return (
            books!.negative === 0 && books!.drift === 0 && books!.platform === 0
          );
        },
      ),
      { numRuns: 12, seed: 20261029 },
    );
  });
});
