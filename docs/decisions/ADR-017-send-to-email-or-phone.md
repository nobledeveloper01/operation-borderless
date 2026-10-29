# ADR-017: Send to an email or phone number; inviting people needs SMTP, so it waits

**Context.** People send money to a person, not to a wallet UUID. You asked whether this needs
SMTP. Sending to someone who already has a wallet doesn't: it is a lookup. Sending to someone
who has no wallet yet does, because they must be told and invited, and so do emailed notices.

**Decision.**

- `POST /api/v1/transfers` takes exactly one of `toWalletId`, `toEmail` or `toPhoneNumber`.
  Anything else is `400`.
- An email is trimmed and lowercased, and a phone number is turned into E.164 (Nigerian local
  numbers read as +234), by the same field decorators that sign-up and login use. So
  `08012345678` and `+2348012345678` reach the same wallet.
- The wallet is found through the HMAC lookup column that already keeps emails and phones
  unique. Nothing is decrypted, and the email is never compared in plain text.
- An unknown email or phone answers `404 WALLET_NOT_FOUND` with the same message as an unknown
  wallet ID. Sending to your own email is `422 SAME_WALLET`.
- The answer shows the receiver's wallet ID, as any transfer does, but never their email or
  phone.

**Not built: inviting someone without a wallet.** It needs an SMTP server or SMS provider to
reach them, a holding balance for unclaimed money, and an expiry that returns it. The outbox
from ADR-016 is where that message would start; I left it out because it needs an outside
service.

**Risk.** Someone with a wallet can check whether an email or phone has a wallet by sending the
smallest amount to it: a `201` costs them a millionth, a `404` costs nothing. Sign-up already
reveals the same thing with its `409`. Both are limited per IP (money routes 30 a minute,
sign-up 10 a minute). A production system would add a per-account limit on address lookups
and alert on accounts that hit many unknown addresses.
