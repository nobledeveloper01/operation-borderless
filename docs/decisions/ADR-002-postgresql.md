# ADR-002: PostgreSQL for money data

**Context.** Balances must never go negative, never change twice for one request, and stay
correct under parallel requests (brief p.2). The README must justify the database (p.1).

**Decision.** PostgreSQL 17.

**Why.** ACID transactions across several rows; `SELECT ... FOR UPDATE` row locks; `CHECK`
and unique constraints that enforce the rules in the database itself; `bigint` and
`numeric` for exact amounts; `ON CONFLICT` for race-free idempotency claims; triggers for
append-only tables.

**Alternatives.** MySQL (works, but weaker `CHECK` history and no `ON CONFLICT ... RETURNING`);
MongoDB (multi-document transactions exist, but constraints and locking are weaker and the
data is relational).

**Consequences.** Tests need a real PostgreSQL (Testcontainers).
