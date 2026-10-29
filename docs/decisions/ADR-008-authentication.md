# ADR-008: Account sessions and wallet keys

**Context.** The brief doesn't require full authentication (p.2), but without it anyone with
a wallet ID can move that wallet's money.

**Decision.** Add accounts (identifier + argon2id password, created by `POST /wallets`), JWT
access tokens (15 min) with rotating refresh tokens and reuse detection, and per-wallet API
keys (`X-Wallet-Key`). Every wallet route checks ownership; other wallets answer `404`.

**Alternatives.** No auth (matches the brief, leaves the gap open); wallet keys only (simple,
but no login or session control); OAuth with an outside provider (a dependency reviewers
would have to set up).

**Consequences.** About 8 more hours of work, taken from the could-have items and test
buffer. Reviewers need one extra step (copy the token from the create answer). Logout takes
effect at once because the guard checks the session on every request.
