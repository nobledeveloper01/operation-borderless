# Project Statement

## Name

Borderless. Repository: `operation-borderless`.

## Summary

Borderless is a backend-only sandbox that simulates an FX and remittance platform. Wallets
hold five mock stablecoins. Clients deposit, swap and transfer money through a REST API, and
read balances, history and FX rates. Reviewers judge the API, the data model and the tests.

## Background

The assessment brief (Operation Borderless, The Tonic Technologies) asks for the backend of a
"stablecoin-powered cross-border payment sandbox" built in 48 hours (brief, p.1). Moving money
across currencies is slow and opaque; the sandbox shows how an API can do it instantly and
with a clear record of every rate applied.

## Problem statement

A client needs one API that can:

1. create wallets that hold cNGN, cGHS, cXAF, USDx and EURx;
2. take deposits in any of them;
3. swap one stablecoin for another at an FX rate;
4. send money to another wallet, converting when the currencies differ;
5. show history, live balances and current rates.

Every money movement must be exact, never run twice, never make a balance negative, and say
which rate it used and when that rate was fetched.

## Proposed solution

A NestJS modular monolith on PostgreSQL. Balances are integers in the smallest unit. Every
money operation runs in one database transaction, locks the balance rows it changes, writes a
transaction record and ledger lines, and stores its idempotency key in the same transaction.
FX rates come from two free live daily sources; a rate more than 26 hours past its
publication never moves money. Everything starts with `docker compose up`.

## Objectives

- Cover all five capabilities in the brief (p.2–3) with correct money handling.
- Prove the money rules with automated tests against a real PostgreSQL, including
  concurrent and repeated requests.
- Ship every deliverable on p.3: public repo, compose, `yarn test`, an OpenAPI spec committed
  to the repo, and the README sections the brief lists.

## Actors and stakeholders

| Actor       | Role                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------- |
| API client  | Any program calling the API on behalf of a wallet holder, with a session token or a wallet key. |
| FX provider | External source of live rates.                                                                  |
| Reviewer    | Tonic engineers who run the project and read the code, tests and README.                        |
| Candidate   | Builds and submits the project.                                                                 |

## Scope

In scope:

- wallets identified by email or mobile number, one wallet per identifier;
- balances in five stablecoins and a total in USD;
- simulated deposits, swaps and transfers;
- transaction history with pagination and filters, and lookup by ID;
- current rates for every pair with their refresh time;
- accounts with password login, rotating sessions and wallet API keys, with ownership checks
  on every wallet route (added beyond the brief, see [authentication.md](authentication.md));
- idempotency, concurrency control and FX failure handling;
- OpenAPI spec, Docker setup, automated tests, README and design documents.

Out of scope (brief: "no frontend"; no auth required):

- a frontend or admin portal;
- email or SMS verification, password reset, MFA and roles;
- real blockchain, custody, KYC, real payment rails or withdrawals;
- spreads, and limits beyond basic input caps (a 0.5% conversion fee was added later, ADR-014);
- deployment to a hosted environment (brief: "A deployed URL is not required").

## Constraints

- 48 hours from receipt of the brief.
- Node.js LTS, TypeScript strict, Express or NestJS, Yarn, ESLint, Prettier, Jest or Vitest
  with Supertest, Docker and docker compose (brief, p.1–2).
- Free FX data only. The provider must cover NGN, GHS and XAF.

## Dependencies

- Docker on the reviewer's machine.
- Internet access for live rates. Without it, swaps and transfers are refused unless the
  fixed table is turned on for a demo.
- GitHub for the public repository.

## Assumptions

Listed with their decision status in [plan.md](plan.md#assumptions).

## Risks

| Risk                              | Effect                                    | Response                                                                       |
| --------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------ |
| FX provider down, slow or changed | Swaps and transfers can't price           | Timeout, bounded retry, second live source, `503` once rates are over 26 h old |
| Floating-point money errors       | Wrong balances                            | Integer minor units and exact `bigint` maths only                              |
| Double processing on retries      | Money created or lost                     | Idempotency key stored in the money transaction                                |
| Races between parallel requests   | Negative balances or lost updates         | Row locks in a fixed order and a `CHECK (amount >= 0)`                         |
| Tests need a database             | `yarn test` fails on a reviewer's machine | Testcontainers starts PostgreSQL; documented Docker requirement                |
| Time                              | Missing deliverables                      | Mandatory items first; testing and README time protected                       |

## Success criteria

- `docker compose up` starts the API and database and runs migrations with no extra step.
- `yarn test` passes from a clean checkout with Docker running.
- Every mandatory requirement in [requirements-traceability.md](requirements-traceability.md)
  has a passing test as evidence.
- The committed OpenAPI file matches the running API.
- The README covers every item the brief lists on p.3.
