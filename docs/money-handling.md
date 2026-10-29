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
- Cap per operation (_proposed_): 1,000,000,000 units of the currency. The largest balance a
  `bigint` holds at this scale is about 9.2 trillion units. A credit that would take a balance
  past that is refused with `422 BALANCE_LIMIT`, checked under the row lock.

## FX maths

- Provider rates are stored as strings with up to 12 decimals, per 1 USD.
- Cross rate `A → B = rate(B per USD) / rate(A per USD)`, computed exactly with `bigint`
  (no float and no decimal library), then rounded **half-even to 10 decimals**. That 10-decimal rate is the rate
  stored on the transaction and shown to the client.
- Fee = `fromAmount × FEE_BPS / 10,000`, rounded **up** to 6 decimals, in the source currency.
  The default is 50 basis points (0.5%) on swaps and cross-currency transfers; same-currency
  transfers and deposits are free ([ADR-014](decisions/ADR-014-fees-and-platform-account.md)).
- Converted amount = `(fromAmount − fee) × rate`, rounded **down** to 6 decimals. Rounding down
  means the system never credits more than the value debited.
- Rounding = the whole source millionths left after the conversion, that is
  `fromAmount − fee − ⌈toAmount ÷ rate⌉`. Fee and rounding both go to the platform account.
  Only the part below one millionth of the source currency is not booked.
- If the converted amount rounds to zero, the request is refused (`422 AMOUNT_TOO_SMALL`).
- USD totals use the same rates and rounding, per balance, then sum.

## FX rates

### Provider choice

| Provider                                                                          | NGN | GHS | XAF | Key    | Updates          | Use                                       |
| --------------------------------------------------------------------------------- | --- | --- | --- | ------ | ---------------- | ----------------------------------------- |
| ExchangeRate-API open endpoint (`open.er-api.com/v6/latest/USD`)                  | Yes | Yes | Yes | None   | Daily            | **Primary**                               |
| Currency API by fawazahmed0 (`latest.currency-api.pages.dev`, mirror on jsDelivr) | Yes | Yes | Yes | None   | Daily            | **Secondary**                             |
| Frankfurter (ECB data)                                                            | No  | No  | No  | None   | Daily            | Not used: can't price three of five coins |
| ExchangeRate-API key plan / paid feeds                                            | Yes | Yes | Yes | Needed | Hourly or faster | Production option                         |

Checked on 29 Oct 2026: both chosen sources returned NGN, GHS, XAF and EUR for that day;
Frankfurter returned only EUR.

I read both sources' terms on 29 Oct 2026:

- **ExchangeRate-API open endpoint** ([terms](https://www.exchangerate-api.com/terms),
  [open access docs](https://www.exchangerate-api.com/docs/free)):
  - attribution is required, with a link to exchangerate-api.com;
  - caching is allowed, and so is personal or commercial currency conversion;
  - clients should ask about once a day, and a rate-limited IP gets `429` for 20 minutes;
  - redistribution is not allowed, and the data may not be used "in any product or service
    that offers programmatic or automatic access to exchange rate data".

  `GET /fx/rates` publishes rates, so it conflicts with that last clause. I kept the design
  for this non-commercial sandbox, because the brief asks for a rates endpoint, and I list the
  conflict as a known limitation. A production build needs a feed whose licence allows
  republishing, or must publish only the CC0 source below.

- **Currency API by fawazahmed0** ([repository](https://github.com/fawazahmed0/exchange-api)):
  CC0-1.0 (public domain), no rate limits, no attribution needed.

The API (`attribution` in `GET /fx/rates`) and the README show the attribution.

These are **daily reference rates, not executable market prices**. That is stated in the
README.

### Freshness standard

There are two industry norms, and the free sources only allow the second:

- **Live market pricing** (trading desks, card schemes, remittance apps with paid feeds):
  rates refreshed every few seconds, quotes valid 15–60 seconds, and execution refused on
  a rate older than that.
- **Daily reference rates** (ECB, central-bank fixings, accounting): a rate is valid until
  the next daily publication, with a short grace period. A rate from an older publication
  is stale and is not used to move money.

Borderless follows the second:

| Setting                                         | Value                                   | Why                                                                                                                                |
| ----------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `FX_MAX_DATA_AGE_HOURS`                         | **26**                                  | One 24-hour publication cycle plus 2 hours' grace. Measured from the provider's own update time, not from when the API fetched it. |
| Execution on stale rates                        | **Refused** (`503 FX_RATE_UNAVAILABLE`) | Fail closed: money never moves on a rate from a missed publication.                                                                |
| Quote validity (if the quote endpoint is built) | **30 seconds**                          | Typical remittance quote window.                                                                                                   |
| Client-supplied rates                           | Never accepted                          | The server prices every operation.                                                                                                 |

### Refresh and fallback

1. **Primary refresh:** on startup, then 5 minutes after the provider's
   `time_next_update_utc`. This keeps the API on the latest publication while calling about once
   a day, as the provider asks. The provider's next-update time is only a hint: the wait is
   capped at 24 hours and always ends 15 minutes before the current rates would go stale.
   3 s timeout, up to 2 retries with full-jitter backoff (base 500 ms) on network errors,
   timeouts and 5xx. A `429` is not retried, and the next try waits 30 minutes even if the
   secondary answered. Bodies over 1 MB are cut off while reading, and redirects are refused.
2. **Failure:** if the primary fails or its data is older than 26 h, fetch the secondary
   (same timeout and retry rules). Failed refreshes retry every 15 minutes with jitter until
   one source succeeds.
3. **Validation:** both adapters check that all five fiat codes are present, each a finite
   number `> 0`, and the update time is parseable and not in the future. Anything else is a
   failed fetch.
4. **Big moves need two sources.** An answer that moves any rate more than 20% from the
   current live rates, or the very first answer when there are no live rates yet, is used only
   if the other provider agrees with it within 2%. One broken feed is refused; a real
   devaluation, seen by both, is accepted at once. When the two disagree and nothing trusted
   exists yet, neither is used until they agree. A single answer is accepted only when there
   is no trusted rate and the other source is down.
5. A valid response is stored as a new `fx_snapshots` row with `source`,
   `provider_updated_at` and `fetched_at`.
6. **Pricing:** the newest snapshot (from either source) whose provider data is at most
   26 h old. If none, swaps and transfers get `503` and nothing moves. Deposits and reads
   still work; balances show `totalUsd: null` with the reason.
7. `GET /fx/rates` always answers: the newest snapshot, with `isStale: true` once it is past
   26 h, so clients can see the last known rates and their age.
8. Requests never call a provider. A slow provider can't slow the API.
9. Every transaction stores its rate, source and the provider update time it used.

A fixed rate table (which the brief also allows) exists only for offline demos and tests,
behind `FX_FIXED_TABLE=false` by default. When turned on it is used only if both live
sources fail, and every response and transaction marks it `fixed-table`. Live rates replace it
as soon as a provider answers again, and it is never loaded after a restart with the setting
off.

### Pegs

The fixed table keeps cXAF at the official peg 655.957 XAF per EUR. Live data is used as
given.

## Idempotency

- Header `Idempotency-Key` on deposits, swaps and transfers. Required (missing → `400`).
- Inside the money transaction, first statement:
  `INSERT INTO idempotency_keys (account_id, key, request_hash, ...) VALUES (...) ON CONFLICT (account_id, key) DO NOTHING RETURNING key`.
  - Row inserted → this request owns the key; run the operation; update the row with the
    response; commit.
  - No row returned → another request has (or had) the key. Read it: same hash → return the
    stored response; different hash → `422 IDEMPOTENCY_KEY_REUSED`.
- A parallel request with the same key blocks on the unique index until the first commits or
  rolls back. On commit it replays; on rollback its own insert succeeds and it runs. So no
  lookup-then-insert race exists.
- Failures roll back the key with everything else. A retry after a failure runs again. I
  don't store error answers: a later retry may legitimately succeed (for example after a
  deposit).
- Keys expire after 24 h; a job deletes expired rows hourly. An expired key can be reused.
- Scope: per account, unique `(account_id, key)`. Keys should be random (UUID).

## Concurrency

- Every balance change goes through `LedgerService` inside one transaction.
- It locks the balance rows it needs with `SELECT ... FOR UPDATE`, **always ordered by
  `(wallet_id, currency)`**, so opposite transfers (A→B and B→A) can't deadlock.
- It checks funds on the locked row, then updates. No read-modify-write outside a lock.
- `CHECK (amount >= 0)` stays as a final guard; a violation maps to `422`.
- `lock_timeout` 3 s: a request that can't get its lock in time gets `503 SERVICE_BUSY`
  instead of hanging.
- A deadlock or serialization failure, which the lock order should prevent, makes the server
  rerun the whole transaction up to twice, after a full-jitter wait (20 ms base, 200 ms cap).
  The failed attempt was rolled back, idempotency claim included, so the rerun moves money
  once. After that it answers `503 SERVICE_BUSY` ([ADR-012](decisions/ADR-012-retry-policies.md)).
- Wallet IDs are lowercased before any comparison or lock, because Postgres ignores case in
  UUIDs and the lock order must not depend on how a client wrote them.
- Isolation level: READ COMMITTED with row locks (enough, because every write locks what it
  changes).
- Tests: parallel swaps against one balance, parallel opposite transfers, parallel same-key
  requests, and a ledger sum check after each.

## What is not guaranteed

- No outside side effects happen inside a money operation (deposits are simulated), so there
  is no outbox or reconciliation. A real payout rail would need one.
- The part of a conversion below one millionth of the source currency is not booked anywhere.
