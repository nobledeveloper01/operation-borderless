# Delivery Plan

## Mandatory versus recommended

| Mandatory (brief) | Recommended (ours) |
| --- | --- |
| Wallets, unique identifiers, balances, USD total | Ledger lines and append-only triggers |
| Deposits, swaps, transfers with conversion | Health and readiness checks |
| Live FX with fallback; no negative balances; no double processing | Structured logs with request IDs |
| History with paging and filters; transaction by ID; rates with refresh times | Rate limiting, `helmet`, size limits |
| Node LTS, TS strict, NestJS, SQL DB, Jest + Supertest, Yarn, ESLint, Prettier | GitHub Actions CI |
| Docker compose one command; migrations automatic | OpenAPI drift test |
| `yarn test` passes; OpenAPI committed; README items; public repo | Quote and lookup endpoints (Could) |

## Schedule (hours from receiving the brief)

| Hours | Work | Done when | Risk if late |
| --- | --- | --- | --- |
| 0–3 | Read brief, requirements, design docs, this plan; create repo | Docs pushed; plan approved | Everything shifts |
| 3–6 | Scaffold NestJS, Yarn 4, ESLint, Prettier, strict TS, Docker, compose, config validation, error filter, logging, Testcontainers harness, CI | `docker compose up` serves `/health`; empty test suite passes in Docker and CI | Tests and Docker found broken late |
| 6–10 | Migrations (all tables, checks, triggers); money helpers with unit tests; currencies | Migrations up/down; TC-010 unit parts pass | Schema rework later |
| 10–14 | Wallets (create, read, balances) | TC-001–006 pass | — |
| 14–18 | FX: adapter, validation, retries, snapshot store, fallback, refresh job, `GET /fx/rates`, USD totals | TC-007, 008, 015–018, 034 pass | Swaps blocked |
| 18–24 | Ledger service, idempotency, deposits, swaps | TC-009–014, 019–024 pass | Core money missing |
| 24–28 | Transfers | TC-025–028, 035, 036 pass | — |
| 28–32 | History, transaction by ID, paging, filters | TC-029–033 pass | — |
| 32–36 | Concurrency, ledger, security and contract tests; fix defects | TC-020, 023, 027, 035, 037–046 pass | Hidden race bugs |
| 36–41 | Swagger polish, `docs/openapi.json`, README (every brief item), update docs and traceability | README checklist complete | Deliverable gap |
| 41–45 | Clean-checkout run, `yarn npm audit`, secret scan, provider terms re-read, final report | No mandatory item without passing evidence | Submission blocked |
| 45–48 | Buffer; confirm repo public; draft submission email | Email drafted for the candidate to send | Missed deadline |

Could-have items (quote, lookup, seed script, Postman) only start once hours 32–36 are green.

## Assumptions

| ID | Assumption | Why |
| --- | --- | --- |
| A-01 | No authentication; any client can act on any wallet by ID. | Brief p.2 |
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
| ExchangeRate-API open endpoint down or terms forbid use | Low | Fallback table; adapter interface lets us switch to the key plan or another provider |
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
| D-03 | Money operations when only fallback rates exist | Allow, marked `fallback-table` on the transaction and in responses |
| D-04 | Idempotency key required on deposits, swaps and transfers | Yes, required (`400` if missing) |
| D-05 | Precision | 6 decimals for every stablecoin, `bigint` minor units |
| D-06 | Response shape | Plain resources (no envelope); shared error body |
| D-07 | `yarn test` needs Docker (Testcontainers) | Yes |
| D-08 | FX provider | ExchangeRate-API open endpoint, no key |
| D-09 | Could-haves (quote, lookup) | Only after mandatory items are green |
| D-10 | Commit style | Conventional commits, small and frequent |

## Submission

Deliverable: the public repo link, sent by email with the candidate's full name. The email
is drafted for the candidate; it is not sent for them.
