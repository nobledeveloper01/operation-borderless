# ADR-007: FX from ExchangeRate-API open endpoint, with fallbacks

**Context.** Live rates are preferred, with a fallback when the provider fails (brief p.2).
The coins track NGN, GHS, XAF, USD and EUR.

**Decision.** `https://open.er-api.com/v6/latest/USD` (no key) behind an `FxProvider`
interface. Refresh every 60 minutes in the background. Use the newest live snapshot up to
48 hours old, else a fixed fallback table in code. Every rate shown or applied carries its
source and time.

**Alternatives.** Frankfurter (no NGN, GHS or XAF — checked 29 Oct 2026); ExchangeRate-API
key plan (adds a secret for reviewers); fixed table only (brief prefers live).

**Consequences.** Daily reference rates, not market prices. Attribution required. The
adapter can be swapped by config.
