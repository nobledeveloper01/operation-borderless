# ADR-020: Redis and BullMQ for shared rate limits, scheduled jobs and event delivery

**Supersedes** [ADR-005](ADR-005-no-redis.md).

**Context.** ADR-005 kept Redis and queues out, because one process needed neither. You chose
to add them so the API can run as several instances, as a production deployment would. The
brief allows Redis, BullMQ or RabbitMQ "only where it earns its place", so each use below
solves a problem that several instances really have.

**Decision.**

| Use                 | Problem with several instances before                                         | Now                                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Rate-limit counts   | Each process counted alone, so two instances let a client in twice as often   | One count per client in Redis, updated by one atomic script (count, expire, block)                                         |
| Scheduled jobs      | Every process ran the FX refresh, ledger check and cleanups on its own timers | BullMQ job schedulers: one per job, run by one worker per tick                                                             |
| FX refresh          | Each process would call the providers                                         | A worker checks every minute; the next due time is in Redis behind a short lock, so racing workers call the providers once |
| Rates in API memory | Only the process that refreshed knew the new rates                            | The worker publishes on Redis; API instances reload at once, and every minute in case they missed it                       |
| Event delivery      | One loop per process polled the outbox table                                  | A relay moves due events into a BullMQ queue (job ID = event ID); workers deliver them with retries                        |

Roles: one image, `APP_ROLE=api` (HTTP only), `worker` (queues and jobs, no HTTP) or `all` (both,
for tests and a single process). Compose runs one `api` and one `worker`; either can be scaled.
Only the API role runs migrations, so two containers never migrate at once. The worker's health
check reads a heartbeat it writes to Redis every 10 seconds.

**What stays in Postgres, and why.** Balances, the ledger, idempotency keys, quotes and the
outbox table. Each must commit in the same transaction as the money, which Redis can't join.
The outbox table stays the record of truth: a job lost from Redis is queued again after five
minutes, and the event ID as job ID means it is never queued twice.

**When Redis is down** (you chose this): reads and health checks keep working without a limit;
deposits, swaps, transfers, quotes, sign-up, login, refresh and creating a wallet key answer
`503 SERVICE_BUSY` until it is back, so nobody can flood money routes while the limit can't be counted. Jobs and notices
wait and then catch up. The API starts without Redis, and commands fail within half a second
instead of queueing behind it. Revoking a key and logging out stay open on purpose, so a leaked
key can still be cut off during an outage.

**Measured.** With 1,000 clients, two API instances and two workers served reads about twice as
fast as one process (balances 3,499 a second against 1,675). Money writes were about a third
slower, because both APIs share one Postgres and the workers now deliver events during the run.
The outbox kept up: 521 events were waiting when the load stopped, delivered within a second,
against 58,700 for the single process. No errors, and the books balanced. Writes scale with the
database, not with API instances ([load test](../load-test.md)).

**Proved by tests.** Two app instances share one rate limit; a Redis outage pauses money and
sign-in routes but not reads; two workers keep one scheduler per job and run a job once; racing
FX refreshes call the provider once; an API instance reloads rates when a worker publishes; two
instances relaying and delivering at once deliver every event exactly once; an API-role
instance starts with Redis down; an event the queue gives up on early is parked at once, and one
whose failure was never recorded is parked when the relay finds its failed job.

**Found in review and fixed.** The rates subscription was awaited on a client that queues
commands while Redis is away, so an API-role instance never finished starting; it now runs in
the background. BullMQ fails a job outright after repeated stalls, and a failed job with the
same ID made the relay's requeue a silent no-op, so an event could stay undelivered for good;
the worker now treats that failure as final, and the relay parks an event whose job failed and
requeues one whose job is done or gone. The FX lock carries a random owner token and is deleted
only by its owner. Queue counts for metrics are skipped while the shared client is down, and
queues and workers finish connecting (at most 2 seconds) before closing, because BullMQ drops
its error listeners on close and an unfinished setup then failed unhandled.

**Consequences.** One more service to run and secure (`REDIS_PASSWORD`, never published outside
the compose network). Metrics stay per process; queue lengths and the last ledger check are read
from Redis, so the API's `/ops/metrics` shows them whichever worker did the work. One database
belongs to one environment: two environments sharing a database with different `QUEUE_PREFIX`
values would claim each other's events (the tests, which do share one, take back their own).
BullMQ brings in `cron-parser` 4, which npm marks deprecated; it is not a vulnerability, and the
schedulers use fixed intervals, not cron.
