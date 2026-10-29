# ADR-001: NestJS modular monolith

**Context.** The brief asks for one REST API with five capabilities, built in 48 hours, run
with one `docker compose up`.

**Decision.** One NestJS app with a module per capability (wallets, fx, ledger, deposits,
swaps, transfers, transactions, idempotency, health).

**Alternatives.** Express (less structure, more wiring by hand); microservices (network
calls between money steps would break single-transaction safety).

**Consequences.** One database transaction can cover a whole money movement. Modules keep
boundaries clear enough to split later. NestJS gives DI, validation pipes and Swagger
decorators out of the box.
