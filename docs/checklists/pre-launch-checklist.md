# Pre-Launch Checklist

**Applies:** M = mandatory (brief), R = recommended, N/A = not applicable (reason given).
**Status:** PASS (verified with evidence), FAIL, NEEDS VERIFICATION, DEFERRED (not done, said
so in the README), NOT APPLICABLE. Checked on 29 Oct 2026 against `main`.

## A. Frontend, accessibility, SEO (sections A, F, I)

| Item                                                  | Applies | Status         | Reason / evidence needed                                                     |
| ----------------------------------------------------- | ------- | -------------- | ---------------------------------------------------------------------------- |
| All frontend, responsive, accessibility and SEO items | N/A     | NOT APPLICABLE | Brief p.1: "There is no frontend to build." Swagger UI is a stock tool page. |

## B. Backend, API and application security

| Item                                                         | Applies | Status         | Evidence needed                                                                                              |
| ------------------------------------------------------------ | ------- | -------------- | ------------------------------------------------------------------------------------------------------------ |
| Injection prevented (parameterised SQL)                      | R       | PASS           | TC-040 `test/api/injection.api.spec.ts`; every query uses `$n` parameters                                    |
| Input validation and unknown-field refusal                   | M       | PASS           | TC-010, TC-041, TC-042                                                                                       |
| Mass-assignment protection                                   | R       | PASS           | TC-041; `whitelist` + `forbidNonWhitelisted`                                                                 |
| BOLA/IDOR (other wallets answer 404)                         | R       | PASS           | TC-056, TC-057 (transfers and history suites)                                                                |
| AuthN on every wallet route                                  | R       | PASS           | TC-055; OpenAPI test checks security on every non-public route                                               |
| JWT config (ES256 only, known `kid`, iss, aud, exp)          | R       | PASS           | TC-058 `test/unit/auth/access-tokens.spec.ts`                                                                |
| HTTPS, HTTP redirect, HSTS through the proxy                 | R       | PASS           | TC-060 `scripts/smoke-tls.sh`: HTTPS, HSTS, redirect, TLS 1.2/1.3 only                                       |
| Database TLS enforced in production config                   | R       | PASS           | TC-061: production refuses `DB_SSL` other than `verify-full`                                                 |
| Personal data encrypted at rest                              | R       | PASS           | TC-062, TC-063                                                                                               |
| Message-level body encryption (JWE) / response signing (JWS) | N/A     | NOT APPLICABLE | Decided against for now; TLS covers it (ADR-009)                                                             |
| Brute-force protection on login                              | R       | PASS           | TC-048, TC-049; `test/integration/login-lockout.spec.ts`                                                     |
| Rate limiting                                                | R       | PASS           | TC-043; health exempt by design, tested in `platform.api.spec.ts`                                            |
| Request size and query limits                                | R       | PASS           | TC-042; history `limit` ≤ 100, `page` ≤ 10,000                                                               |
| CORS explicit                                                | R       | PASS           | TC-045                                                                                                       |
| Security headers                                             | R       | PASS           | TC-045                                                                                                       |
| SSRF (outbound URL fixed by config, https)                   | R       | PASS           | Provider URLs fixed by config, https only, redirects refused; `env.validation.spec.ts`, `fetch-json.spec.ts` |
| Safe production errors                                       | R       | PASS           | TC-044                                                                                                       |
| No sensitive data in logs                                    | R       | PASS           | `test/unit/common/logger.options.spec.ts`: tokens, keys, email, password redacted; query strings dropped     |
| Secrets not committed                                        | M       | PASS           | gitleaks over all 59+ commits: 12 hits, all example values or local-only keys, listed in `.gitleaksignore`   |
| Dependency vulnerabilities assessed                          | R       | PASS           | `yarn npm audit`: production none; dev one moderate (`glob` 10.5 deprecation via Testcontainers)             |
| Race conditions and duplicate operations                     | M       | PASS           | TC-020, TC-023, TC-027, TC-035                                                                               |
| CSRF, cookies, MFA, webhooks, uploads, bot protection        | N/A     | NOT APPLICABLE | Tokens in headers, no cookies; no webhooks or uploads; MFA out of scope                                      |
| Debug mode off, no default credentials                       | R       | PASS           | Production refuses local keys and plain DB connections; no default accounts                                  |
| Row-level security                                           | N/A     | NOT APPLICABLE | No tenants or users to separate                                                                              |

## C. Authentication and accounts

| Item                                                            | Applies | Status         | Reason                                                                                                                                |
| --------------------------------------------------------------- | ------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Signup (wallet create) and login                                | R       | PASS           | TC-001, TC-047                                                                                                                        |
| Passwords hashed with argon2id; no secrets stored in plain text | R       | PASS           | TC-059                                                                                                                                |
| Refresh rotation and reuse detection                            | R       | PASS           | TC-050, TC-051                                                                                                                        |
| Logout takes effect at once                                     | R       | PASS           | TC-052                                                                                                                                |
| Wallet keys shown once, scoped, revocable                       | R       | PASS           | TC-053, TC-054                                                                                                                        |
| Same answer for every login failure                             | R       | PASS           | TC-048                                                                                                                                |
| Account enumeration on wallet create                            | R       | PASS           | Accepted risk: the brief requires refusing a taken identifier, so `409` reveals it; limited to 10 a minute per IP (authentication.md) |
| Email/SMS verification, password reset, roles, suspension       | N/A     | NOT APPLICABLE | No mail or SMS provider; one holder per wallet; documented limitation                                                                 |

## D. Database and data integrity

| Item                                        | Applies | Status         | Evidence needed                                                               |
| ------------------------------------------- | ------- | -------------- | ----------------------------------------------------------------------------- |
| Schema, keys, checks, indexes reviewed      | M       | PASS           | `test/integration/schema.spec.ts`; reviewed in each step                      |
| Unique identifiers enforced in DB           | M       | PASS           | TC-005                                                                        |
| No negative balance (service + CHECK)       | M       | PASS           | TC-019, TC-020                                                                |
| Transaction rollback                        | M       | PASS           | TC-014                                                                        |
| Append-only money tables                    | R       | PASS           | TC-038                                                                        |
| Ledger matches balances                     | R       | PASS           | TC-037; checked after every money suite                                       |
| Migrations run automatically and down works | M       | PASS           | Clean clone `docker compose up` ran 3 migrations; schema test runs every down |
| Test data isolated (Testcontainers)         | R       | PASS           | `test/support/global-setup.ts` starts a throwaway PostgreSQL                  |
| Backups and restore                         | N/A     | NOT APPLICABLE | Local sandbox; noted for production                                           |

## E. Privacy and legal

| Item                                  | Applies | Status         | Reason                                                                                                                                                                             |
| ------------------------------------- | ------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data minimised (email/phone only)     | R       | PASS           | Only email or phone and a password hash per account                                                                                                                                |
| FX provider terms and attribution     | R       | PASS           | Read 29 Oct 2026: attribution shown; caching allowed; the no-redistribution clause conflicts with `GET /fx/rates`, accepted for the sandbox and listed in README known limitations |
| Policies, consent, cookies, marketing | N/A     | NOT APPLICABLE | No public product or users                                                                                                                                                         |
| Assessment PDF not committed          | M       | PASS           | Not tracked and never in history                                                                                                                                                   |

## G. Performance and reliability

| Item                                                            | Applies | Status   | Evidence needed                                                                   |
| --------------------------------------------------------------- | ------- | -------- | --------------------------------------------------------------------------------- |
| FX timeouts and bounded retries                                 | M       | PASS     | TC-015, TC-018                                                                    |
| FX failure handled gracefully (secondary source; 503 past 26 h) | M       | PASS     | TC-015, TC-016, TC-008                                                            |
| DB statement and lock timeouts                                  | R       | PASS     | `statement_timeout` 5 s, `lock_timeout` 3 s; 55P03/57014 → 503 in the filter test |
| Indexed history queries, no N+1                                 | R       | PASS     | `EXPLAIN`: BitmapOr over both wallet indexes; two queries per page                |
| Load test                                                       | R       | DEFERRED | Not run; listed in the README under "With more time"                              |
| Graceful shutdown                                               | R       | PASS     | `enableShutdownHooks`; `docker compose stop api` exits 0 at once                  |

## H. Business workflows (money)

| Item                                         | Applies | Status         | Evidence needed                                 |
| -------------------------------------------- | ------- | -------------- | ----------------------------------------------- |
| Amounts validated server-side, integer units | M       | PASS           | TC-010, TC-012                                  |
| Exact conversion and rounding                | M       | PASS           | TC-012, TC-028, `test/unit/money/money.spec.ts` |
| Duplicate processing prevented               | M       | PASS           | TC-021–024, TC-036                              |
| Transaction records complete                 | M       | PASS           | TC-029                                          |
| Payments, refunds, webhooks                  | N/A     | NOT APPLICABLE | Deposits are simulated; no rails                |

## J. Testing and QA

| Item                                   | Applies   | Status | Evidence needed                             |
| -------------------------------------- | --------- | ------ | ------------------------------------------- |
| `yarn test` runs full suite and passes | M         | PASS   | Green CI on a fresh checkout every push     |
| Unit, integration, API tests           | M         | PASS   | `test/unit`, `test/integration`, `test/api` |
| Concurrency and idempotency tests      | M         | PASS   | TC-020, TC-023, TC-027                      |
| FX failure tests                       | M         | PASS   | TC-015–018                                  |
| Contract test (OpenAPI)                | R         | PASS   | TC-039, test/api/openapi.api.spec.ts        |
| Lint, format, type check               | M (tools) | PASS   | CI steps lint, format:check, typecheck      |

## K. Infrastructure

| Item                                               | Applies | Status         | Evidence needed                                                     |
| -------------------------------------------------- | ------- | -------------- | ------------------------------------------------------------------- |
| `docker compose up` starts everything              | M       | PASS           | Fresh clone from GitHub, no `.env`: ready 200, live rates, redirect |
| `.env.example` documented, no secrets              | M       | PASS           | Every key commented; only local-only keys, refused in production    |
| Container runs as non-root                         | R       | PASS           | `USER node` in the runtime stage                                    |
| Health checks leak nothing                         | R       | PASS           | TC-046: `{ status }` only                                           |
| CI runs lint, types, tests                         | R       | PASS           | `.github/workflows/ci.yml`, green on main                           |
| HTTPS locally through Caddy                        | R       | PASS           | TC-060                                                              |
| Public domain, monitoring, alerts, disk encryption | N/A     | NOT APPLICABLE | Brief p.3: no deployed URL required; documented for production      |

## M. Documentation and release

| Item                                 | Applies | Status             | Evidence needed                                      |
| ------------------------------------ | ------- | ------------------ | ---------------------------------------------------- |
| README: every item on brief p.3      | M       | PASS               | One README section per DEL-006 item                  |
| OpenAPI committed and matches code   | M       | PASS               | `docs/openapi.json`, TC-039                          |
| Known limitations and left-out items | M       | PASS               | README "Known limitations" and "Left out on purpose" |
| Public repo, clear history           | M       | PASS               | Public on GitHub; conventional one-line commits      |
| Submission email drafted             | M       | NEEDS VERIFICATION | Draft shown to me before sending                     |

## N. Senior backend gates

| Item                                      | Applies | Status | Evidence needed                                      |
| ----------------------------------------- | ------- | ------ | ---------------------------------------------------- |
| Idempotency defined per operation         | M       | PASS   | money-handling.md; TC-021–024                        |
| Idempotency safe under concurrency        | M       | PASS   | TC-023                                               |
| Key reuse with another payload defined    | M       | PASS   | TC-022                                               |
| Lock ordering prevents deadlocks          | M       | PASS   | TC-027; mutation check deadlocked without the sort   |
| Retries only on safe operations           | R       | PASS   | Only provider GETs retry; `fetch-json.spec.ts`       |
| Config validation blocks unsafe start     | R       | PASS   | `test/unit/config/env.validation.spec.ts`            |
| Traceability complete for mandatory items | M       | PASS   | No PLANNED rows left in requirements-traceability.md |
