# Money, Idempotency, Concurrency and FX

The brief asks the README to explain these four topics (p.3). This document is the detailed
version; the README will summarise it.

## Precision

- Every stablecoin uses **6 decimal places** (like most fiat-backed tokens). 1 cNGN is stored
  as `1000000`.
- Balances and amounts are `bigint` in PostgreSQL and `BigInt` in TypeScript. They never pass
  through a JavaScript `number`.
- The API accepts amounts as strings matching `^\d{1,15}(\.\d{1,6})?$` and returns them with
  exactly 6 decimals. More than 6 decimals is refused, not rounded.
- Cap per operation (*proposed*): 1,000,000,000 units of the currency. The largest balance a
  `bigint` holds at this scale is about 9.2 trillion units, far above any test.

## FX maths

- Provider rates are stored as strings with up to 12 decimals, per 1 USD.
- Cross rate `A → B = rate(B per USD) / rate(A per USD)`, computed with `decimal.js`
  (precision 40), then rounded **half-even to 10 decimals**. That 10-decimal rate is the rate
  stored on the transaction and shown to the client.
- Converted amount = `fromAmount × rate`, rounded **down** to 6 decimals. Rounding down means
  the system never credits more than the value debited. The difference (under one millionth)
  is not tracked; this is documented as a known limitation.
- If the converted amount rounds to zero, the request is refused (`422 AMOUNT_TOO_SMALL`).
- No fees or spreads (brief doesn't ask for them).
- USD totals use the same rates and rounding, per balance, then sum.

## FX rates

### Provider choice

| Provider | NGN | GHS | XAF | Key | Updates | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Frankfurter (ECB data) | No | No | No | None | Daily | Can't price three of five coins |
| ExchangeRate-API open endpoint (`open.er-api.com/v6/latest/USD`) | Yes | Yes | Yes | None | Daily | **Chosen** |
| ExchangeRate-API free key plan | Yes | Yes | Yes | Needed | Daily | Same data, adds a secret for reviewers |

Checked on 29 Oct 2026: the open endpoint returned NGN, GHS, XAF and EUR, with
`time_last_update_utc` and `time_next_update_utc`; Frankfurter returned only EUR for that
set. The open endpoint asks for attribution and is rate limited; its terms
(`exchangerate-api.com/terms`) must be re-read before submission. The API
and README show the attribution.

These are **daily reference rates, not executable market prices**. That is fine for a
sandbox and is stated in the README.

### Refresh and fallback

1. On startup and every `FX_REFRESH_MINUTES` (60), fetch the provider: 3 s timeout, up to 2
   retries with full-jitter backoff (base 500 ms), only on network errors, timeouts, 5xx
   and 429.
2. Validate the response: `result === "success"`, all five fiat codes present, each a finite
   number `> 0`, update time parseable. Anything else is a failed fetch.
3. A valid response is stored as a new `fx_snapshots` row.
4. Pricing uses the newest live snapshot if `fetched_at` is younger than
   `FX_MAX_AGE_HOURS` (48). The provider updates daily, so 48 h allows one missed update.
5. Otherwise pricing uses the **fixed fallback table** in the code (USD-based rates with the
   date they were set). The brief allows "a fixed rate table you define".
6. Every response that shows a rate says its `source`, `isFallback` and time. Every
   transaction stores its rate, source and rate time.
7. Requests never call the provider. A slow provider can't slow the API.

`isStale` on `GET /fx/rates` is `true` when the live snapshot is older than 26 h (one
provider cycle plus margin).

**Open decision D-03:** when only fallback rates are available, should swaps and transfers
still run (recommended: yes, marked `fallback-table`; it is a sandbox and the brief allows a
fixed table) or be refused with `503`?

### Pegs

The fallback table keeps cXAF at the official peg 655.957 XAF per EUR. Live data is used as
given.

## Idempotency

- Header `Idempotency-Key` on deposits, swaps and transfers. Required (missing → `400`).
- Inside the money transaction, first statement:
  `INSERT INTO idempotency_keys (key, request_hash, ...) VALUES (...) ON CONFLICT (key) DO NOTHING RETURNING key`.
  - Row inserted → this request owns the key; run the operation; update the row with the
    response; commit.
  - No row returned → another request has (or had) the key. Read it: same hash → return the
    stored response; different hash → `422 IDEMPOTENCY_KEY_REUSED`.
- A parallel request with the same key blocks on the unique index until the first commits or
  rolls back. On commit it replays; on rollback its own insert succeeds and it runs. So no
  lookup-then-insert race exists.
- Failures roll back the key with everything else. A retry after a failure runs again. We
  don't store error answers: a later retry may legitimately succeed (for example after a
  deposit).
- Keys expire after 24 h; a job deletes expired rows hourly. An expired key can be reused.
- Scope: global. Keys should be random (UUID); the docs say so.

## Concurrency

- Every balance change goes through `LedgerService` inside one transaction.
- It locks the balance rows it needs with `SELECT ... FOR UPDATE`, **always ordered by
  `(wallet_id, currency)`**, so opposite transfers (A→B and B→A) can't deadlock.
- It checks funds on the locked row, then updates. No read-modify-write outside a lock.
- `CHECK (amount >= 0)` stays as a final guard; a violation maps to `422`.
- `lock_timeout` 3 s: a request that can't get its lock in time gets `503 SERVICE_BUSY`
  instead of hanging.
- Isolation level: READ COMMITTED with row locks (enough, because every write locks what it
  changes).
- Tests: parallel swaps against one balance, parallel opposite transfers, parallel same-key
  requests, and a ledger sum check after each.

## What is not guaranteed

- No outside side effects happen inside a money operation (deposits are simulated), so there
  is no outbox or reconciliation. A real payout rail would need one.
- Rounding remainders (below 0.000001) are not booked to a platform account.
