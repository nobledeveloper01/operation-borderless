# Decisions

Each record says what I decided, why, and what it costs.

| ADR                                          | Decision                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| [001](ADR-001-modular-monolith.md)           | NestJS modular monolith                                                     |
| [002](ADR-002-postgresql.md)                 | PostgreSQL for money data                                                   |
| [003](ADR-003-typeorm.md)                    | TypeORM with hand-checked migrations                                        |
| [004](ADR-004-integer-money.md)              | Integer minor units for money                                               |
| [005](ADR-005-no-redis.md)                   | No Redis or queue                                                           |
| [006](ADR-006-idempotency-in-transaction.md) | Idempotency key claimed inside the money transaction                        |
| [007](ADR-007-fx-provider.md)                | Two free daily FX sources, fail closed on stale rates                       |
| [008](ADR-008-authentication.md)             | Account sessions and wallet keys                                            |
| [009](ADR-009-encryption.md)                 | Encryption in transit and at rest; no message-level body encryption for now |
| [010](ADR-010-modules-and-common.md)         | Features in `src/modules`, shared code in `src/common`                      |
| [011](ADR-011-fx-provider-terms.md)          | Keep ExchangeRate-API despite its no-redistribution clause                  |
| [012](ADR-012-retry-policies.md)             | One retry helper with full-jitter exponential backoff                       |
| [013](ADR-013-ops-metrics-ledger-check.md)   | Metrics and a ledger check inside the API, behind an operator token         |
