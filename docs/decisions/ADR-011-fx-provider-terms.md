# ADR-011: Keep ExchangeRate-API despite its no-redistribution clause

**Context.** On 29 Oct 2026 I read both rate sources' terms. The Currency API by fawazahmed0 is
CC0-1.0 (public domain). ExchangeRate-API's open endpoint requires attribution and allows
caching and currency conversion, but forbids redistribution and use "in any product or
service that offers programmatic or automatic access to exchange rate data".
`GET /fx/rates` publishes rates, which conflicts with that clause.

**Options.**

1. Make the CC0 source primary and use ExchangeRate-API only to cross-check big moves.
2. The same, but still fall back to ExchangeRate-API when the CC0 source is down.
3. Keep the design and document the conflict.

**Decision.** Option 3, chosen by me for this submission. The brief asks for a rates endpoint,
this is a non-commercial sandbox, and the attribution is shown in the API and README.

**Consequences.** The README lists the conflict as a known limitation, and
[money handling](../money-handling.md#provider-choice) records what each source allows. A real
launch must switch to option 1 or a feed licensed for republishing before `GET /fx/rates` is
public.
