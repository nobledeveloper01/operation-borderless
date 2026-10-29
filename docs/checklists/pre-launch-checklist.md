# Pre-Launch Checklist

**Applies:** M = mandatory (brief), R = recommended, N/A = not applicable (reason given).
**Status:** PASS (verified with evidence), FAIL, NEEDS VERIFICATION, NOT APPLICABLE.
At the design stage every applicable item is NEEDS VERIFICATION.

## A. Frontend, accessibility, SEO (sections A, F, I)

| Item | Applies | Status | Reason / evidence needed |
| --- | --- | --- | --- |
| All frontend, responsive, accessibility and SEO items | N/A | NOT APPLICABLE | Brief p.1: "There is no frontend to build." Swagger UI is a stock tool page. |

## B. Backend, API and application security

| Item | Applies | Status | Evidence needed |
| --- | --- | --- | --- |
| Injection prevented (parameterised SQL) | R | NEEDS VERIFICATION | TC-040, code review |
| Input validation and unknown-field refusal | M | NEEDS VERIFICATION | TC-010, TC-041, TC-042 |
| Mass-assignment protection | R | NEEDS VERIFICATION | TC-041 |
| BOLA/IDOR | N/A | NOT APPLICABLE | No users or ownership by design (A-01); documented risk |
| AuthN/AuthZ on protected endpoints | N/A | NOT APPLICABLE | Brief p.2: no full authentication required |
| Rate limiting | R | NEEDS VERIFICATION | TC-043 |
| Request size and query limits | R | NEEDS VERIFICATION | TC-042 |
| CORS explicit | R | NEEDS VERIFICATION | TC-045 |
| Security headers | R | NEEDS VERIFICATION | TC-045 |
| SSRF (outbound URL fixed by config, https) | R | NEEDS VERIFICATION | Config validation test |
| Safe production errors | R | NEEDS VERIFICATION | TC-044 |
| No sensitive data in logs | R | NEEDS VERIFICATION | Log redaction test or review |
| Secrets not committed | M | NEEDS VERIFICATION | Secret scan of history |
| Dependency vulnerabilities assessed | R | NEEDS VERIFICATION | `yarn npm audit` output |
| Race conditions and duplicate operations | M | NEEDS VERIFICATION | TC-020, TC-023, TC-027, TC-035 |
| CSRF, cookies, sessions, MFA, webhooks, uploads, bot protection | N/A | NOT APPLICABLE | No browser sessions, accounts, webhooks or uploads |
| Debug mode off, no default credentials | R | NEEDS VERIFICATION | Config review |
| Row-level security | N/A | NOT APPLICABLE | No tenants or users to separate |

## C. Authentication and accounts

| Item | Applies | Status | Reason |
| --- | --- | --- | --- |
| Signup, login, recovery, tokens, roles, sessions | N/A | NOT APPLICABLE | Brief p.2 excludes full authentication |
| Account enumeration on wallet create | R | NEEDS VERIFICATION | TC-005 generic message |

## D. Database and data integrity

| Item | Applies | Status | Evidence needed |
| --- | --- | --- | --- |
| Schema, keys, checks, indexes reviewed | M | NEEDS VERIFICATION | Migration review |
| Unique identifiers enforced in DB | M | NEEDS VERIFICATION | TC-005 |
| No negative balance (service + CHECK) | M | NEEDS VERIFICATION | TC-019, TC-020 |
| Transaction rollback | M | NEEDS VERIFICATION | TC-014 |
| Append-only money tables | R | NEEDS VERIFICATION | TC-038 |
| Ledger matches balances | R | NEEDS VERIFICATION | TC-037 |
| Migrations run automatically and down works | M | NEEDS VERIFICATION | Compose run; migration test |
| Test data isolated (Testcontainers) | R | NEEDS VERIFICATION | Test setup |
| Backups and restore | N/A | NOT APPLICABLE | Local sandbox; noted for production |

## E. Privacy and legal

| Item | Applies | Status | Reason |
| --- | --- | --- | --- |
| Data minimised (email/phone only) | R | NEEDS VERIFICATION | Schema review |
| FX provider terms and attribution | R | NEEDS VERIFICATION | Re-read terms; attribution in README and API |
| Policies, consent, cookies, marketing | N/A | NOT APPLICABLE | No public product or users |
| Assessment PDF not committed | M | NEEDS VERIFICATION | Repo file list |

## G. Performance and reliability

| Item | Applies | Status | Evidence needed |
| --- | --- | --- | --- |
| FX timeouts and bounded retries | M | NEEDS VERIFICATION | TC-015, TC-018 |
| FX failure handled gracefully | M | NEEDS VERIFICATION | TC-016, TC-008 |
| DB statement and lock timeouts | R | NEEDS VERIFICATION | Config + test |
| Indexed history queries, no N+1 | R | NEEDS VERIFICATION | `EXPLAIN` on history query |
| Load test | R | NEEDS VERIFICATION | Only if time allows; report real numbers only |
| Graceful shutdown | R | NEEDS VERIFICATION | `enableShutdownHooks`, manual check |

## H. Business workflows (money)

| Item | Applies | Status | Evidence needed |
| --- | --- | --- | --- |
| Amounts validated server-side, integer units | M | NEEDS VERIFICATION | TC-010, TC-012 |
| Exact conversion and rounding | M | NEEDS VERIFICATION | TC-012, TC-028, unit tests |
| Duplicate processing prevented | M | NEEDS VERIFICATION | TC-021–024, TC-036 |
| Transaction records complete | M | NEEDS VERIFICATION | TC-029 |
| Payments, refunds, webhooks | N/A | NOT APPLICABLE | Deposits are simulated; no rails |

## J. Testing and QA

| Item | Applies | Status | Evidence needed |
| --- | --- | --- | --- |
| `yarn test` runs full suite and passes | M | NEEDS VERIFICATION | Clean-checkout run output |
| Unit, integration, API tests | M | NEEDS VERIFICATION | Test report |
| Concurrency and idempotency tests | M | NEEDS VERIFICATION | TC-020, TC-023, TC-027 |
| FX failure tests | M | NEEDS VERIFICATION | TC-015–018 |
| Contract test (OpenAPI) | R | NEEDS VERIFICATION | TC-039 |
| Lint, format, type check | M (tools) | NEEDS VERIFICATION | Command output |

## K. Infrastructure

| Item | Applies | Status | Evidence needed |
| --- | --- | --- | --- |
| `docker compose up` starts everything | M | NEEDS VERIFICATION | Clean-checkout run |
| `.env.example` documented, no secrets | M | NEEDS VERIFICATION | File review |
| Container runs as non-root | R | NEEDS VERIFICATION | Dockerfile |
| Health checks leak nothing | R | NEEDS VERIFICATION | TC-046 |
| CI runs lint, types, tests | R | NEEDS VERIFICATION | Green Actions run |
| HTTPS, domain, monitoring, alerts | N/A | NOT APPLICABLE | Brief p.3: no deployed URL required |

## M. Documentation and release

| Item | Applies | Status | Evidence needed |
| --- | --- | --- | --- |
| README: every item on brief p.3 | M | NEEDS VERIFICATION | README review against DEL-006 |
| OpenAPI committed and matches code | M | NEEDS VERIFICATION | TC-039 |
| Known limitations and left-out items | M | NEEDS VERIFICATION | README section |
| Public repo, clear history | M | NEEDS VERIFICATION | `gh repo view`, `git log` |
| Submission email drafted | M | NEEDS VERIFICATION | Draft shown to the candidate |

## N. Senior backend gates

| Item | Applies | Status | Evidence needed |
| --- | --- | --- | --- |
| Idempotency defined per operation | M | NEEDS VERIFICATION | money-handling.md + tests |
| Idempotency safe under concurrency | M | NEEDS VERIFICATION | TC-023 |
| Key reuse with another payload defined | M | NEEDS VERIFICATION | TC-022 |
| Lock ordering prevents deadlocks | M | NEEDS VERIFICATION | TC-027 |
| Retries only on safe operations | R | NEEDS VERIFICATION | FX adapter test |
| Config validation blocks unsafe start | R | NEEDS VERIFICATION | Config test |
| Traceability complete for mandatory items | M | NEEDS VERIFICATION | requirements-traceability.md |
