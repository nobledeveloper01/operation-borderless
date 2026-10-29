# ADR-009: Encryption in transit and at rest; no message-level body encryption for now

**Context.** I want a production-grade codebase. Data to protect: request and response
bodies (balances, amounts, email, phone, tokens), personal data in the database, and the
keys that sign access tokens.

## Decision: what I build

| Layer | Control |
| --- | --- |
| In transit, client ↔ API | HTTPS through a Caddy reverse proxy in docker compose: TLS 1.2 minimum, TLS 1.3 preferred, HTTP redirected to HTTPS, HSTS (`max-age=31536000; includeSubDomains`). Locally Caddy uses its own internal certificate authority. The API container's port is not published; only Caddy is reachable. |
| In transit, API ↔ database | `DB_SSL` setting: `disable` (local default), `require` or `verify-full` with `DB_SSL_CA`. Production must use `verify-full`; the config check refuses `disable` when `NODE_ENV=production`. |
| At rest, personal data | Email and phone encrypted per field with AES-256-GCM: random 12-byte IV, 16-byte tag, the account ID and field name as associated data, and a key version prefix so keys can rotate. Uniqueness and login lookup use an HMAC-SHA256 "blind index" of the normalised value with a separate key. Plain values never reach logs. |
| At rest, secrets | argon2id for passwords; SHA-256 for refresh tokens, wallet-key secrets and idempotency request hashes (already in [ADR-008](ADR-008-authentication.md)). |
| Token signing | ES256 (ECDSA P-256) instead of a shared HMAC secret. Every token carries a `kid`; several public keys can be trusted at once so keys rotate without logging everyone out. |
| At rest, disk | Not built: it is a hosting setting (encrypted volumes or a managed database with encryption at rest). Documented in the deployment notes. |

## Decision: what I do not build now

**1. Message-level encryption of request and response bodies (JWE, RFC 7516).**

TLS already encrypts every body, header and token between the client and the API. JWE adds
value only when a payload must stay encrypted *through* intermediaries that end TLS (API
gateways, partner networks), as with Visa and Mastercard card-data APIs, or when a regulator
requires it. Neither applies to this sandbox. It would also:

- break Swagger "Try it out" and plain `curl`, so reviewers could not read answers;
- need a key exchange and rotation process with every client;
- add about 5–6 hours, taken from the money tests the brief values most.

**2. Signed responses (JWS).** TLS already gives integrity between the two ends. Signing adds
non-repudiation for partner settlement files and webhooks, which this API doesn't have.
About 3 hours.

**3. A home-made encryption scheme on bodies** (for example AES with a shared key in the app).
It adds no protection over TLS, and a shared key in every client is easy to leak.

**When to revisit.** Add opt-in JWE when a partner integration passes through a third party
that terminates TLS, when card data (PCI DSS) or a regulator requires message-level
protection, or when responses must be stored and forwarded. The plan then: the client
registers a public key; requests with `Accept: application/jose` get the body as a compact
JWE (`ECDH-ES` key agreement, `A256GCM` content encryption); plain JSON stays the default.

## Consequences

- About 5.5 more hours (proxy and HSTS 1.5, database TLS 0.5, field encryption 2, ES256 1.5).
  Taken from the plan's buffer.
- Reviewers open `https://localhost`. The local certificate is from Caddy's internal CA, so
  the README shows how to trust it or use `curl -k` for a quick look.
- Without the encryption keys the data can't be read, so losing them loses the data. Key
  storage and backup are a production duty (secret manager), documented.
- Searching by partial email isn't possible (only exact matches through the blind index).
  Nothing in the brief needs it.
