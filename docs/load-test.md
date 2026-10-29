# Load Test

I ran `scripts/load-test.mjs` against the compose stack on 29 Oct 2026. The point was to see
how the API holds up under parallel traffic, and above all whether money stays correct
while it does.

## How I ran it

- Machine: a Mac with 10 CPU cores; Docker had 10 CPUs and 7.7 GB of memory. PostgreSQL 17,
  the API and the Caddy proxy all ran in compose on the same machine as the load script,
  so the numbers include TLS through the proxy and compete with the script for CPU.
- Every request comes from one IP, so I raised the per-IP rate limits for the run and set
  them back afterwards:

```bash
RATE_LIMIT_PER_MINUTE=10000000 AUTH_RATE_LIMIT_PER_MINUTE=10000000 \
  MONEY_RATE_LIMIT_PER_MINUTE=10000000 LOG_LEVEL=warn docker compose up -d api
node scripts/load-test.mjs 15 32
docker compose up -d api
```

- The script creates 40 wallets, puts 1,000 USDx in each and swaps a little to cNGN. It then
  runs each scenario for 15 seconds with 32 parallel clients, every money write with its
  own `Idempotency-Key`.

## Results

| Scenario                                  | Requests | Per second | p50 ms | p95 ms | p99 ms | Errors |
| ----------------------------------------- | -------: | ---------: | -----: | -----: | -----: | -----: |
| `GET` balances (with USD values)          |   33,061 |      2,204 |   13.5 |   23.1 |   29.6 |      0 |
| `GET` history, 20 items                   |   30,497 |      2,033 |   14.4 |   25.8 |   31.6 |      0 |
| `GET /fx/rates`                           |   40,801 |      2,720 |   10.6 |   22.3 |   34.1 |      0 |
| `POST` deposits                           |   21,636 |      1,442 |   20.8 |   32.7 |   39.8 |      0 |
| `POST` transfers between random wallets   |   18,194 |      1,213 |   23.5 |   44.4 |   77.2 |      0 |
| `POST` transfers, all from one hot wallet |    9,091 |        606 |   44.1 |   92.8 |  116.0 |      0 |

"Errors" means anything other than `200` or `201`. A second run before I moved the code into
`src/modules` gave numbers within 10% of these.

## 1,000 clients at once

The same script with 1,000 parallel clients (`node scripts/load-test.mjs 15 1000`):

| Scenario                                  | Requests | Per second | p50 ms | p95 ms | p99 ms | Errors |
| ----------------------------------------- | -------: | ---------: | -----: | -----: | -----: | -----: |
| `GET` balances (with USD values)          |   25,131 |      1,675 |    546 |  1,005 |  1,901 |      0 |
| `GET` history, 20 items                   |   24,850 |      1,657 |    631 |    796 |    837 |      0 |
| `GET /fx/rates`                           |   36,114 |      2,408 |    394 |    760 |    846 |      0 |
| `POST` deposits                           |   16,813 |      1,121 |    936 |  1,142 |  1,178 |      0 |
| `POST` transfers between random wallets   |   13,662 |        911 |  1,141 |  1,486 |  1,671 |      0 |
| `POST` transfers, all from one hot wallet |    7,654 |        510 |  2,117 |  2,447 |  2,501 |      0 |

Throughput stays about where it was at 32 clients; what grows is the wait. One API process
with a pool of 10 database connections serves requests as fast as it can, and the rest queue.
Nothing failed, the money was unchanged and the ledger check was clean afterwards.

The first run at 1,000 clients found two bugs in the proxy setup, both fixed:

1. **502s from closed connections.** Node closes an idle keep-alive connection after 5 s, and
   Caddy sometimes sent a request on one just as Node closed it ("connection reset by peer").
   The API now keeps idle connections for 65 s and Caddy drops them after 30 s, so the proxy
   always closes first.
2. **502s from running out of ports.** Caddy kept only 32 idle connections to the API, so at
   1,000 clients it opened and closed thousands and ran out of local ports ("cannot assign
   requested address"); 6,895 requests failed in one run. It now keeps up to 2,048 idle
   connections.

During that run the outbox fell behind: about 58,700 events waited to be delivered at the
end, and they were all delivered within about 20 seconds afterwards. Events are late under
that much load, never lost.

## Money checks after the run

- The USDx held by the 40 wallets was the same before and after the transfer scenarios
  (39,970 USDx), so no transfer created or lost money.
- Every balance in the database equalled the sum of its ledger lines, about 97,000
  transactions in all. The only exception was one wallet my own QA script had written to
  directly with SQL earlier the same day, to test USD values; it has no transactions.
- No balance was negative.

## What the numbers say

- Reads and writes to different wallets scale well; each write is one short transaction.
- Transfers from one hot wallet run at about half the speed of transfers between random
  wallets. That is the row lock doing its job: every transfer from that wallet waits its turn
  on the same balance row. A real product with very hot accounts would need sharded balances
  or a queue in front of them.
- This was one machine, one run, with the load script on the same machine. Treat it as a
  sanity check, not a capacity plan.
