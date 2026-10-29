# Functional Requirements Document

IDs here are used in the [traceability matrix](requirements-traceability.md) and in test names.
"Brief" means the assessment brief; page numbers refer to it. Endpoints are defined in
[api-specification.md](api-specification.md).

Common rules for every requirement:

- Every wallet route needs a session token or a wallet key and checks ownership (FR-022 to
  FR-027, [authentication.md](authentication.md)). Wallet IDs are random UUIDs.
- Money amounts in requests and responses are decimal strings (for example `"1500.25"`),
  never JSON numbers.
- Errors use the shared error body (api-specification.md, "Errors").
- Money writes (FR-005, FR-006, FR-010) need an `Idempotency-Key` header (FR-009).

---

## FR-001 Create a wallet

- **Source:** brief p.2, Wallets. Mandatory.
- **Actor:** API client.
- **Trigger:** `POST /api/v1/wallets` with `email` and/or `phoneNumber`, and `password`.
- **Main flow:** validate; normalise the email (trim, lower case) and the number (E.164);
  hash the password (argon2id); insert the account, the wallet and five zero balances in one
  transaction; start a session; return `201` with the wallet, balances and tokens.
- **Alternative flows:** both email and number given → both are stored and both must be free.
- **Failures:** neither given, bad email, bad number → `400`. Identifier already used → `409`
  (FR-002).
- **Data changes:** one `wallets` row, five `balances` rows.
- **Acceptance:** AC-001 a wallet created with an email returns `201`, an ID and five zero
  balances; AC-002 a wallet created with a number in local format is stored in E.164.
- **Tests:** TC-001, TC-002, TC-003.

## FR-002 One wallet per identifier

- **Source:** brief p.2 ("the same email or number cannot create two wallets"). Mandatory.
- **Rule:** unique indexes on normalised email and normalised number. The database decides,
  so two parallel creates can't both win.
- **Failure:** `409 WALLET_ALREADY_EXISTS`. The message doesn't say which wallet owns it.
- **Acceptance:** AC-003 `User@Mail.com` after `user@mail.com` → `409`; AC-004 ten parallel
  creates with one email → one `201`, nine `409`.
- **Tests:** TC-004, TC-005.

## FR-003 Balance per stablecoin

- **Source:** brief p.2. Mandatory.
- **Rule:** every wallet has exactly one balance row per supported stablecoin (cNGN, cGHS,
  cXAF, USDx, EURx), created with the wallet. Unsupported codes are refused with `400`
  everywhere.
- **Acceptance:** AC-005 a new wallet has five balances, each `"0.000000"` (6 decimal
  places, see [money-handling.md](money-handling.md#precision)).
- **Tests:** TC-001, TC-006.

## FR-004 Balances with USD total

- **Source:** brief p.2. Mandatory.
- **Trigger:** `GET /api/v1/wallets/{walletId}/balances` (also embedded in `GET /wallets/{walletId}`).
- **Main flow:** read balances; convert each to USDx at current rates; sum; round down.
- **Output:** each balance, `totalUsd`, the rate source, and `ratesAsOf`.
- **Failures:** unknown wallet → `404`. No usable rate → balances still returned, `totalUsd`
  is `null` with a reason (balances must never be hidden by an FX outage).
- **Acceptance:** AC-006 with fixed test rates, a wallet holding 1,500 cNGN and 10 USDx
  shows the exact expected total.
- **Tests:** TC-007, TC-008.

## FR-005 Simulated deposit

- **Source:** brief p.2, Deposits. Mandatory.
- **Trigger:** `POST /api/v1/wallets/{walletId}/deposits` with `currency` and `amount`.
- **Main flow:** in one transaction: claim the idempotency key, lock the balance row, add the
  amount, write a `DEPOSIT` transaction and one ledger line; return `201` with the
  transaction and the new balance.
- **Failures:** amount ≤ 0, more than the allowed decimals, above the cap, unknown currency →
  `400`; unknown wallet → `404`.
- **Acceptance:** AC-007 depositing `"100.50"` cGHS raises that balance by exactly 100.50 and
  the response holds the transaction; AC-008 the same deposit retried with the same key
  changes the balance once.
- **Tests:** TC-009, TC-010, TC-011.

## FR-006 Swap inside a wallet

- **Source:** brief p.2, Cross-currency swaps. Mandatory.
- **Trigger:** `POST /api/v1/wallets/{walletId}/swaps` with `fromCurrency`, `toCurrency`,
  `amount` (in `fromCurrency`).
- **Main flow:** get the current rate (FR-007) before the transaction; in one transaction
  claim the key, lock both balance rows in a fixed order, check funds (FR-008), debit,
  credit the converted amount, write a `SWAP` transaction with rate, source and rate time,
  and two ledger lines; return `201`.
- **Failures:** same currency → `400`; amount converts to zero → `422 AMOUNT_TOO_SMALL`;
  insufficient funds → `422 INSUFFICIENT_FUNDS`; no usable rate → `503 FX_RATE_UNAVAILABLE`.
- **Acceptance:** AC-009 swapping 1,000 cNGN at a known test rate gives the exact expected
  USDx; AC-010 both balances change in the same transaction or neither does.
- **Tests:** TC-012, TC-013, TC-014.

## FR-007 FX rates: live with fallback

- **Source:** brief p.2 ("live is preferred, with a fallback when the provider fails").
  Mandatory.
- **Rule:** rates come from two live daily sources through adapters (primary, then
  secondary). A snapshot can price money only while the provider's data is at most 26 hours
  old (one daily publication plus 2 hours' grace). Past that, swaps and transfers are refused
  with `503`; nothing moves on a stale rate. Requests never wait on a provider. Each snapshot
  records its source, the provider's update time and the fetch time. See
  [money-handling.md](money-handling.md#freshness-standard).
- **Failures:** timeout, network error, non-200, bad JSON, missing currency, non-positive or
  future-dated rate, or a jump above 20% → the fetch is refused, logged, and the secondary
  source or the previous snapshot is used if still fresh.
- **Acceptance:** AC-011 a primary timeout switches to the secondary; AC-012 when both fail
  and the last snapshot is older than 26 h, swaps and transfers get `503` and
  `GET /fx/rates` shows the old rates with `isStale: true`.
- **Tests:** TC-015, TC-016, TC-017, TC-018.

## FR-008 No negative balances

- **Source:** brief p.2 (swaps). Mandatory; applied to transfers too (inferred, FR-017).
- **Rule:** the service checks funds on the locked row; the database also has
  `CHECK (amount >= 0)` as a last guard.
- **Acceptance:** AC-013 swapping more than the balance → `422`, nothing changes; AC-014 20
  parallel swaps, each worth a quarter of the balance → exactly 4 succeed and the balance
  ends at zero.
- **Tests:** TC-019, TC-020.

## FR-009 Never process the same request twice

- **Source:** brief p.2 (swaps). Mandatory; applied to deposits and transfers (FR-018).
- **Rule:** `Idempotency-Key` header (8–128 chars, `[A-Za-z0-9_-]`) required on money writes.
  The key is stored with a hash of the request in the same database transaction as the money
  movement. See [money-handling.md](money-handling.md#idempotency).
  - same key, same request → the stored response, status unchanged, header
    `Idempotent-Replayed: true`;
  - same key, different request → `422 IDEMPOTENCY_KEY_REUSED`;
  - same key sent in parallel → one runs; the others wait for its commit and replay it;
  - missing key → `400`.
- **Acceptance:** AC-015 ten parallel swaps with one key create one transaction and all ten
  return the same body.
- **Tests:** TC-021, TC-022, TC-023, TC-024.

## FR-010 Transfer between wallets

- **Source:** brief p.2, Transfers. Mandatory.
- **Trigger:** `POST /api/v1/transfers` with `fromWalletId`, `toWalletId`, `fromCurrency`,
  `toCurrency` (optional; defaults to `fromCurrency`), `amount` (in `fromCurrency`).
- **Main flow:** get the rate when currencies differ (FR-011); in one transaction claim the
  key, lock both balance rows ordered by `(wallet_id, currency)`, check funds, debit the
  sender, credit the receiver, write a `TRANSFER` transaction and two ledger lines; return
  `201`.
- **Failures:** same wallet → `422 SAME_WALLET`; unknown wallet → `404`; insufficient funds
  → `422`; no rate → `503`.
- **Acceptance:** AC-016 a same-currency transfer moves the exact amount with rate `"1"`;
  AC-017 opposite transfers A→B and B→A in parallel never deadlock.
- **Tests:** TC-025, TC-026, TC-027.

## FR-011 Automatic conversion

- **Source:** brief p.2. Mandatory.
- **Rule:** different currencies → destination amount = source amount × current rate,
  rounded down to the destination's decimals.
- **Acceptance:** AC-018 20 USDx → cGHS at a known test rate credits the exact expected cGHS.
- **Tests:** TC-028.

## FR-012 Transfer record

- **Source:** brief p.2. Mandatory.
- **Rule:** each transfer stores sender, receiver, source amount and currency, destination
  amount and currency, the rate applied, the rate's source and time, and the creation
  timestamp. Records are append-only.
- **Acceptance:** AC-019 `GET /transactions/{id}` for a transfer returns every field listed.
- **Tests:** TC-029.

## FR-013 Transaction history

- **Source:** brief p.2–3. Mandatory.
- **Trigger:** `GET /api/v1/wallets/{walletId}/transactions`.
- **Rule:** returns deposits, swaps, transfers sent and transfers received, newest first
  (`created_at DESC, id DESC`). Each item says its `direction` for this wallet
  (`IN`, `OUT`, `INTERNAL`).
- **Acceptance:** AC-020 after a deposit, a swap, a sent and a received transfer, the list has
  four items in reverse order.
- **Tests:** TC-030.

## FR-014 Pagination and filters

- **Source:** brief p.2–3. Mandatory.
- **Rule:** `page` (default 1) and `limit` (default 20, max 100); `type` (`DEPOSIT`, `SWAP`,
  `TRANSFER`, comma list allowed) and `currency` (matches either side of the transaction).
  Response includes `page`, `limit`, `total`.
- **Failures:** bad values → `400`.
- **Acceptance:** AC-021 25 deposits, `limit=10&page=3` → 5 items, `total` 25; AC-022
  `currency=cGHS` returns only transactions touching cGHS.
- **Tests:** TC-031, TC-032.

## FR-015 Transaction by ID

- **Source:** brief p.3. Mandatory.
- **Trigger:** `GET /api/v1/transactions/{transactionId}`.
- **Failures:** not a UUID → `400`; not found → `404`.
- **Tests:** TC-029, TC-033.

## FR-016 Current rates

- **Source:** brief p.3. Mandatory.
- **Trigger:** `GET /api/v1/fx/rates`.
- **Output:** every ordered pair of the five stablecoins (20 pairs) with `rate`, plus
  `source`, `providerUpdatedAt`, `fetchedAt`, `isStale`.
- **Acceptance:** AC-023 the response has 20 pairs and each pair's inverse multiplies to
  ≈1 within rounding.
- **Tests:** TC-034.

## FR-017 Transfers refuse overdrafts (inferred)

Same as FR-008 for the sender's balance. Tests TC-026, TC-035.

## FR-018 Deposits and transfers are idempotent (inferred)

Same as FR-009. Tests TC-011, TC-036.

## Could-have (only if time allows)

- **FR-019 Quote:** `GET /api/v1/fx/quote?from=&to=&amount=` returns the amount the client
  would get now, with the rate. No money moves.
- **FR-020 Wallet lookup:** `GET /api/v1/wallets?email=` or `?phoneNumber=`.

## FR-022 Log in (beyond the brief)

- `POST /api/v1/auth/login` with identifier + password → `200` with access and refresh
  tokens. Wrong identifier, wrong password or locked account → the same `401`. 5 failures
  lock the account for 15 minutes.
- **Tests:** TC-047, TC-048, TC-049.

## FR-023 Refresh with rotation (beyond the brief)

- `POST /api/v1/auth/refresh` → new pair; the old refresh token stops working. Reusing a used
  token revokes the whole session (`401`).
- **Tests:** TC-050, TC-051.

## FR-024 Log out (beyond the brief)

- `POST /auth/logout` revokes this session; `POST /auth/logout-all` revokes all. The access
  token stops working on the next request.
- **Tests:** TC-052.

## FR-025 Wallet keys (beyond the brief)

- Create (key shown once), list (no secrets), revoke. Max 5 active. Session only.
- A key acts only on its own wallet; a revoked key → `401`.
- **Tests:** TC-053, TC-054.

## FR-026 Ownership on every wallet route (beyond the brief)

- Balances, history, deposits, swaps, transfers (sender), transaction by ID (sender or
  receiver) need the owner. Others → `404`. No credentials → `401`.
- **Tests:** TC-055, TC-056, TC-057.

## FR-027 Token checks (beyond the brief)

- Expired, wrongly signed, `alg: none`, wrong `iss`/`aud`, malformed → `401`.
- **Tests:** TC-058.

## Health (Should)

- **FR-021:** `GET /health` (process up) and `GET /health/ready` (database reachable). No
  internal details in the body.
