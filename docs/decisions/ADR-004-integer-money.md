# ADR-004: Integer minor units for money

**Context.** The brief stresses "correct money handling" (p.3).

**Decision.** Amounts are `bigint` with 6 decimals in the database and `BigInt` in code. The
API takes and returns decimal strings. FX maths uses `decimal.js`; converted amounts round
down to 6 decimals; stored rates have 10 decimals.

**Alternatives.** `numeric` columns with decimal.js everywhere (also exact, but easier to leak
into floats in JS); JS `number` (unsafe).

**Consequences.** No float ever touches money. Rounding remainders under 0.000001 are not
booked (documented).
