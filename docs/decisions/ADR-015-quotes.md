# ADR-015: Quotes that hold a price for 30 seconds and are spent once

**Context.** Without a quote, a client sees the rate in `GET /fx/rates`, sends a swap or
transfer, and only learns the exact amount and fee afterwards. If the rates refresh in
between, the result differs from what the person saw. Remittance apps solve this with a
short-lived quote the customer confirms.

**Decision.**

- `POST /api/v1/quotes` with `fromCurrency`, `toCurrency` and `amount` returns a `quoteId`, the
  fee, the rounding, the exact `toAmount` and `expiresAt`. It holds the rate and the fee rate
  for `QUOTE_TTL_SECONDS` (30 by default, 5 to 300). Nothing moves and no money is reserved.
- A swap or transfer may pass `quoteId`. It then pays exactly the quoted price, even if the
  rates changed or went stale in the meantime. The currencies and amount must match the quote
  exactly (`422 QUOTE_MISMATCH`).
- A quote belongs to the account that asked for it. Anyone else gets `404 QUOTE_NOT_FOUND`, the
  same as for an unknown ID. An expired quote gets `422 QUOTE_EXPIRED`, a used one
  `409 QUOTE_ALREADY_USED`.
- The quote row is locked (`SELECT … FOR UPDATE`) and marked used inside the money
  transaction. If the movement fails, say for insufficient funds, the mark rolls back and the
  quote can still be used before it expires. Two movements racing for one quote: one wins,
  the rest get `409`.
- Expired quotes are deleted an hour after they expire, by an hourly in-process job.

**Why `POST` and not `GET /fx/quote`.** The original design had a read-only preview. Holding a
price means storing it, so creating a quote is a write; a `GET` with side effects would be
wrong. `POST /quotes` is also rate limited with the money routes.

**Why expiry uses the database clock.** Creation and use both compare with Postgres `now()`, so
one clock decides, whatever the API process thinks the time is.

**Consequences.** Pricing for quotes, swaps and transfers goes through one `PricingService`, so
a quote can't promise a different amount from the one the movement produces. A quote does not
reserve funds; the balance is checked when the movement runs.
