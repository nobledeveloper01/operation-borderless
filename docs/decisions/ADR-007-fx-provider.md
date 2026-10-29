# ADR-007: Two free daily FX sources, fail closed on stale rates

**Context.** Live rates are preferred, with a fallback when the provider fails (brief p.2).
The coins track NGN, GHS, XAF, USD and EUR. Free sources publish once a day.

**Decision.** Primary `open.er-api.com/v6/latest/USD`, secondary Currency API by fawazahmed0
(`latest.currency-api.pages.dev`), both behind an `FxProvider` interface and validated.
Refresh after each daily publication. Follow the daily-reference-rate standard: a rate is
usable for 26 hours after its publication (24 h cycle + 2 h grace); after that swaps and
transfers are refused with `503`. Every rate shown or applied carries its source and time.

**Alternatives.** Frankfurter (no NGN, GHS or XAF, checked 29 Oct 2026); paid hourly or
real-time feeds (the market standard of seconds-old rates and 30-second quotes, but needs a
paid key); a long stale window such as 48 h (moves money on an old publication); a fixed
table as the fallback (kept only for offline demos, off by default).

**Consequences.** Daily reference rates, not market prices; attribution required. If both
sources are down for over 2 hours past a publication, money stops moving until one returns.
Moving to a paid feed means a new adapter and a shorter `FX_MAX_DATA_AGE_HOURS`.
