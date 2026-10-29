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
