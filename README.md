# Borderless

Borderless is the backend for a stablecoin cross-border payment sandbox. It is a REST API
for multi-currency wallets that hold five mock stablecoins (cNGN, cGHS, cXAF, USDx and
EURx). A client can create a wallet, deposit, swap between stablecoins at FX rates, send
money to another wallet, and read balances, history and rates. There is no frontend.

This repository currently holds the project plan and design. Setup, run and test
instructions are added with the code.

## Planned stack

| Area | Choice |
| --- | --- |
| Language | Node.js 24 LTS, TypeScript in strict mode |
| Framework | NestJS 11 |
| Database | PostgreSQL 17 (why: [database design](docs/database-design.md#why-postgresql)) |
| Data access | TypeORM with hand-checked migrations |
| FX rates | ExchangeRate-API (primary) and Currency API (secondary), daily; stale rates refused |
| Auth | Account sessions (argon2id passwords, ES256 JWT with rotating refresh tokens) and per-wallet API keys |
| Encryption | HTTPS via a Caddy proxy with HSTS; AES-256-GCM for email and phone at rest; optional database TLS |
| Tests | Jest and Supertest, against a real PostgreSQL started by Testcontainers |
| Tooling | Yarn 4, ESLint, Prettier |
| Runtime | Docker and docker compose |

## Documents

| Document | What it covers |
| --- | --- |
| [Project statement](docs/project-statement.md) | The problem, scope, risks and success criteria |
| [PRD](docs/prd.md) | Actors, journeys, user stories and priorities |
| [FRD](docs/frd.md) | Each functional requirement with flows and acceptance criteria |
| [Non-functional requirements](docs/non-functional-requirements.md) | Stack, quality, security and operations requirements |
| [Architecture](docs/architecture.md) | Modules, request flow, diagrams and repository layout |
| [API specification](docs/api-specification.md) | Endpoints, request and response shapes, error format |
| [Database design](docs/database-design.md) | Tables, constraints, indexes and migrations |
| [Authentication](docs/authentication.md) | Accounts, sessions, wallet keys and who may call what |
| [Money, idempotency, concurrency and FX](docs/money-handling.md) | Precision, rounding, locking, retries and rate failures |
| [Security review](docs/security-review.md) | Threat model and the controls planned for each threat |
| [Test strategy](docs/test-strategy.md) | Unit, integration, API, concurrency and contract tests |
| [Requirements traceability](docs/requirements-traceability.md) | Brief → requirement → component → test → evidence |
| [Delivery plan](docs/plan.md) | The 48-hour schedule, assumptions, risks and open decisions |
| [Pre-launch checklist](docs/checklists/pre-launch-checklist.md) | Every check, marked mandatory, recommended or not applicable |
| [Decisions](docs/decisions/) | Architecture decision records |
