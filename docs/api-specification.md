# API Specification

This is the planned contract. The OpenAPI file generated from the code
(`docs/openapi.json`, served at `/docs`) becomes the source of truth once it exists, and a
test fails if the two drift.

## Conventions

- Base path `/api/v1`. JSON only.
- Auth: `Authorization: Bearer <access token>` or `X-Wallet-Key: <key>` on every wallet route
  ([authentication.md](authentication.md)). Someone else's wallet or transaction answers
  `404`.
- IDs are UUIDs and are named for what they are (`walletId`, `transactionId`).
- Money amounts are strings with up to 6 decimal places in requests, exactly 6 in responses.
  JSON numbers for amounts are refused with `400`.
- Currency codes: `cNGN`, `cGHS`, `cXAF`, `USDx`, `EURx` (case-sensitive).
- Timestamps are ISO 8601 UTC.
- Unknown body fields are refused (`400`).
- Every response has an `X-Request-Id` header.
- Every answer uses one envelope, built in one place (`SuccessInterceptor` for success,
  `AllExceptionsFilter` for errors). Examples below show only the `data` part of a success.

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Swap completed",
  "data": { "transactionId": "0192f5c9-...", "type": "SWAP" },
  "requestId": "6f1c...",
  "timestamp": "2026-10-29T10:05:00.000Z"
}
```

- Every answer has `Cache-Control: no-store`.

## Idempotency

`POST` deposits, swaps and transfers require `Idempotency-Key` (8–128 chars,
`[A-Za-z0-9_-]`). Keys are kept for 24 hours.

| Case                                 | Result                                                     |
| ------------------------------------ | ---------------------------------------------------------- |
| New key                              | Runs; response stored with the key                         |
| Same key, same method, path and body | Stored status and body, header `Idempotent-Replayed: true` |
| Same key, different request          | `422 IDEMPOTENCY_KEY_REUSED`                               |
| Same key in parallel                 | One runs; others wait, then replay                         |
| Request failed (4xx/5xx)             | Nothing stored; the same key can be retried                |
| Missing or invalid key               | `400`                                                      |

## Errors

```json
{
  "success": false,
  "statusCode": 422,
  "error": "Unprocessable Entity",
  "code": "INSUFFICIENT_FUNDS",
  "message": "The cNGN balance is too low for this swap.",
  "details": {
    "currency": "cNGN",
    "available": "500.000000",
    "requested": "1000.000000"
  },
  "requestId": "6f1c...",
  "path": "/api/v1/wallets/1b9.../swaps",
  "timestamp": "2026-10-29T10:00:00.000Z"
}
```

| Status | Code(s)                                                                           | When                                                              |
| ------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 400    | `VALIDATION_FAILED`, `IDEMPOTENCY_KEY_REQUIRED`, `SAME_CURRENCY`                  | Bad input                                                         |
| 401    | `UNAUTHENTICATED`, `SESSION_REVOKED`                                              | Missing, bad, expired or revoked token or key; failed login       |
| 403    | `SESSION_REQUIRED`                                                                | A wallet key used on a session-only route                         |
| 404    | `WALLET_NOT_FOUND`, `TRANSACTION_NOT_FOUND`, `ROUTE_NOT_FOUND`                    | Unknown resource                                                  |
| 409    | `WALLET_ALREADY_EXISTS`, `TOO_MANY_KEYS`                                          | Identifier already has a wallet; 5 active keys                    |
| 422    | `INSUFFICIENT_FUNDS`, `AMOUNT_TOO_SMALL`, `SAME_WALLET`, `IDEMPOTENCY_KEY_REUSED` | Valid input, refused by a business rule                           |
| 429    | `RATE_LIMITED`                                                                    | Too many requests                                                 |
| 503    | `FX_RATE_UNAVAILABLE`, `SERVICE_BUSY`                                             | No rate within 26 h of its publication; lock or statement timeout |
| 500    | `INTERNAL_ERROR`                                                                  | Unexpected; generic message only                                  |

## Endpoints

| ID      | Method and path                              | Purpose                                 | Success   |
| ------- | -------------------------------------------- | --------------------------------------- | --------- |
| API-001 | `POST /wallets`                              | Create a wallet                         | 201       |
| API-002 | `GET /wallets/{walletId}`                    | Wallet with balances and USD total      | 200       |
| API-003 | `GET /wallets/{walletId}/balances`           | Balances and USD total                  | 200       |
| API-004 | `POST /wallets/{walletId}/deposits`          | Simulated deposit                       | 201       |
| API-005 | `POST /wallets/{walletId}/swaps`             | Swap inside the wallet                  | 201       |
| API-006 | `POST /transfers`                            | Send to another wallet                  | 201       |
| API-007 | `GET /wallets/{walletId}/transactions`       | History, paged and filtered             | 200       |
| API-008 | `GET /transactions/{transactionId}`          | One transaction                         | 200       |
| API-009 | `GET /fx/rates`                              | All pair rates with refresh times       | 200       |
| API-010 | `GET /health`, `GET /health/ready`           | Liveness, readiness (outside `/api/v1`) | 200 / 503 |
| API-013 | `POST /auth/login`                           | Log in                                  | 200       |
| API-014 | `POST /auth/refresh`                         | New token pair (rotation)               | 200       |
| API-015 | `POST /auth/logout`, `POST /auth/logout-all` | End this or every session               | 200       |
| API-016 | `GET /auth/me`                               | Account and wallet ID                   | 200       |
| API-017 | `POST /wallets/{walletId}/keys`              | Create a wallet key (shown once)        | 201       |
| API-018 | `GET /wallets/{walletId}/keys`               | List keys, no secrets                   | 200       |
| API-019 | `DELETE /wallets/{walletId}/keys/{keyId}`    | Revoke a key                            | 200       |
| API-011 | `GET /fx/quote`                              | Could-have: price preview               | 200       |
| API-012 | `GET /wallets?email=` / `?phoneNumber=`      | Could-have: lookup                      | 200       |

Rate limit (_proposed_): 120 requests per minute per IP overall, 30 per minute per IP on
money writes, 10 per minute per IP on wallet creation and login.

### API-001 Create wallet

```http
POST /api/v1/wallets
Content-Type: application/json

{ "email": "ada@example.com", "password": "correct horse battery staple" }
```

Body: `email` (optional, valid email, max 254), `phoneNumber` (optional, international or
Nigerian local format, stored as E.164), `password` (12–128 characters). At least one
identifier is required. Public, 10 per minute per IP.

`201`:

```json
{
  "walletId": "0192f5c2-7b1e-7c40-9d1a-2f6b8f0c9e11",
  "email": "ada@example.com",
  "phoneNumber": null,
  "balances": [
    { "currency": "cNGN", "amount": "0.000000" },
    { "currency": "cGHS", "amount": "0.000000" },
    { "currency": "cXAF", "amount": "0.000000" },
    { "currency": "USDx", "amount": "0.000000" },
    { "currency": "EURx", "amount": "0.000000" }
  ],
  "totalUsd": "0.000000",
  "createdAt": "2026-10-29T10:00:00.000Z",
  "session": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "accessTokenExpiresAt": "2026-10-29T10:15:00.000Z",
    "refreshToken": "q9X2...",
    "refreshTokenExpiresAt": "2026-11-28T10:00:00.000Z"
  }
}
```

Errors: `400`, `409`.

### API-003 Balances

`GET /api/v1/wallets/{walletId}/balances` → `200`:

```json
{
  "walletId": "0192f5c2-...",
  "balances": [
    { "currency": "cNGN", "amount": "50000.000000", "usdValue": "37.140000" },
    { "currency": "USDx", "amount": "10.000000", "usdValue": "10.000000" }
  ],
  "totalUsd": "47.140000",
  "rates": {
    "source": "exchangerate-api",
    "isStale": false,
    "asOf": "2026-10-29T00:02:31Z"
  }
}
```

(All five currencies are always listed; shortened here.) If no rate is usable, `usdValue`
and `totalUsd` are `null` and `rates.unavailableReason` says why.

### API-004 Deposit

```http
POST /api/v1/wallets/{walletId}/deposits
Idempotency-Key: dep-7f3a9c21

{ "currency": "cNGN", "amount": "50000" }
```

`201`: the transaction (shape below) plus `balance` after the deposit.

### API-005 Swap

```http
POST /api/v1/wallets/{walletId}/swaps
Idempotency-Key: swp-1c88e0d2

{ "fromCurrency": "cNGN", "toCurrency": "USDx", "amount": "10000" }
```

`201`:

```json
{
  "transactionId": "0192f5c9-...",
  "type": "SWAP",
  "status": "COMPLETED",
  "fromWalletId": "0192f5c2-...",
  "toWalletId": "0192f5c2-...",
  "fromCurrency": "cNGN",
  "fromAmount": "10000.000000",
  "toCurrency": "USDx",
  "toAmount": "7.428000",
  "rate": "0.0007428000",
  "rateSource": "exchangerate-api",
  "rateAsOf": "2026-10-29T00:02:31Z",
  "createdAt": "2026-10-29T10:05:00.000Z"
}
```

(Numbers are illustrative.) Errors: `400`, `404`, `422`, `503`.

### API-006 Transfer

```http
POST /api/v1/transfers
Idempotency-Key: trf-90ab55e1

{
  "fromWalletId": "0192f5c2-...",
  "toWalletId": "0192f5d0-...",
  "fromCurrency": "USDx",
  "toCurrency": "cGHS",
  "amount": "20"
}
```

`201`: the transaction with `type: "TRANSFER"`. Same-currency transfers have `rate: "1"`.
Errors: `400`, `404`, `422`, `503`.

### API-007 History

`GET /api/v1/wallets/{walletId}/transactions?page=1&limit=20&type=SWAP,TRANSFER&currency=cGHS`

```json
{
  "items": [{ "...transaction fields...": "", "direction": "IN" }],
  "page": 1,
  "limit": 20,
  "total": 3
}
```

`direction`: `IN` (deposit, transfer received), `OUT` (transfer sent), `INTERNAL` (swap).
Newest first. `currency` matches `fromCurrency` or `toCurrency`.

### API-008 Transaction by ID

`GET /api/v1/transactions/{transactionId}` → `200` transaction, `404` if unknown.

### API-009 Rates

`GET /api/v1/fx/rates` → `200`:

```json
{
  "base": "USDx",
  "source": "exchangerate-api",
  "isStale": false,
  "providerUpdatedAt": "2026-10-29T00:02:31Z",
  "fetchedAt": "2026-10-29T09:00:03Z",
  "pairs": [
    {
      "from": "USDx",
      "to": "cNGN",
      "rate": "1346.2368880000",
      "refreshedAt": "2026-10-29T00:02:31Z"
    },
    {
      "from": "cNGN",
      "to": "USDx",
      "rate": "0.0007428000",
      "refreshedAt": "2026-10-29T00:02:31Z"
    }
  ],
  "attribution": "Rates by Exchange Rate API (https://www.exchangerate-api.com)"
}
```

20 pairs in all (shortened). `refreshedAt` is the provider's update time. `isStale` is `true`
once that is more than 26 hours ago; swaps and transfers are then refused.

### API-013 Log in

```http
POST /api/v1/auth/login

{ "email": "ada@example.com", "password": "correct horse battery staple" }
```

`200`: the `session` object above plus `walletId`. `401` for any failure (same message).

### API-014 Refresh

`POST /api/v1/auth/refresh` with `{ "refreshToken": "..." }` → `200` new `session`. A used
or expired token → `401`; a reused token also revokes the session.

### API-017 Create wallet key

```http
POST /api/v1/wallets/{walletId}/keys
Authorization: Bearer eyJ...

{ "name": "payroll-script" }
```

`201`:

```json
{
  "keyId": "k_3f9a1c",
  "name": "payroll-script",
  "key": "bwk_k_3f9a1c_Vb7...",
  "createdAt": "2026-10-29T10:20:00.000Z"
}
```

`key` is shown only in this answer.

## OpenAPI strategy

- Generated by `@nestjs/swagger` decorators on controllers and DTOs; no hand-written spec.
- Swagger UI at `/docs`, JSON at `/docs-json`.
- `yarn openapi` writes `docs/openapi.json`; a test regenerates it in memory and fails if the
  committed file differs.
- Security schemes `bearer` (JWT) and `walletKey` (`X-Wallet-Key`) are declared; each
  operation lists which it accepts.
- Each operation documents its error statuses with the shared error schema and the
  `Idempotency-Key` header where required.
