# Product Requirements Document

## Vision

A small, exact and predictable API for moving stablecoins between currencies and wallets,
where every balance change can be explained by a transaction and a rate.

## Objectives

1. A client can hold, receive, convert and send five stablecoins.
2. No request can create or destroy money: no float errors, no double processing, no
   negative balance.
3. Every conversion shows the rate used, where it came from and when it was fetched.

## Actors

| Actor                            | Needs                                                                              |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| API client (wallet holder's app) | Create a wallet, move money, see balances and history                              |
| Reviewer                         | Run the project with one command, read clear docs, see tests prove the money rules |

The brief doesn't require authentication (p.2). I add it so only a wallet's holder can use
it; see [authentication.md](authentication.md).

## Supported stablecoins

| Code | Pegged to                       | Notes                  |
| ---- | ------------------------------- | ---------------------- |
| cNGN | Nigerian naira (NGN)            |                        |
| cGHS | Ghanaian cedi (GHS)             |                        |
| cXAF | Central African CFA franc (XAF) | XAF is pegged to EUR   |
| USDx | US dollar (USD)                 | Base for the USD total |
| EURx | Euro (EUR)                      |                        |

Each stablecoin is valued 1:1 with its fiat currency for FX purposes (assumption A-03).

## User journeys

**J1. Open a wallet and fund it.** The client creates a wallet with an email. The API returns
the wallet with five zero balances. The client deposits 50,000 cNGN. The balance shows
50,000 cNGN and the USD total.

**J2. Convert.** The client swaps 10,000 cNGN for USDx. The API prices it at the current rate,
moves both balances in one step and returns the transaction with the rate and its time.

**J3. Send abroad.** The client sends 20 USDx from wallet A to wallet B, choosing cGHS as the
currency B receives. B gets the converted amount. Both wallets show the transfer in history,
as sent and as received.

**J4. Retry safely.** The client's network drops after sending a swap. It sends the same
request with the same `Idempotency-Key`. The API returns the first result and moves no money.

**J5. Check rates.** The client reads every pair's rate, the source, and when it was refreshed.
If the main provider is down, rates come from a second live source. If both are down past a
daily publication, the API shows the last rates as stale and refuses swaps and transfers.

## User stories

| ID    | Story                                                                                         | Priority                |
| ----- | --------------------------------------------------------------------------------------------- | ----------------------- |
| US-01 | As a client, I create a wallet with an email or mobile number, so I can hold stablecoins.     | Must                    |
| US-02 | As a client, I get a clear error if that email or number already has a wallet.                | Must                    |
| US-03 | As a client, I see every balance and the total in USD.                                        | Must                    |
| US-04 | As a client, I deposit any supported stablecoin and see the balance change at once.           | Must                    |
| US-05 | As a client, I swap one stablecoin for another in my wallet at the current rate.              | Must                    |
| US-06 | As a client, I am refused if a swap or transfer would overdraw my balance.                    | Must                    |
| US-07 | As a client, I can retry a money request without it running twice.                            | Must                    |
| US-08 | As a client, I send money to another wallet in the same or another stablecoin.                | Must                    |
| US-09 | As a client, I list my transactions newest first, paged, filtered by type and currency.       | Must                    |
| US-10 | As a client, I fetch one transaction by ID.                                                   | Must                    |
| US-11 | As a client, I read all current rates and when each was refreshed.                            | Must                    |
| US-12 | As a client, I preview what a swap or transfer would give before sending it.                  | Could                   |
| US-13 | As a client, I find a wallet by email or mobile number.                                       | Could                   |
| US-15 | As a holder, I log in with my identifier and password and stay signed in with refresh tokens. | Must (beyond the brief) |
| US-16 | As a holder, I log out and my session stops working at once.                                  | Must (beyond the brief) |
| US-17 | As a holder, I create and revoke API keys for scripts that act on my wallet.                  | Must (beyond the brief) |
| US-18 | As a holder, no one else can read or move my wallet's money.                                  | Must (beyond the brief) |
| US-14 | As an operator, I check the API and database are healthy.                                     | Should                  |

## Business rules

| ID    | Rule                                                                                                           | Source                                         |
| ----- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| BR-01 | One wallet per email and one per mobile number.                                                                | Brief p.2                                      |
| BR-02 | Every wallet has a balance for each of the five stablecoins.                                                   | Brief p.2                                      |
| BR-03 | A deposit raises the balance at once and creates a transaction record.                                         | Brief p.2                                      |
| BR-04 | A swap stays inside one wallet and uses two different stablecoins.                                             | Brief p.2; same-currency refusal inferred      |
| BR-05 | No swap or transfer may make a balance negative.                                                               | Brief p.2 (swaps); inferred for transfers      |
| BR-06 | The same request is never processed twice.                                                                     | Brief p.2 (swaps); applied to all money writes |
| BR-07 | Transfers in different currencies convert at the current rate.                                                 | Brief p.2                                      |
| BR-08 | A transfer records sender, receiver, both amounts and currencies, the rate and a timestamp.                    | Brief p.2                                      |
| BR-09 | A wallet can't transfer to itself (use a swap).                                                                | Inferred                                       |
| BR-10 | Amounts are positive, have at most 6 decimal places, and are capped per operation.                             | Inferred (A-04, A-05)                          |
| BR-12 | Only the wallet's owner (session or wallet key) can read it or move its money; transfers can go to any wallet. | Beyond the brief                               |
| BR-13 | Passwords are hashed with argon2id; tokens and keys are stored only as hashes.                                 | Beyond the brief                               |
| BR-11 | No fees or spreads. Rounding of converted amounts is down, so no money is created.                             | Inferred (A-06)                                |

## Features and MoSCoW

**Must (mandatory in the brief):** wallets, unique identifiers, balances with USD total,
deposits, swaps with live rates and fallback, overdraft refusal, idempotency, transfers with
conversion and full records, history with pagination and filters, transaction by ID, rates
with refresh times, Docker compose, `yarn test`, OpenAPI spec, README.

**Must (beyond the brief):** accounts, login, refresh rotation, logout, wallet keys,
ownership checks.

**Should (recommended, cheap, raises quality):** ledger lines per balance change, health and
readiness checks, structured logs with request IDs, rate limiting, security headers, CI
running lint, type check and tests, OpenAPI drift test.

**Could (only if time is left):** quote endpoint (US-12), wallet lookup (US-13), Postman
collection in addition to OpenAPI.

**Won't (this assessment):** email/SMS verification, password reset, MFA, roles, frontend, fees, withdrawals, KYC, real chains,
webhooks, Redis or a queue, deployment.

## MVP

All "Must" items plus ledger lines, health checks, logs and rate limiting. "Could" items are
added only after every mandatory test passes and the README is done.

## Success metrics

- All mandatory requirements have passing tests (traceability matrix).
- Concurrency test: parallel swaps and transfers never overdraw and the ledger sums match
  balances.
- Idempotency test: parallel and repeated requests with one key create one transaction.
- A reviewer goes from clone to a working Swagger page with one command.
