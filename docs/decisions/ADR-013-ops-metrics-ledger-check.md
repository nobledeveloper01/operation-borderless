# ADR-013: Metrics and a ledger check inside the API, behind an operator token

**Context.** I wanted the API to show how it is doing (traffic, latency, retries, FX age) and to
prove, on demand, that every balance still equals its ledger lines. You asked for this to run
internally, with no outside service.

**Decision.**

- `GET /api/v1/ops/metrics` serves Prometheus text built in-process by `prom-client`, a library,
  not a service. Nothing is pushed anywhere; anything that can read Prometheus text can scrape
  it, and `curl` works too.
- `GET /api/v1/ops/ledger-check` compares every balance with the sum of its ledger lines and
  counts transactions with no ledger lines, all inside one `REPEATABLE READ` read-only
  snapshot. The same check runs every hour, logs an error when it finds a problem and sets the
  `borderless_ledger_mismatches` gauge.
- Both need `X-Ops-Token` matching `OPS_TOKEN` (at least 32 characters), compared as SHA-256
  hashes in constant time. Wallet sessions and wallet keys are refused. With no token set, the
  routes answer `404`, as if they did not exist. Production refuses a token starting with
  `local-`, which is what the compose file ships.

**Metrics.**

| Metric                                           | What it shows                                    |
| ------------------------------------------------ | ------------------------------------------------ |
| `borderless_http_requests_total`                 | Requests by method, route template and status    |
| `borderless_http_request_duration_seconds`       | Latency histogram by method and route template   |
| `borderless_money_movements_total`               | Deposits, swaps and transfers, counted on commit |
| `borderless_idempotent_replays_total`            | Retries answered from a stored result            |
| `borderless_db_conflict_retries_total`           | Money transactions rerun after a conflict        |
| `borderless_fx_refreshes_total`                  | FX refreshes by outcome                          |
| `borderless_fx_rate_age_seconds`                 | Age of the rates in use                          |
| `borderless_fx_rates_fresh`                      | 1 when conversions can be priced                 |
| `borderless_ledger_mismatches`                   | Mismatches found by the last ledger check        |
| `borderless_ledger_last_check_timestamp_seconds` | When the last check finished                     |
| `borderless_process_*`, `borderless_nodejs_*`    | CPU, memory, event-loop lag, handles             |

**Why these choices.**

- Labels use route templates (`/api/v1/wallets/:walletId`), never real paths, so wallet IDs
  never appear in metrics and the number of series stays small.
- Money movements are counted after the commit, so a deadlocked attempt that was rolled back
  and rerun counts once.
- The registry is a Nest provider, not a module-level global, so every app instance (including
  each test app) has its own counters.
- A separate token keeps operators and wallet holders apart: no wallet credential can read
  metrics, and an operator token can't move money.

**Library.** Metrics use `@prometheus-io/client`, the Prometheus project's own Node client,
which replaced the deprecated `prom-client` (same API, Apache-2.0). Its default metrics include
event-loop utilisation, which samples on a 100 ms timer per registry that the library gives no
way to stop. The timer is `unref`'d, so it never keeps the process alive; production has one
registry, and only test runs that start many apps have more than one.

**Not done.** No Grafana, alerting rules or tracing backend: they are outside services.
Metrics live in one process, so with several API instances each must be scraped.
