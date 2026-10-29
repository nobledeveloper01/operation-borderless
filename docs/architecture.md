# Architecture

## Shape

A NestJS modular monolith with one PostgreSQL database. One app keeps a whole money
movement inside one database transaction; separate services would put network calls between
the steps. No cache or queue: PostgreSQL row locks and unique constraints give the guarantees
the design needs, the FX snapshot lives in the database, and the two background jobs (rate refresh,
key cleanup) run in-process with `@nestjs/schedule`. The brief allows Redis or a queue only
where it earns its place; here it would add a second source of truth for rates and nothing
to process ([ADR-001](decisions/ADR-001-modular-monolith.md),
[ADR-005](decisions/ADR-005-no-redis.md)).

## System context

```mermaid
flowchart LR
  client[API client] -->|HTTPS JSON| proxy[Caddy TLS proxy] --> api[Borderless API<br/>NestJS]
  api -->|SQL| db[(PostgreSQL 17)]
  api -->|HTTPS, after each daily update| fx[ExchangeRate-API<br/>primary]
  api -.->|HTTPS, if primary fails| fx2[Currency API<br/>secondary]
  reviewer[Reviewer] -->|Swagger UI /docs| api
```

Trust boundaries: the client is untrusted (authenticated, but all input validated and
ownership checked); the FX provider is
untrusted (every response validated before use); the database is trusted.

## Modules

| Module                           | Responsibility                                                                                                                                                                                                                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `config`                         | Loads and validates environment variables at startup.                                                                                                                                                                                                                                                                                      |
| `database`                       | TypeORM data source, migrations, `runInTransaction` helper, naming strategy.                                                                                                                                                                                                                                                               |
| `common`                         | Shared handlers written once: `AllExceptionsFilter` (every error), `SuccessInterceptor` + `@ResponseMessage()` (every success), `@ApiEndpoint()` (status, message and Swagger contract per route), request ID and no-store middlewares, `AppError` and error codes, money helpers (`parseAmount`, `formatAmount`, `crossRate`, `convert`). |
| `currencies`                     | The five supported stablecoins, their fiat pegs and decimals. Pure code, no table.                                                                                                                                                                                                                                                         |
| `fx`                             | `FxProvider` interface, primary and secondary adapters, snapshot store, refresh scheduler, `FxService.rate(from, to)`, `GET /fx/rates`.                                                                                                                                                                                                    |
| `crypto`                         | AES-256-GCM field encryption with key versions, HMAC blind index, key loading and checks.                                                                                                                                                                                                                                                  |
| `auth`                           | Accounts, argon2id passwords, login, ES256 JWT access tokens, refresh rotation, logout, wallet keys, the auth guard and the ownership check.                                                                                                                                                                                               |
| `wallets`                        | Create and read wallets and balances, USD total.                                                                                                                                                                                                                                                                                           |
| `ledger`                         | `LedgerService`: the only code that changes balances. Locks rows, checks funds, writes transaction + ledger lines.                                                                                                                                                                                                                         |
| `deposits`, `swaps`, `transfers` | Thin controllers and services that validate, price, and call `LedgerService` inside an idempotent transaction.                                                                                                                                                                                                                             |
| `transactions`                   | History list with filters and pagination, transaction by ID.                                                                                                                                                                                                                                                                               |
| `idempotency`                    | Claim, replay and conflict logic on `idempotency_keys`; cleanup job.                                                                                                                                                                                                                                                                       |
| `health`                         | Liveness and readiness.                                                                                                                                                                                                                                                                                                                    |

Deposits, swaps and transfers may later merge into one `payments` module if the code is
small; the boundaries above stay the same.

## Money write flow (swap)

```mermaid
sequenceDiagram
  participant C as Client
  participant S as SwapsController/Service
  participant F as FxService
  participant I as Idempotency
  participant L as LedgerService
  participant D as PostgreSQL
  C->>S: POST /wallets/{id}/swaps + Idempotency-Key
  S->>F: rate(cNGN, USDx) (stored snapshot, no network)
  S->>D: BEGIN
  S->>I: claim(key, requestHash)
  I->>D: INSERT ... ON CONFLICT DO NOTHING
  alt key already done
    I->>D: SELECT stored response
    S-->>C: stored status + body, Idempotent-Replayed: true
  else new key
    S->>L: swap(...)
    L->>D: SELECT balances ... FOR UPDATE (ordered)
    L->>D: UPDATE balances, INSERT transaction, INSERT ledger lines
    S->>I: save response
    S->>D: COMMIT
    S-->>C: 201 transaction
  end
```

If anything throws, the transaction rolls back, including the key claim, so a retry can run
again. A parallel request with the same key blocks on the unique index until the first
commits, then replays it.

## FX refresh flow

```mermaid
flowchart TD
  t[Startup, then 5 min after the provider's next update] --> p[Fetch primary, 3 s timeout, 2 retries]
  p -->|valid| s[Store snapshot: rates, source, providerUpdatedAt, fetchedAt]
  p -->|fails or data older than 26 h| sec[Fetch secondary]
  sec -->|valid| s
  sec -->|fails| k[Keep previous snapshot, retry in 15 min]
  r[Swap or transfer needs a rate] --> q{Newest snapshot's provider data at most 26 h old?}
  q -->|yes| u[Use it]
  q -->|no| no[503 FX_RATE_UNAVAILABLE, nothing moves]
```

## Request lifecycle

1. Request ID middleware (keeps a safe incoming `X-Request-Id` or makes one), then
   `Cache-Control: no-store`, the 16 KB JSON body limit and `helmet`.
2. Throttler guard (per IP).
3. Auth guard: verifies the JWT (pinned algorithm, `iss`, `aud`, `exp`) and that its session
   isn't revoked, or checks the wallet key; public routes are marked `@Public()`. Services
   then check the caller owns the wallet.
4. Validation pipe: `whitelist`, `forbidNonWhitelisted`, `transform`.
5. Controller → service → `LedgerService` / repositories. The controller returns plain data;
   `SuccessInterceptor` wraps it in the envelope.
6. Global error filter maps known errors to codes; anything else becomes a generic `500`
   with the request ID, and the real error is logged.

## Error handling

- Domain errors are `AppError(code, message, details?)`; the code decides the status
  ([api-specification.md](api-specification.md#errors)).
- PostgreSQL errors: `23505` unique → `409` where expected (wallet identifiers), `23514`
  check violation → `422 INSUFFICIENT_FUNDS` (last guard), lock or statement timeout → `503`.
- Database text never reaches the client.

## Deployment topology

`docker compose up` starts three services:

| Service | Image                                                    | Notes                                                                                                                                                            |
| ------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `proxy` | `caddy:2-alpine`                                         | The only published ports: 443 (HTTPS) and 80 (redirects to 443). TLS 1.2+, internal CA locally, HSTS header. Forwards to `api:3000`.                             |
| `db`    | `postgres:17-alpine`                                     | Not published. Health check `pg_isready`; data in a named volume.                                                                                                |
| `api`   | Built from `Dockerfile` (Node 24, multi-stage, non-root) | Not published. Waits for `db` healthy, makes dev keys if missing (development only), runs migrations, then starts. Trusts `X-Forwarded-For` only from the proxy. |

```mermaid
flowchart LR
  c[Client] -->|HTTPS 443| p[Caddy]
  p -->|HTTP, private network| a[API]
  a -->|SQL, TLS optional locally| d[(PostgreSQL)]
```

Tests don't go through Caddy: they start the Nest app in-process with Supertest.

## Repository layout

Each feature is a Nest module under `src/modules/`. Code that several modules share lives
under `src/common/`, and nothing in `common/` holds a feature's business rules.

```
operation-borderless/
├── src/
│   ├── main.ts, app.module.ts, app.setup.ts
│   ├── common/
│   │   ├── config/        settings checked at startup, the clock
│   │   ├── database/      connection options, CLI data source, naming
│   │   ├── crypto/        field encryption for email and phone
│   │   ├── currencies/    the five stablecoins
│   │   ├── errors/        error codes, AppError, the exception filter
│   │   ├── responses/     the success envelope and the ApiEndpoint decorator
│   │   ├── middleware/    request ID, no-store, body errors
│   │   ├── http/          logging, outbound fetch, rate-limit groups
│   │   ├── money/         amounts, rates, conversion
│   │   └── validation/    amount and ID fields
│   ├── modules/
│   │   ├── accounts/  auth/  wallets/
│   │   ├── deposits/  swaps/  transfers/  transactions/
│   │   └── ledger/  idempotency/  fx/  health/
│   └── migrations/
├── test/
│   ├── unit/            mirrors src/: common/ and modules/
│   ├── integration/     schema and services against real PostgreSQL
│   ├── api/             Supertest through the full Nest app
│   └── support/         Testcontainers setup, factories, fake FX provider
├── scripts/             TLS smoke check and load test
├── docs/                these documents, plus openapi.json
├── Dockerfile, docker-compose.yml, docker/, .env.example
├── .github/workflows/ci.yml
└── package.json, yarn.lock, tsconfig.json, eslint and prettier config
```

## Trade-offs

| Choice                       | Gain                                     | Cost                                                                              |
| ---------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------- |
| Pessimistic row locks        | Simple, provably correct, no retry loops | Hot wallets serialise; fine for a sandbox                                         |
| FX read from stored snapshot | Requests never hang on a provider        | Rates are daily reference rates, not live market prices                           |
| Fail closed on stale rates   | Money never moves on an old rate         | Swaps and transfers stop if both sources are down for over 2 h past a publication |
| Auth added beyond the brief  | Only owners move money                   | ~8 h of work; reviewers copy a token once                                         |
| Session check per request    | Logout is immediate                      | One indexed read per request                                                      |
| Offset pagination            | Simple, gives `total`                    | Slower on deep pages; cursor noted as future work                                 |
