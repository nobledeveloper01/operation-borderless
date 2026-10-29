# ADR-018: Property-based tests for the money rules, and mutation testing to prove the tests bite

**Context.** Example tests check the cases I thought of. Money bugs live in the cases nobody
thought of: extreme rates, odd amounts, unlucky sequences. A passing suite also says nothing
about whether the tests would notice a broken line.

**Decision.**

- **Property-based tests with fast-check.** `test/unit/property/money.property.spec.ts`
  generates thousands of amounts, rates and fee rates and checks rules that must always hold:
  - formatting and parsing an amount gives it back;
  - the fee is never below its rate, and never more than a millionth above it;
  - a conversion never pays out more than the money after the fee is worth, and every whole
    source millionth is accounted for;
  - converting there and back never gains;
  - every pair inside the accepted rate range has a non-zero rate;
  - sending more never gets less.

  `test/api/money.property.api.spec.ts` sends random sequences of deposits, swaps and transfers
  through the real HTTP stack (fixed seed, 12 runs, up to 25 steps each). It checks that nothing
  answers `500` and that afterwards no balance is negative, every balance equals its ledger
  lines, and the platform entries match every fee.

- **Mutation testing with Stryker.** `yarn test:mutation` changes the money and retry code one
  small edit at a time (flipped comparisons, removed guards, emptied policies) and reruns the
  unit tests. A change that no test notices is a gap. The run takes about 15 seconds, runs in CI,
  and fails below 90%.

**What it found and fixed.**

1. **A round trip could gain money.** Cross rates were rounded half-even to 10 decimals, so
   about half of them rounded up. With the fee at 0, which a per-pair override allows, USDx to
   cNGN and back could come out ahead by up to about 7 parts in 100 million, roughly 67 USDx on
   a billion-unit swap. Cross rates now round **down**, like conversions, so a round trip can
   only shrink.
2. **A rate could price at zero.** Validation allowed per-USD rates from about 10^-12 to 10^15,
   so a broken feed could make a cross rate round to zero, and pricing would then crash with a
   `500`. Each per-USD rate must now be between 0.001 and 10,000,000, which keeps every cross
   rate between 10^-10 and 10^10.
3. **Untested guards.** The first mutation score was 78%: the errors for bad decimals,
   non-positive rates and negative amounts, the fee-pair pattern and the documented retry
   numbers had no test. They have now. The score is 96%; the mutants that survive change
   nothing a caller can see (for example `b < 0` against `b <= 0` before a division that throws
   on zero anyway).
4. **A flaky test.** A secret-storage test cut the wallet-key secret at its last underscore, but
   base64url secrets can contain underscores. It now uses the real key parser.

**Consequences.** Changing a money rule now means changing a property, which makes the rule
explicit. Mutation testing covers only code with fast unit tests; database code is covered by
the API tests and the ledger check instead.
