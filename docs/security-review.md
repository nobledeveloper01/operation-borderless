# Security Review (design stage)

This is the threat model and the planned control for each threat. Nothing here is verified
yet; the Test column says what proves each control, and the
[pre-launch checklist](checklists/pre-launch-checklist.md) tracks the evidence.

## Context

- The brief doesn't require authentication (p.2); I add accounts, sessions and wallet keys
  ([authentication.md](authentication.md)). The API is a sandbox with simulated money.
- Personal data: email and phone number.
- Outside call: one fixed FX URL, set by config, never by request input.

## Threats and controls

| Threat | Applies? | Planned control | Test |
| --- | --- | --- | --- |
| Anyone moves money from any wallet | Yes | Session or wallet key required; ownership check on every wallet route; others get `404` | TC-055–057 |
| Stolen password / brute force | Yes | argon2id; 10/min per IP on login; lock after 5 failures; same `401` for every failure | TC-048, TC-049 |
| Forged or tampered token | Yes | ES256 only, `alg: none` and HS256 refused, unknown `kid` refused, `iss`/`aud`/`exp` checked | TC-058 |
| Traffic read or changed in transit | Yes | HTTPS through Caddy (TLS 1.2+, 1.3 preferred), HTTP → HTTPS redirect, HSTS; API port not published; database TLS `verify-full` in production | TC-060, TC-061 |
| Database dump or backup leaked | Yes | Email and phone encrypted with AES-256-GCM (versioned keys, associated data); lookups by HMAC index; secrets hashed | TC-062, TC-063 |
| Signing or encryption key leaked | Yes | Keys outside the repo (git-ignored files and env), rotation by `kid` and key version, production start refused without keys | Config test |
| Stolen refresh token | Yes | Rotation; reuse revokes the session; stored only as SHA-256 | TC-051 |
| Stolen access token after logout | Yes | Session checked on every request | TC-052 |
| Leaked wallet key | Yes | Shown once, stored as SHA-256, scoped to one wallet, revocable | TC-054 |
| Wallet enumeration by email/phone | Yes | Create returns `409` with a generic message; lookup endpoint is Could-have and rate limited if built | TC-005 |
| SQL injection | Yes | TypeORM parameters only; raw SQL uses `$n` placeholders; no string-built SQL | Lint rule + review; TC-040 |
| Mass assignment | Yes | DTOs with `whitelist` + `forbidNonWhitelisted`; balances, status, rate never accepted from the client | TC-041 |
| Bad input (types, sizes) | Yes | class-validator on every field; amount regex; body limit 16 KB; query limits | TC-042 |
| Float money errors / tampered rates | Yes | Integer units; rates only from the stored snapshot; client never sends a rate | TC-012, TC-028 |
| Double spend by retries | Yes | Idempotency key in the money transaction | TC-021–TC-024 |
| Races (overdraft, lost update) | Yes | Ordered `FOR UPDATE` locks + `CHECK (amount >= 0)` | TC-020, TC-027 |
| Malicious or broken FX data | Yes | Strict response validation; positive finite numbers; all codes present | TC-017 |
| SSRF | Low | Provider URL from config only, `https` required by config validation, no redirects followed | TC-018 |
| Resource exhaustion | Yes | Throttler per IP, `limit` max 100, request size limit, DB statement and lock timeouts, FX fetch timeout | TC-043 |
| Error leakage | Yes | Global filter: no stack traces or SQL text; generic `500` with request ID | TC-044 |
| Log leakage | Yes | pino redaction of `email`, `phoneNumber`, `authorization` headers; no bodies logged | Review |
| Secrets in repo | Yes | No real secrets needed; `.env` ignored; `.env.example` placeholders only; secret scan before submission | Checklist |
| CORS abuse | Low | CORS off by default (no browser client); `CORS_ORIGINS` allowlist if set | TC-045 |
| Security headers | Low (JSON API) | `helmet` defaults; Swagger UI gets a relaxed CSP only on `/docs` | TC-045 |
| Vulnerable dependencies | Yes | `yarn npm audit` before submission; few dependencies | Checklist |
| CSRF, XSS, file upload, webhooks, cookies | No | Tokens go in headers (no cookies), no HTML output, no uploads, no webhooks | N/A |

## Encryption

What I encrypt, what I don't, and why: [ADR-009](decisions/ADR-009-encryption.md). In
short: TLS for every body in transit, field encryption for personal data at rest, ES256 for
tokens. Message-level body encryption (JWE) and signed responses (JWS) are not built now,
because TLS already covers this API's threats and both would break Swagger and `curl` for
reviewers. They are noted for partner integrations later.

## Accepted risks

1. **No email/SMS verification or password reset.** Identifiers are trusted as given.
2. **Reference rates, not market prices.** Stated in the README and in `GET /fx/rates`.
3. **Rounding remainder** under one millionth per conversion is not booked.
4. **Swagger UI is public** in the sandbox. In production it would be off or behind auth.

## Production work (not built)

Identifier verification, password reset, MFA, opt-in JWE for partner integrations, a secret manager for keys, encrypted disks or a managed database, least-privilege DB role, TLS at a proxy,
secret manager, audit of who changed what, alerting on FX failures and lock timeouts.
