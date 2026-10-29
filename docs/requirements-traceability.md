# Requirements Traceability

Brief → requirement → component/API → test → evidence → status. Status is
`PLANNED` until a test passes; then `PASS` with the run as evidence.

## Functional (brief p.2–3)

| Brief                                              | Req    | Component / API                     | Tests          | Evidence                                                            | Status |
| -------------------------------------------------- | ------ | ----------------------------------- | -------------- | ------------------------------------------------------------------- | ------ |
| Wallets: create with email or mobile               | FR-001 | `wallets` / API-001                 | TC-001–003     | test/api/accounts-auth.api.spec.ts                                  | PASS   |
| Wallets: same email or number can't create two     | FR-002 | `wallets`, unique indexes / API-001 | TC-004, TC-005 | test/api/accounts-auth.api.spec.ts, test/integration/schema.spec.ts | PASS   |
| Wallets: balance per stablecoin                    | FR-003 | `balances` table / API-001–003      | TC-001, TC-006 | test/api/accounts-auth.api.spec.ts, test/integration/schema.spec.ts | PASS   |
| Wallets: all balances + USD total                  | FR-004 | `wallets`, `fx` / API-002, API-003  | TC-007, TC-008 | test/api/fx.api.spec.ts                                             | PASS   |
| Deposits: currency + amount, immediate, record     | FR-005 | `deposits`, `ledger` / API-004      | TC-009–011     | test/api/money.api.spec.ts                                          | PASS   |
| Swaps: within one wallet using FX                  | FR-006 | `swaps`, `ledger`, `fx` / API-005   | TC-012–014     | test/api/money.api.spec.ts                                          | PASS   |
| Swaps: live rates preferred, fallback              | FR-007 | `fx` / API-009                      | TC-015–018     | test/api/fx.api.spec.ts, test/unit/modules/fx/*                     | PASS   |
| Swaps: reject negative balance                     | FR-008 | `ledger`, DB check / API-005        | TC-019, TC-020 | test/api/money.api.spec.ts                                          | PASS   |
| Swaps: never process twice                         | FR-009 | `idempotency` / API-004–006         | TC-021–024     | test/api/money.api.spec.ts                                          | PASS   |
| Transfers: between wallets, same or other currency | FR-010 | `transfers`, `ledger` / API-006     | TC-025–027     | test/api/transfers.api.spec.ts                                      | PASS   |
| Transfers: auto convert at current rate            | FR-011 | `fx`, `transfers` / API-006         | TC-028         | test/api/transfers.api.spec.ts                                      | PASS   |
| Transfers: record all fields                       | FR-012 | `transactions` table / API-008      | TC-029         | test/api/transfers.api.spec.ts                                      | PASS   |
| History: all types, newest first                   | FR-013 | `transactions` / API-007            | TC-030         | test/api/history.api.spec.ts                                        | PASS   |
| History: pagination, filter type and currency      | FR-014 | `transactions` / API-007            | TC-031, TC-032 | test/api/history.api.spec.ts                                        | PASS   |
| History: single transaction by id                  | FR-015 | `transactions` / API-008            | TC-029, TC-033 | test/api/history.api.spec.ts                                        | PASS   |
| Rates: all pairs with refresh time                 | FR-016 | `fx` / API-009                      | TC-034         | test/api/fx.api.spec.ts                                             | PASS   |
| (inferred) transfers refuse overdraft              | FR-017 | `ledger`                            | TC-026, TC-035 | test/api/transfers.api.spec.ts                                      | PASS   |
| (inferred) deposits and transfers idempotent       | FR-018 | `idempotency`                       | TC-011, TC-036 | test/api/money.api.spec.ts                                          | PASS   |

## Authentication (beyond the brief)

| Req                            | Component / API           | Tests          | Status                                               |
| ------------------------------ | ------------------------- | -------------- | ---------------------------------------------------- |
| FR-022 login and lockout       | `auth` / API-013          | TC-047–049     | PASS                                                 |
| FR-023 refresh rotation        | `auth` / API-014          | TC-050, TC-051 | PASS                                                 |
| FR-024 logout                  | `auth` / API-015          | TC-052         | PASS                                                 |
| FR-025 wallet keys             | `auth` / API-017–019      | TC-053, TC-054 | PASS                                                 |
| FR-026 ownership               | auth guard + services     | TC-055–057     | PASS                                                 |
| FR-027 token checks            | auth guard                | TC-058         | PASS                                                 |
| FR-019 quotes                  | `quotes` / API-011        | TC-067         | PASS (test/api/quotes.api.spec.ts)                   |
| FR-020 send to email or phone  | `transfers` / API-012     | TC-069         | PASS (test/api/send-to-address.api.spec.ts)          |
| FR-028 conversion fees         | `pricing`, `ledger`       | TC-066         | PASS (test/api/fees.api.spec.ts)                     |
| FR-029 events and notices      | `outbox` / API-022–023    | TC-068         | PASS (test/api/outbox.api.spec.ts)                   |
| FR-030 operator routes         | `ops` / API-020, 021, 024 | TC-065         | PASS (test/api/ops.api.spec.ts)                      |
| BR-13 secrets stored as hashes | `auth`                    | TC-059         | PASS                                                 |
| NFR-060 HTTPS, HSTS            | `proxy` (Caddy)           | TC-060         | PASS (scripts/smoke-tls.sh)                          |
| NFR-061 database TLS           | `database`, `config`      | TC-061         | PASS (config refuses production without verify-full) |
| NFR-062 field encryption       | `crypto`, `auth`          | TC-062, TC-063 | PASS                                                 |
| NFR-063 ES256 with rotation    | `auth`                    | TC-058         | PASS                                                 |

## Stack and deliverables (brief p.1–3)

| Brief                                                                                                                                                               | Req              | How it is met                                     | Evidence                         | Status |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------- | -------------------------------- | ------ |
| Node LTS + TS strict                                                                                                                                                | NFR-001          | Node 24, `tsconfig` strict                        | `yarn typecheck`                 | PASS   |
| Express or NestJS                                                                                                                                                   | NFR-002          | NestJS 12                                         | `package.json`                   | PASS   |
| Database + justification                                                                                                                                            | NFR-003          | PostgreSQL 17, database-design.md, README section | README                           | PASS   |
| Cache/queue only if earned                                                                                                                                          | NFR-004          | None used, architecture.md                        | README                           | PASS   |
| Jest/Vitest + Supertest                                                                                                                                             | NFR-005          | Vitest + Supertest                                | `test/api`                       | PASS   |
| Yarn, ESLint, Prettier                                                                                                                                              | NFR-006          | Yarn 4, config files                              | `yarn lint`, `yarn format:check` | PASS   |
| Docker compose one command                                                                                                                                          | NFR-007, DEL-003 | `docker compose up` runs db, migrations, api      | Clean-checkout run               | PASS   |
| Public repo in 48 h                                                                                                                                                 | DEL-001          | `nobledeveloper01/operation-borderless`           | Repo URL, visibility             | PASS   |
| Clear commit history, conventional commits                                                                                                                          | DEL-002          | Conventional commit messages                      | `git log`                        | PASS   |
| `yarn test` passes                                                                                                                                                  | DEL-004, NFR-052 | Full suite                                        | Test run output                  | PASS   |
| OpenAPI or Postman committed                                                                                                                                        | DEL-005          | `docs/openapi.json`, `/docs`                      | TC-039                           | PASS   |
| README: name, stack, DB why, run, tests, endpoints with examples, data model, precision, idempotency, concurrency, FX failures, assumptions, limitations, more time | DEL-006          | README sections, one per item                     | README review                    | PASS   |
| Say what was left out and why                                                                                                                                       | DEL-007          | README "Left out"                                 | README review                    | PASS   |

## Non-functional (recommended)

| Req                                                     | Component          | Tests                         | Status |
| ------------------------------------------------------- | ------------------ | ----------------------------- | ------ |
| NFR-010 integer money                                   | `common/money`     | TC-010, TC-012                | PASS   |
| NFR-011 one transaction per operation                   | `ledger`           | TC-014                        | PASS   |
| NFR-012 no races                                        | `ledger`           | TC-020, TC-027, TC-035        | PASS   |
| NFR-013 append-only                                     | migration triggers | TC-038                        | PASS   |
| NFR-014 ledger matches balances                         | `ledger`           | TC-037                        | PASS   |
| NFR-020/021 FX timeouts, retries, no request-time calls | `fx`               | TC-015, TC-018                | PASS   |
| NFR-040 logs with request ID                            | `common`           | TC-044                        | PASS   |
| NFR-042 health                                          | `health`           | test/api/platform.api.spec.ts | PASS   |
| NFR-054 OpenAPI drift                                   | `test/api`         | TC-039                        | PASS   |
