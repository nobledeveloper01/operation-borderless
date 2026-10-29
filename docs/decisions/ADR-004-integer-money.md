# ADR-004: Integer minor units for money

**Context.** The brief stresses "correct money handling" (p.3).

**Decision.** Amounts are `bigint` with 6 decimals in the database and `BigInt` in code. The
API takes and returns decimal strings. FX maths is exact `bigint` arithmetic
(rates scaled by 10^10, rounded down since ADR-018); converted amounts round down to 6
decimals.

**Alternatives.** `numeric` columns with a decimal library (also exact, but easier to leak
into floats in JS); JS `number` (unsafe).

**Consequences.** No float ever touches money. Rounding remainders under 0.000001 are not
booked (documented).
