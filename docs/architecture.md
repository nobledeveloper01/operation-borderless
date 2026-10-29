# Architecture

## Shape

A NestJS modular monolith with one PostgreSQL database. One app keeps a whole money
movement inside one database transaction; separate services would put network calls between
the steps. No cache or queue: PostgreSQL row locks and unique constraints give the guarantees
we need, the FX snapshot lives in the database, and the two background jobs (rate refresh,
key cleanup) run in-process with `@nestjs/schedule`. The brief allows Redis or a queue only
where it earns its place; here it would add a second source of truth for rates and nothing
to process.

## System context

```mermaid
flowchart LR
  client[API client] -->|HTTPS JSON| api[Borderless API<br/>NestJS]
  api -->|SQL| db[(PostgreSQL 17)]
  api -->|HTTPS, every 60 min| fx[ExchangeRate-API<br/>open.er-api.com]
  reviewer[Reviewer] -->|Swagger UI /docs| api
```

Trust boundaries: the client is untrusted (no auth, all input validated); the FX provider is
untrusted (every response validated before use); the database is trusted.

## Modules

| Module | Responsibility |
| --- | --- |
| `config` | Loads and validates environment variables at startup. |
| `database` | TypeORM data source, migrations, `runInTransaction` helper, naming strategy. |
| `common` | Error filter and error codes, request ID middleware, validation pipe, money helpers (`Money`, parse/format), pagination DTOs. |
| `currencies` | The five supported stablecoins, their fiat pegs and decimals. Pure code, no table. |
| `fx` | `FxProvider` interface, ExchangeRate-API adapter, fallback table, snapshot store, refresh scheduler, `FxService.rate(from, to)`, `GET /fx/rates`. |
| `wallets` | Create and read wallets and balances, USD total. |
| `ledger` | `LedgerService`: the only code that changes balances. Locks rows, checks funds, writes transaction + ledger lines. |
| `deposits`, `swaps`, `transfers` | Thin controllers and services that validate, price, and call `LedgerService` inside an idempotent transaction. |
| `transactions` | History list with filters and pagination, transaction by ID. |
| `idempotency` | Claim, replay and conflict logic on `idempotency_keys`; cleanup job. |
| `health` | Liveness and readiness. |

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
  t[Startup and every 60 min] --> f[Fetch provider, 3 s timeout, 2 retries]
  f -->|valid| s[Store snapshot: rates, source, providerUpdatedAt, fetchedAt]
  f -->|fails| k[Keep previous snapshot, log reason]
  r[Request needs a rate] --> q{Live snapshot younger than FX_MAX_AGE_HOURS?}
  q -->|yes| u[Use it]
  q -->|no| fb[Use fixed fallback table, marked isFallback]
```

## Request lifecycle

1. `helmet`, body size limit, request ID middleware (accepts a safe incoming
   `X-Request-Id` or makes one).
2. Throttler guard (per IP).
3. Validation pipe: `whitelist`, `forbidNonWhitelisted`, `transform`.
4. Controller → service → `LedgerService` / repositories.
5. Global error filter maps known errors to codes; anything else becomes a generic `500`
   with the request ID, and the real error is logged.

## Error handling

- Domain errors are `AppError(code, message, details?)`; the code decides the status
  ([api-specification.md](api-specification.md#errors)).
- PostgreSQL errors: `23505` unique → `409` where expected (wallet identifiers), `23514`
  check violation → `422 INSUFFICIENT_FUNDS` (last guard), lock or statement timeout → `503`.
- Database text never reaches the client.

## Deployment topology

`docker compose up` starts two services:

| Service | Image | Notes |
| --- | --- | --- |
| `db` | `postgres:17-alpine` | Health check `pg_isready`; data in a named volume. |
| `api` | Built from `Dockerfile` (Node 24, multi-stage, non-root) | Waits for `db` healthy, runs migrations, then starts. Port 3000. |

## Repository layout (planned)

```
operation-borderless/
├── src/
│   ├── main.ts, app.module.ts, app.setup.ts
│   ├── config/  database/  common/  currencies/
│   ├── fx/  wallets/  ledger/  idempotency/
│   ├── deposits/  swaps/  transfers/  transactions/  health/
│   └── migrations/
├── test/
│   ├── unit/            pure functions and services with fakes
│   ├── integration/     services against real PostgreSQL
│   ├── api/             Supertest through the full Nest app
│   └── support/         Testcontainers setup, factories, fake FX provider
├── docs/                these documents, plus openapi.json
├── Dockerfile, docker-compose.yml, .env.example
├── .github/workflows/ci.yml
└── package.json, yarn.lock, tsconfig.json, eslint and prettier config
```

## Trade-offs

| Choice | Gain | Cost |
| --- | --- | --- |
| Pessimistic row locks | Simple, provably correct, no retry loops | Hot wallets serialise; fine for a sandbox |
| FX read from stored snapshot | Requests never hang on the provider | Rates can be up to 60 min behind the provider (which updates daily anyway) |
| No auth | Matches the brief | Anyone with a wallet ID can move its money (documented) |
| Offset pagination | Simple, gives `total` | Slower on deep pages; cursor noted as future work |
