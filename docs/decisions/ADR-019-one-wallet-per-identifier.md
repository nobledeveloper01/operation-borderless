# ADR-019: One wallet per email or phone; one person may still hold two

**Context.** The brief says a wallet is created "using an email address or a mobile number"
and that each should be unique. Every account gets exactly one wallet (a unique `account_id` on
`wallets`), and each email and each phone number can belong to only one account (unique HMAC
lookup indexes). The two are checked separately, so someone can sign up once with an email and
again with a phone number and get two accounts, each with its own wallet.

**Options.**

1. Keep it: one wallet per identifier, and say that one person can hold two.
2. Let a signed-in account add its other identifier, so a person keeps one wallet with both.
   Doing it properly means proving the person owns the new email or phone, which needs SMTP or
   SMS.

**Decision.** Option 1, chosen by you on 29 Oct 2026. The sandbox never verifies who anyone is,
so two sign-ups with different identifiers are two holders as far as the system can tell. A
sign-up can still give both an email and a phone, which ties them to one wallet from the start.

**Consequences.**

- No route adds a second wallet to an account, and a second sign-up with a taken email or
  phone answers `409 WALLET_ALREADY_EXISTS` (TC-005).
- Limits applied per wallet (none today) could be split across two wallets by one person. A
  real product would add identity checks (KYC) and link identifiers to one person before
  adding per-person limits.
