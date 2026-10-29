# ADR-006: Idempotency key claimed inside the money transaction

**Context.** The same swap must never run twice (brief p.2); clients retry after timeouts.

**Decision.** Require `Idempotency-Key` on deposits, swaps and transfers. The key row is
inserted with `ON CONFLICT DO NOTHING` as the first statement of the money transaction and
holds a hash of the request and the stored response.

**Alternatives.** Lookup-then-insert (racy); a separate "in progress" record committed first
(needs recovery for crashed requests); natural keys only (can't tell a retry from a new
request).

**Consequences.** Parallel duplicates wait on the unique index and then replay. A crash rolls
back the key with the money, so a retry runs cleanly. Failed requests are not cached.
