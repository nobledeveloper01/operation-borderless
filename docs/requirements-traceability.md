# Requirements Traceability

Brief → requirement → component/API → test → evidence → status. Status is
`PLANNED` until a test passes; then `PASS` with the run as evidence.

## Functional (brief p.2–3)

| Brief | Req | Component / API | Tests | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| Wallets: create with email or mobile | FR-001 | `wallets` / API-001 | TC-001–003 | — | PLANNED |
| Wallets: same email or number can't create two | FR-002 | `wallets`, unique indexes / API-001 | TC-004, TC-005 | — | PLANNED |
| Wallets: balance per stablecoin | FR-003 | `balances` table / API-001–003 | TC-001, TC-006 | — | PLANNED |
| Wallets: all balances + USD total | FR-004 | `wallets`, `fx` / API-002, API-003 | TC-007, TC-008 | — | PLANNED |
| Deposits: currency + amount, immediate, record | FR-005 | `deposits`, `ledger` / API-004 | TC-009–011 | — | PLANNED |
| Swaps: within one wallet using FX | FR-006 | `swaps`, `ledger`, `fx` / API-005 | TC-012–014 | — | PLANNED |
| Swaps: live rates preferred, fallback | FR-007 | `fx` / API-009 | TC-015–018 | — | PLANNED |
| Swaps: reject negative balance | FR-008 | `ledger`, DB check / API-005 | TC-019, TC-020 | — | PLANNED |
| Swaps: never process twice | FR-009 | `idempotency` / API-004–006 | TC-021–024 | — | PLANNED |
| Transfers: between wallets, same or other currency | FR-010 | `transfers`, `ledger` / API-006 | TC-025–027 | — | PLANNED |
| Transfers: auto convert at current rate | FR-011 | `fx`, `transfers` / API-006 | TC-028 | — | PLANNED |
| Transfers: record all fields | FR-012 | `transactions` table / API-008 | TC-029 | — | PLANNED |
| History: all types, newest first | FR-013 | `transactions` / API-007 | TC-030 | — | PLANNED |
| History: pagination, filter type and currency | FR-014 | `transactions` / API-007 | TC-031, TC-032 | — | PLANNED |
| History: single transaction by id | FR-015 | `transactions` / API-008 | TC-029, TC-033 | — | PLANNED |
| Rates: all pairs with refresh time | FR-016 | `fx` / API-009 | TC-034 | — | PLANNED |
| (inferred) transfers refuse overdraft | FR-017 | `ledger` | TC-026, TC-035 | — | PLANNED |
| (inferred) deposits and transfers idempotent | FR-018 | `idempotency` | TC-011, TC-036 | — | PLANNED |

## Stack and deliverables (brief p.1–3)

| Brief | Req | How it is met | Evidence | Status |
| --- | --- | --- | --- | --- |
| Node LTS + TS strict | NFR-001 | Node 24, `tsconfig` strict | `yarn typecheck` | PLANNED |
| Express or NestJS | NFR-002 | NestJS 11 | `package.json` | PLANNED |
| Database + justification | NFR-003 | PostgreSQL 17, database-design.md, README section | README | PLANNED |
| Cache/queue only if earned | NFR-004 | None used, architecture.md | README | PLANNED |
| Jest/Vitest + Supertest | NFR-005 | Jest + Supertest | `test/api` | PLANNED |
| Yarn, ESLint, Prettier | NFR-006 | Yarn 4, config files | `yarn lint`, `yarn format:check` | PLANNED |
| Docker compose one command | NFR-007, DEL-003 | `docker compose up` runs db, migrations, api | Clean-checkout run | PLANNED |
| Public repo in 48 h | DEL-001 | `nobledeveloper01/operation-borderless` | Repo URL, visibility | PLANNED |
| Clear commit history, conventional commits | DEL-002 | Conventional commit messages | `git log` | PLANNED |
| `yarn test` passes | DEL-004, NFR-052 | Full suite | Test run output | PLANNED |
| OpenAPI or Postman committed | DEL-005 | `docs/openapi.json`, `/docs` | TC-039 | PLANNED |
| README: name, stack, DB why, run, tests, endpoints with examples, data model, precision, idempotency, concurrency, FX failures, assumptions, limitations, more time | DEL-006 | README sections, one per item | README review | PLANNED |
| Say what was left out and why | DEL-007 | README "Left out" | README review | PLANNED |

## Non-functional (recommended)

| Req | Component | Tests | Status |
| --- | --- | --- | --- |
| NFR-010 integer money | `common/money` | TC-010, TC-012 | PLANNED |
| NFR-011 one transaction per operation | `ledger` | TC-014 | PLANNED |
| NFR-012 no races | `ledger` | TC-020, TC-027, TC-035 | PLANNED |
| NFR-013 append-only | migration triggers | TC-038 | PLANNED |
| NFR-014 ledger matches balances | `ledger` | TC-037 | PLANNED |
| NFR-020/021 FX timeouts, retries, no request-time calls | `fx` | TC-015, TC-018 | PLANNED |
| NFR-040 logs with request ID | `common` | TC-044 | PLANNED |
| NFR-042 health | `health` | TC-046 | PLANNED |
| NFR-054 OpenAPI drift | `test/api` | TC-039 | PLANNED |
