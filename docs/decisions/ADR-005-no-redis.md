# ADR-005: No Redis or queue

**Context.** The brief allows Redis, BullMQ or RabbitMQ "only where it earns its place" (p.2).

**Decision.** Use none. FX snapshots are stored in PostgreSQL and kept in memory; the refresh
and key-cleanup jobs run in-process on plain timers (`setTimeout`, `setInterval`) that
stop on shutdown; locking uses PostgreSQL.

**Why.** All money operations are synchronous and local. A cache would add a second source
of truth for rates; a queue would add moving parts with nothing to process.

**Consequences.** With several API replicas each would refresh rates itself (harmless: same
data, one row each). A shared lock or a single scheduler would be needed at scale.
