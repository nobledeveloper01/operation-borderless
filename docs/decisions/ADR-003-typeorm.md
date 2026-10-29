# ADR-003: TypeORM with hand-checked migrations

**Context.** We need migrations, row locks inside transactions, and a few raw SQL statements
(`ON CONFLICT`, ordered `FOR UPDATE`).

**Decision.** TypeORM 1.1 via `@nestjs/typeorm`, `synchronize` off, migrations written and
reviewed by hand. Raw SQL with `$n` parameters where it is clearer.

**Alternatives.** Prisma (good migrations, but row locks need raw SQL and interactive
transactions add overhead); Kysely or plain `pg` (more control, more code to write in 48 h).

**Consequences.** `bigint` columns come back as strings; a transformer turns them into
`BigInt`. Migrations are checked by running them in every test run.
