# Delivery Plan

## Mandatory versus recommended

| Mandatory (brief) | Recommended (ours) |
| --- | --- |
| Wallets, unique identifiers, balances, USD total | Ledger lines and append-only triggers |
| Deposits, swaps, transfers with conversion | Health and readiness checks |
| Live FX with fallback; no negative balances; no double processing | Structured logs with request IDs |
| History with paging and filters; transaction by ID; rates with refresh times | Rate limiting, `helmet`, size limits |
| | Accounts, sessions and wallet keys (not required by the brief) |
| Node LTS, TS strict, NestJS, SQL DB, Jest + Supertest, Yarn, ESLint, Prettier | GitHub Actions CI |
| Docker compose one command; migrations automatic | OpenAPI drift test |
| `yarn test` passes; OpenAPI committed; README items; public repo | Quote and lookup endpoints (Could) |

## Schedule (hours from receiving the brief)

| Hours | Work | Done when | Risk if late |
| --- | --- | --- | --- |
| 0–3 | Read brief, requirements, design docs, this plan; create repo | Docs pushed; plan approved | Everything shifts |
| 3–6 | Scaffold NestJS, Yarn 4, ESLint, Prettier, strict TS, Docker, compose, config validation, error filter, logging, Testcontainers harness, CI | `docker compose up` serves `/health`; empty test suite passes in Docker and CI | Tests and Docker found broken late |
| 6–9 | Migrations (all tables, checks, triggers); money helpers with unit tests; currencies | Migrations up/down; TC-010 unit parts pass | Schema rework later |
| 9–15 | Accounts and wallets: create with password, login, lockout, JWT guard, refresh rotation, logout, ownership check | TC-001–006, TC-047–052, TC-055, TC-058 pass | Every later route depends on the guard |
| 15–17 | Wallet keys | TC-053, TC-054 pass | — |
| 17–21 | FX: two adapters, validation, retries, snapshot store, 26 h rule, refresh schedule, `GET /fx/rates`, USD totals | TC-007, 008, 015–018, 034 pass | Swaps blocked |
| 21–26 | Ledger service, idempotency, deposits, swaps | TC-009–014, 019–024 pass | Core money missing |
| 26–29 | Transfers | TC-025–028, 035, 036 pass | — |
| 29–32 | History, transaction by ID, paging, filters | TC-029–033 pass | — |
| 32–37 | Concurrency, ledger, auth, security and contract tests; fix defects | TC-020, 023, 027, 035, 037–046, 056, 057, 059 pass | Hidden race or access bugs |
| 37–41 | Swagger polish (both auth schemes), `docs/openapi.json`, README (every brief item), update docs and traceability | README covers every item on brief p.3 | Deliverable gap |
| 41–45 | Clean-checkout run, `yarn npm audit`, secret scan, provider terms re-read, final report | No mandatory item without passing evidence | Submission blocked |
| 45–48 | Buffer; confirm repo public; draft submission email | Email drafted for the candidate to send | Missed deadline |

Auth adds about 8 hours; it comes out of the could-have items. Could-have items (quote,
lookup, seed script, Postman) only start once hours 32–37 are green.

## Assumptions

| ID | Assumption | Why |
| --- | --- | --- |
| A-01 | Auth is added although the brief doesn't require it: account sessions and wallet keys, owner-only wallet routes. | Candidate's choice; see authentication.md |
| A-02 | A wallet needs an email or a phone number; both may be given; each is unique on its own. | Brief says "email address or a mobile number" |
| A-03 | Each stablecoin is worth 1 unit of its fiat currency; FX comes from fiat rates. | Mock stablecoins |
| A-04 | All five stablecoins use 6 decimal places. | Typical token precision; keeps small conversions meaningful |
| A-05 | Per-operation cap of 1,000,000,000 units; no daily limits. | Guards against overflow and silly values |
| A-06 | No fees or spreads; converted amounts round down. | Brief names none; rounding down never creates money |
| A-07 | Deposits are instant and always succeed (no pending states). | Brief: "updates immediately" |
| A-08 | "Real-time balances" means balances read from the database at request time. | Brief p.2 |
| A-09 | "Never process the same request twice" is enforced with an `Idempotency-Key` header. | Standard practice; key required on all money writes |
| A-10 | Transfers to the same wallet are refused; swaps cover that case. | Clear history |
| A-11 | Daily reference rates are acceptable as "current" rates for a sandbox. | Free providers only update daily |
| A-12 | Phone numbers without a country code are read as Nigerian (+234). | Target market; configurable |

## Risks and dependencies

| Risk | Likelihood | Response |
| --- | --- | --- |
| Both free FX sources down for over 2 h past a publication | Low | Swaps and transfers return 503 (by design); `FX_FIXED_TABLE` for offline demos |
| Primary blocks us for calling too often | Low | Call about once a day, after its published next-update time |
| Testcontainers fails on reviewer's machine (no Docker) | Medium | README says Docker is required; also `docker compose run --rm test` |
| Yarn 4 / Corepack friction | Low | `packageManager` pinned; Dockerfile enables Corepack |
| Scope creep | Medium | Could-haves gated on green tests |
| GitHub Actions unavailable | Low | Tests run locally and in Docker; CI is a Should |

Dependencies: Docker, internet for live rates (optional), GitHub.

## Decisions to approve before coding

| ID | Decision | Recommendation |
| --- | --- | --- |
| D-01 | Framework and test runner | NestJS 11 + Jest (CommonJS) — mature, Jest is native, least setup risk |
| D-02 | Database and data access | PostgreSQL 17 + TypeORM with hand-checked migrations (see database-design.md) |
| D-03 | FX freshness | Daily-reference standard: rates usable up to 26 h after publication, then swaps and transfers refused (503); secondary live source as fallback |
| D-04 | Idempotency key required on deposits, swaps and transfers | Yes, required (`400` if missing) |
| D-05 | Precision | 6 decimals for every stablecoin, `bigint` minor units |
| D-06 | Response shape | Plain resources (no envelope); shared error body |
| D-07 | `yarn test` needs Docker (Testcontainers) | Yes |
| D-08 | FX providers | ExchangeRate-API open endpoint (primary), Currency API by fawazahmed0 (secondary), no keys |
| D-09 | Could-haves (quote, lookup) | Only after mandatory items are green |
| D-10 | Commit style | Conventional commits, small and frequent |
| D-11 | Auth | Account sessions (argon2id, 15-min JWT, rotating refresh) plus wallet keys; owner-only routes |
| D-12 | Account vs wallet | One account per identifier, one wallet per account, created together by `POST /wallets` |

## Submission

Deliverable: the public repo link, sent by email with the candidate's full name. The email
is drafted for the candidate; it is not sent for them.
