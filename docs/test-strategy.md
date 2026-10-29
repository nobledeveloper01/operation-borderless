# Test Strategy

## Tools

- **Jest** with `ts-jest`, **Supertest** for HTTP (brief p.2).
- **Testcontainers** (`@testcontainers/postgresql`) starts a throwaway PostgreSQL 17 for
  integration and API tests, runs the migrations, and removes it after. So `yarn test` needs
  only Docker running, and never touches a real database.
- A **fake FX provider** replaces the live adapter in tests. No test calls the internet. The
  live adapter's parsing is tested with recorded provider responses.

## Commands (planned)

| Command | Runs |
| --- | --- |
| `yarn test` | Everything below (brief: "runs the full suite and passes") |
| `yarn test:unit` | Unit tests only, no Docker |
| `yarn test:int` | Integration and API tests |
| `yarn lint`, `yarn format:check`, `yarn typecheck` | Static checks |

## Levels

| Level | What | Where |
| --- | --- | --- |
| Unit | Amount parsing and formatting, cross-rate maths, rounding, USD totals, snapshot freshness (26 h rule), provider response validation, idempotency hash, error mapping | `test/unit` |
| Integration | `LedgerService` against PostgreSQL: locks, checks, rollback, append-only triggers, unique constraints, idempotency claim/replay | `test/integration` |
| API | Every endpoint through the full Nest app with Supertest: success, validation, 404/409/422/503, headers, paging, filters | `test/api` |
| Concurrency | Parallel swaps and transfers; parallel same-key requests; ledger sum equals balances | `test/integration` |
| Contract | Committed `docs/openapi.json` equals the generated spec; responses match their schemas | `test/api` |

Each test name starts with its test case ID, for example
`it('TC-020 parallel swaps never overdraw', ...)`.

## Test cases

| ID | Requirement | Case |
| --- | --- | --- |
| TC-001 | FR-001, FR-003 | Create with email → 201, five zero balances |
| TC-002 | FR-001 | Create with phone in local format → stored as E.164 |
| TC-003 | FR-001 | No identifier, bad email, bad phone → 400 |
| TC-004 | FR-002 | Same email in other case → 409 |
| TC-005 | FR-002 | 10 parallel creates, one email → one 201, nine 409 |
| TC-006 | FR-003 | Unsupported currency anywhere → 400 |
| TC-007 | FR-004 | USD total exact with fixed test rates |
| TC-008 | FR-004 | No usable rate → balances shown, total null |
| TC-009 | FR-005 | Deposit raises balance exactly; transaction returned |
| TC-010 | FR-005 | Zero, negative, 7 decimals, number type, above cap → 400 |
| TC-011 | FR-005, FR-018 | Deposit retried with same key → balance changes once |
| TC-012 | FR-006 | Swap amount exact at known rate |
| TC-013 | FR-006 | Same-currency swap → 400; amount rounds to 0 → 422 |
| TC-014 | FR-006 | Failure mid-swap rolls back both balances |
| TC-015 | FR-007 | Primary timeout → secondary used and stored |
| TC-016 | FR-007 | Both down, snapshot 26 h + 1 min old → swap and transfer 503, rates show `isStale` |
| TC-017 | FR-007 | Bad data (missing code, 0, NaN, future date, 20% jump, wrong JSON) refused |
| TC-018 | FR-007 | Retries bounded; 4xx and 429 not retried; next fetch scheduled after the provider's next update |
| TC-019 | FR-008 | Swap above balance → 422, nothing changes |
| TC-020 | FR-008 | 20 parallel swaps of 1/4 balance → exactly 4 succeed |
| TC-021 | FR-009 | Same key, same body → same response, `Idempotent-Replayed` |
| TC-022 | FR-009 | Same key, other body → 422 |
| TC-023 | FR-009 | 10 parallel same-key swaps → one transaction |
| TC-024 | FR-009 | Missing key → 400; failed request then retry with key → runs |
| TC-025 | FR-010 | Same-currency transfer, rate 1 |
| TC-026 | FR-010, FR-017 | Transfer above balance → 422; to self → 422; unknown wallet → 404 |
| TC-027 | FR-010 | Parallel A→B and B→A → no deadlock, totals conserved |
| TC-028 | FR-011 | Cross-currency transfer exact at known rate |
| TC-029 | FR-012, FR-015 | Transaction by ID has every required field |
| TC-030 | FR-013 | Mixed history newest first with directions |
| TC-031 | FR-014 | Paging: 25 items, limit 10, page 3 → 5 items, total 25 |
| TC-032 | FR-014 | Filters by type and by currency |
| TC-033 | FR-015 | Bad UUID → 400; unknown → 404 |
| TC-034 | FR-016 | 20 pairs; inverse pairs ≈ 1; source and times present |
| TC-035 | FR-017 | 10 parallel transfers from one balance never overdraw |
| TC-036 | FR-018 | Transfer replay with same key moves money once |
| TC-037 | NFR-014 | Ledger lines sum to each balance after the concurrency tests |
| TC-038 | NFR-013 | UPDATE/DELETE on transactions and ledger refused |
| TC-039 | NFR-054 | Committed OpenAPI equals generated spec |
| TC-040 | Security | Injection strings in fields are stored or refused, never executed |
| TC-041 | Security | Extra fields (`amount` on wallet, `rate` on swap) → 400 |
| TC-042 | Security | Oversized body → 413; `limit=1000` → 400 |
| TC-043 | Security | Burst above rate limit → 429 |
| TC-044 | Security | Unexpected error → generic 500 with request ID, no stack |
| TC-045 | Security | Security headers present; no CORS headers by default |
| TC-046 | FR-021 | Health 200; readiness 503 when DB is down |
| TC-047 | FR-022 | Login with email or phone → tokens; access token works |
| TC-048 | FR-022 | Unknown identifier, wrong password, locked → same 401 body |
| TC-049 | FR-022 | 5 wrong passwords lock for 15 min; right password then fails until unlock |
| TC-050 | FR-023 | Refresh returns a new pair; old refresh token refused |
| TC-051 | FR-023 | Reusing a used refresh token revokes the session |
| TC-052 | FR-024 | After logout the same access token gets 401 at once |
| TC-053 | FR-025 | Key shown once; list hides secrets; 6th key → 409; key can't manage keys (403) |
| TC-054 | FR-025 | Revoked key → 401; key for wallet A on wallet B → 404 |
| TC-055 | FR-026 | No credentials on every wallet route → 401 |
| TC-056 | FR-026 | Caller B on A's balances, history, deposits, swaps → 404 |
| TC-057 | FR-026 | Transfer from a wallet the caller doesn't own → 404; receiver can read the transfer, a third wallet can't |
| TC-058 | FR-027 | Expired, wrong key, unknown `kid`, `alg: none`, HS256, wrong `iss`/`aud`, garbage → 401; old `kid` still verifies during rotation |
| TC-059 | BR-13 | Database holds no plain passwords, refresh tokens or key secrets |
| TC-060 | NFR-060 | Through the compose proxy: HTTP redirects to HTTPS, HSTS present, TLS 1.1 refused (smoke script, not in `yarn test`) |
| TC-061 | NFR-061 | Production config with `DB_SSL=disable` or no signing key refuses to start |
| TC-062 | NFR-062 | Database holds no plain email or phone; login by email still works; duplicate email still 409 |
| TC-063 | NFR-062 | Ciphertext copied to another account fails to decrypt; tampered tag fails; old key version still decrypts after rotation |

## Rules

- Each money test checks the exact string amounts, not "greater than".
- Concurrency tests use `Promise.all` against the HTTP app and then read the database.
- Tests never depend on the order other tests ran; each makes its own wallets.
- Results reported are from real runs only.
