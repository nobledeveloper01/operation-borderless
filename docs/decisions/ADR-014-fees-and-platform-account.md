# ADR-014: A 0.5% conversion fee, booked with rounding to a platform account

**Context.** The first version charged nothing and let the sub-millionth left over by rounding
down disappear. Real remittance products earn a fee per corridor and must account for every
unit they keep. You chose 0.5% on conversions as the default.

**Decision.**

- Swaps and cross-currency transfers pay `FEE_BPS` basis points, 50 by default (0.5%), at most 1000. `FEE_BPS_BY_PAIR` overrides single directions, for example `cNGN:cGHS=25,USDx:EURx=0`;
  a bad entry stops the API at startup. Same-currency transfers and deposits are always free.
- The fee is taken from the amount sent, in the source currency, rounded **up** to the next
  millionth. The rest is converted and rounded **down**, as before.
- Rounding down can leave whole source millionths that bought nothing (1 cNGN to USDx leaves
  130 of them at today's rate). Those are booked too, as `rounding`. Only the part below one
  millionth of the source currency is still not booked.
- Each transaction stores `fee_bps`, `fee_amount` and `rounding_amount`, and the API shows them
  as `feeBps`, `feeAmount` and `roundingAmount`. `fromAmount` is still what left the sender, and
  `toAmount` what the receiver got.
- The platform account is the append-only table `platform_entries` (one `fee` and one
  `rounding` row per transaction at most), written in the same database transaction as the
  movement. Its balance is the sum of its entries; `GET /api/v1/ops/platform-account` shows it.
- The ledger check also compares, per currency, the fees and rounding recorded on transactions
  with what the platform entries hold.

**Why not a platform wallet with a balance row.** Every conversion in a currency would then lock
the same balance row, so conversions would queue one at a time. The load test showed that one
hot wallet runs at about half the speed of spread-out traffic. Append-only rows need no lock.

**Why round the fee up and the conversion down.** Both directions favour the platform by less
than one millionth, so the platform can never pay out more than it took in, and the customer
sees the exact fee before the conversion.

**Consequences.** Tests that check exact conversion maths run with `FEE_BPS=0`; the fee tests
run with the default and an override. The quote endpoint uses the same pricing code, so a
quote and the real movement can't disagree. Withdrawing platform money is out of scope.
