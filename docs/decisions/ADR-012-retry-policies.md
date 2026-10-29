# ADR-012: One retry helper with full-jitter exponential backoff

**Context.** FX fetches already retried with jitter, in their own loop. Money transactions did
not retry at all: a Postgres deadlock (`40P01`) or serialization failure (`40001`) became
`503 SERVICE_BUSY` and the client had to try again.

**Decision.** `src/common/retry/retry.ts` holds `withRetry(work, policy, shouldRetry)` and named
policies. Each wait is full jitter: a random time between zero and
`min(maxDelay, baseDelay × 2^attempt)`.

| Policy              | Used by                       | Retries |   Base |    Cap | Retries on                       |
| ------------------- | ----------------------------- | ------: | -----: | -----: | -------------------------------- |
| `FX_FETCH_RETRY`    | FX provider fetches           |       2 | 500 ms |    4 s | network errors, timeouts, 5xx    |
| `DB_CONFLICT_RETRY` | every deposit, swap, transfer |       2 |  20 ms | 200 ms | deadlock and serialization codes |

Not retried on purpose:

- an FX `429`: the next refresh waits 30 minutes, longer than the provider's 20-minute block;
- a lock timeout (`55P03`) or statement timeout (`57014`): the request already waited 3 or 5
  seconds, so it answers `503` at once instead of holding a connection longer;
- any business refusal (`422`) or validation error (`400`).

The scheduled FX refresh has its own longer schedule (15 minutes after a failure, ±10%
jitter), described in [money handling](../money-handling.md#refresh-and-fallback).

**Why a money transaction can be retried safely.** The whole transaction is retried from the
start, including the idempotency-key claim. Postgres has already rolled back the failed
attempt, so nothing from it remains: no key, no balance change, no ledger line.

**Why full jitter.** Parallel requests that failed together would otherwise retry together and
collide again. Full jitter spreads them out and gives the best spread for the least total wait.

**Consequences.** Clients see fewer `503`s under contention. Each retry is logged with its
attempt number and wait. Tests check the delays, the give-up point and that a retried
deposit moves money exactly once.
