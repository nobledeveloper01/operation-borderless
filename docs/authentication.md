# Authentication and Authorization

The brief says "No full authentication is required" (p.2). I add it anyway, because a
wallet API where anyone with an ID can move money is the biggest gap in the design. It must
not break the brief: a wallet is still created with an email or a mobile number, and one
identifier still gives one wallet.

Two ways to call the API:

| Method          | Header                                 | For                                      | Lifetime                                                |
| --------------- | -------------------------------------- | ---------------------------------------- | ------------------------------------------------------- |
| Account session | `Authorization: Bearer <access token>` | Apps acting for a signed-in holder       | Access 15 min, refresh 30 days, session at most 90 days |
| Wallet key      | `X-Wallet-Key: <key>`                  | Scripts and servers acting on one wallet | Until revoked                                           |

Both lead to the same check: the caller must own the wallet it acts on.

## Accounts

- Email and phone are stored encrypted, with an HMAC lookup index for uniqueness and login
  ([ADR-009](decisions/ADR-009-encryption.md)).
- An account is the wallet holder. Its identifier is the email and/or mobile number, the
  same one the brief uses to create the wallet. One account has one wallet.
- `POST /wallets` stays the create route. It now also takes a `password` and creates the
  account, the wallet and its five balances in one transaction. The answer includes the
  wallet and a first session (access and refresh tokens).
- Passwords: 12 to 128 characters, no composition rules (NIST SP 800-63B), must not equal
  the identifier. Hashed with **argon2id** (memory 19 MiB, 2 iterations, parallelism 1, the
  OWASP minimum), never stored or logged in plain text.

## Sessions (JWT)

- `POST /auth/login` with identifier + password → access token + refresh token.
- **Access token:** JWT signed with **ES256** (ECDSA P-256). Claims: `sub` (account ID),
  `sid` (session ID), `iss`, `aud`, `iat`, `exp` (15 minutes); header `kid` names the
  signing key. Verification accepts only ES256, only a `kid` from the trusted key set, and
  checks signature, `exp`, `iss` and `aud`. Claims are never trusted before verification.
- **Signing keys:** private keys are PEM files in `JWT_KEYS_DIR` (`<kid>.pem`, git-ignored);
  `JWT_ACTIVE_KID` signs new tokens and every key in the folder can verify. To rotate, add a
  key, switch `JWT_ACTIVE_KID`, and remove the old key after 15 minutes. In development the
  container makes a key on first start; in production the app refuses to start without one.
- **Refresh token:** 32 random bytes (base64url), opaque, shown once. Only its SHA-256 hash is
  stored, with its session, expiry (30 days, never past the session's end) and `used_at`.
- **Session lifetime:** every session ends 90 days after login (`SESSION_MAX_DAYS`), however
  often it is refreshed. After that the holder logs in again.
- **Rotation:** `POST /auth/refresh` marks the token used and returns a new pair in the same
  session. Presenting a token that was already used means it leaked: the whole session is
  revoked and the call gets `401`.
- **Logout:** `POST /auth/logout` revokes the current session. `POST /auth/logout-all`
  revokes every session of the account and every wallet key, so a hijacked session can't
  leave a key behind. It answers with how many of each it ended.
- **Immediate revocation:** the auth guard checks on every request that the token's `sid`
  is not revoked (one indexed read). So logout takes effect at once, not after 15 minutes.

## Wallet keys

- `POST /wallets/{walletId}/keys` (signed in) creates a key with a `name`. The full key is
  returned once: `bwk_<keyId>_<secret>`, where the secret is 32 random bytes.
- Stored: `keyId`, SHA-256 of the secret, name, created, last used, revoked. SHA-256 is
  enough here because the secret is random and long; argon2 is for low-entropy passwords.
- Checked with a constant-time compare. A key acts only on its own wallet.
- `GET /wallets/{walletId}/keys` lists keys without secrets; `DELETE
/wallets/{walletId}/keys/{keyId}` revokes one. At most 5 active keys per wallet.
- A wallet key can't create or revoke keys, or log out sessions (session only).

## Brute force and enumeration

- `/auth/login` and `POST /wallets`: 10 requests per minute per IP.
- After 5 wrong passwords an account is locked for 15 minutes. Successful login resets the
  count. Each attempt is claimed in one atomic database update before the password is
  checked, so parallel guesses can't slip past the lock.
- Login failures (unknown identifier, wrong password, locked account) all answer `401` with
  the same message, and an unknown identifier still runs one argon2 hash so timing doesn't
  give it away.
- `POST /wallets` with a taken identifier answers `409` with a generic message. This tells a
  caller the identifier is used; the brief requires the refusal, so it is accepted and rate
  limited.

## Authorization rules

| Route                                                     | Who                                                                                                                  |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `POST /wallets`, `POST /auth/login`, `POST /auth/refresh` | Public                                                                                                               |
| `GET /fx/rates`, `/health`, `/health/ready`, `/docs`      | Public                                                                                                               |
| `POST /auth/logout`, `/auth/logout-all`, `GET /auth/me`   | Session                                                                                                              |
| Wallet keys routes                                        | Session, own wallet                                                                                                  |
| `GET /wallets/{walletId}`, balances, history              | Session or key, own wallet                                                                                           |
| Deposits, swaps                                           | Session or key, own wallet                                                                                           |
| `POST /transfers`                                         | Session or key, must own `fromWalletId`; the receiver (`toWalletId`, `toEmail` or `toPhoneNumber`) can be any wallet |
| `GET /transactions/{transactionId}`                       | Session or key, caller's wallet must be sender or receiver                                                           |
| `GET /ops/metrics`, `GET /ops/ledger-check`               | Operator token in `X-Ops-Token` only; `404` when `OPS_TOKEN` is unset                                                |

- No header or a bad token/key → `401 UNAUTHENTICATED`.
- Valid caller, someone else's wallet or transaction → `404` (same as not found), so wallet
  and transaction IDs can't be probed.
- A transfer receiver sees the transfer in its own history (as `IN`) with the sender's wallet
  ID only, not the sender's email or phone.
- There are no roles. No admin routes exist.

## Idempotency with auth

Idempotency keys are scoped per account: unique `(account_id, key)`. Two holders can't
collide or read each other's stored answers.

## Swagger

Swagger UI declares both schemes (`bearer` and `X-Wallet-Key`). Reviewer flow: create a
wallet in Swagger, copy `accessToken` into "Authorize", then call the rest. The README
walkthrough shows the same with `curl`.

## Not built (and why)

- Email or SMS verification and password reset: no mail or SMS provider in a sandbox. The
  identifier is trusted as given (documented limitation).
- MFA, OAuth/social login, roles: not needed for one holder per wallet.
- Cookies: clients are API clients, so tokens go in headers; there is no CSRF exposure.
