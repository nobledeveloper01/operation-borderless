# Non-Functional Requirements

"Mandatory" means the brief states it. "Recommended" means we add it because it is cheap and
protects money correctness or the reviewer's experience. Numbers marked *proposed* are our
own targets; the brief sets none.

## Stack and tooling (brief p.1–2)

| ID | Requirement | Type |
| --- | --- | --- |
| NFR-001 | Node.js LTS with TypeScript, `strict: true` | Mandatory |
| NFR-002 | Express or NestJS (we use NestJS) | Mandatory |
| NFR-003 | SQL or NoSQL database, choice justified in the README | Mandatory |
| NFR-004 | Redis, BullMQ or RabbitMQ only where they earn their place (we use none) | Mandatory |
| NFR-005 | Jest or Vitest plus Supertest (we use Vitest) | Mandatory |
| NFR-006 | Yarn, ESLint, Prettier | Mandatory |
| NFR-007 | Docker and docker compose start the API and its dependencies with one command | Mandatory |
| NFR-008 | No frontend | Mandatory |

## Correctness and data integrity

| ID | Requirement | Type |
| --- | --- | --- |
| NFR-010 | Money is never a float. Integer minor units in the database, BigInt and decimal.js in code. | Mandatory (brief p.3, "correct money handling"; README must explain) |
| NFR-011 | Each money operation is one database transaction: all of it or none of it. | Mandatory (inferred from "never negative", "never twice") |
| NFR-012 | Parallel requests can't overdraw or lose updates. | Mandatory (README must explain concurrency) |
| NFR-013 | Transactions and ledger lines are append-only (database trigger). | Recommended |
| NFR-014 | For every balance, the sum of its ledger lines equals the stored amount. | Recommended (checked in tests) |

## Reliability

| ID | Requirement | Type |
| --- | --- | --- |
| NFR-020 | FX: two live sources; 3 s timeout, at most 2 retries with jitter; refresh after each daily publication; rates older than 26 h never price money. | Mandatory (fallback required) |
| NFR-021 | Requests never wait on the FX provider; they read the stored snapshot. | Recommended |
| NFR-022 | Config is validated at startup; the app refuses to start on bad values. | Recommended |
| NFR-023 | Graceful shutdown closes the HTTP server and database pool. | Recommended |
| NFR-024 | Database statement timeout 5 s and lock timeout 3 s (*proposed*). | Recommended |

## Performance (*proposed*, checked only roughly)

- Reads p95 under 100 ms and money writes p95 under 200 ms on a laptop with 20 parallel
  clients. Not a brief requirement; we report a measurement only if we run one.
- History queries use an index on `(wallet_id, created_at DESC)`; no per-item queries.

## Security

See [security-review.md](security-review.md) and [authentication.md](authentication.md).
Summary: HTTPS through a TLS proxy with HSTS, AES-256-GCM encryption of email and phone at
rest, argon2id passwords, 15-minute ES256 JWTs with rotating refresh tokens, wallet keys stored
as hashes, ownership checks on every wallet route, strict validation with unknown
fields refused, parameterised SQL only, rate limiting, `helmet`, request size limit 16 KB,
no stack traces or SQL text in responses, email and phone redacted from logs, no secrets in
the repo.

## Encryption

| ID | Requirement | Type |
| --- | --- | --- |
| NFR-060 | HTTPS only through the proxy: TLS 1.2+, HTTP → HTTPS, HSTS; API port not published. | Recommended |
| NFR-061 | Database TLS settable; `verify-full` required in production. | Recommended |
| NFR-062 | Email and phone encrypted at rest (AES-256-GCM, versioned keys), unique by HMAC index. | Recommended |
| NFR-063 | Access tokens signed with ES256 and a `kid`; keys rotate without logging users out. | Recommended |
| NFR-064 | No message-level body encryption (JWE) or response signing (JWS) for now. | Decision ([ADR-009](decisions/ADR-009-encryption.md)) |

## Observability

| ID | Requirement | Type |
| --- | --- | --- |
| NFR-040 | Structured JSON logs (pino) with a request ID on every line; `X-Request-Id` returned. | Recommended |
| NFR-041 | FX refresh results logged (success, failure reason, snapshot age). | Recommended |
| NFR-042 | `/health` and `/health/ready`. | Recommended |

## Maintainability and testability

| ID | Requirement | Type |
| --- | --- | --- |
| NFR-050 | Controllers stay thin; money rules live in services and pure functions. | Recommended |
| NFR-051 | The FX provider sits behind an interface and can be swapped by config. | Recommended |
| NFR-052 | `yarn test` runs the full suite and passes. | Mandatory (brief p.3) |
| NFR-053 | Lint, format check and type check pass with no errors. | Recommended (tools are mandatory) |
| NFR-054 | Committed OpenAPI spec matches the running app (test fails on drift). | Mandatory spec; drift test recommended |

## Portability and configuration

- Everything runs in Docker; the only host requirement is Docker (and Node 24 + Yarn for
  running tests outside Docker).
- All settings come from environment variables listed in `.env.example` with safe defaults.

## Privacy

- Personal data held: email and/or phone number only. No names, no documents.
- Not written to logs. No retention policy beyond the sandbox's life (documented limitation).
