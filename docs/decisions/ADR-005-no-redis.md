# ADR-005: No Redis or queue

**Context.** The brief allows Redis, BullMQ or RabbitMQ "only where it earns its place" (p.2).

**Decision.** Use none. FX snapshots are stored in PostgreSQL and kept in memory; the refresh
and key-cleanup jobs run in-process on plain timers (`setTimeout`, `setInterval`) that
stop on shutdown; locking uses PostgreSQL.

**Why.** All money operations are synchronous and local. A cache would add a second source
of truth for rates; a queue would add moving parts with nothing to process.

**How it holds up without them.** With 1,000 clients at once, one API process served 500 to
2,400 requests a second with no errors and the books balanced ([load test](../load-test.md)).
Requests wait their turn for one of 10 database connections, and a request that would wait
too long for a lock answers `503 SERVICE_BUSY` instead of hanging. The rate limiter refuses
floods from one address before they reach the database. Events go through a Postgres outbox
(ADR-016), so a burst makes notices late, not lost.

**Where Redis or a queue would earn its place, and when to add it.**

- **Several API instances.** The rate limiter and the FX refresh timer live in each process.
  With more than one instance, Redis would hold one shared rate-limit count, and a lock (in
  Redis or Postgres) would let one instance refresh rates.
- **Far more events.** The outbox worker delivers about 1,500 events a second next to the API.
  If notices had to be instant at much higher volumes, or went to many consumers, a broker
  such as RabbitMQ would carry them, still fed from the outbox so nothing is lost.
- **Hot wallets.** One wallet that sends constantly is limited by its own row lock (about 500
  transfers a second here). A queue in front of it would smooth bursts, but the real fix is
  splitting that balance, which no cache or queue does for you.

**Consequences.** Today: one instance, no extra services, and nothing to keep in sync with the
database. Scaling out means adding Redis for the limiter and a lock for the FX job first.
