# Pricing-Component Ordering & Rounding

**Status:** Final (WS-PRECEDENCE).
**Owners:** AP / Finance Engine.
**Source of truth:** `server/packages/services/business/ap/pc-precedence.ts`.

This spec pins down two cross-cutting policies for the pricing-component
waterfall so audit reconciliation is deterministic and reproducible across
re-orderings, repostings, and downstream report exports.

---

## 1. Canonical waterfall sequence

Every `document.pricing_component` row carries a `sequence` integer that orders
its evaluation in the line waterfall. Lower runs earlier; the engine sums
`computed_amount` in `sequence` order using the sign convention encoded by
`term_type`.

When the writer omits `sequence`, the service applies a term-type-derived
default. The defaults reserve one decade per term type so authors can
interleave (e.g. multiple tax components at 310 / 320) without re-numbering.

| term_type           | default `sequence` | rationale |
|---------------------|--------------------|-----------|
| `discount`          | 100                | applies first — reduces taxable base |
| `charge`            | 200                | adds freight / packing before tax |
| `tax`               | 300                | computed on the post-discount, post-charge net |
| `withholding`       | 400                | last reduction — withholds on the taxed net by default |
| `retention`         | 500                | settlement-time withhold (later than WHT) |
| `principal_marker`  | 900                | terminal audit anchor |

### WHT base override

The default places `withholding` *after* `tax`, i.e. WHT applies to the
**taxed net** (`subtotal − discount + charge + tax`). India TDS commonly
withholds on **gross** (pre-tax). That override is encoded in
`control.tax_rate_schedule.wht_basis`:

| `wht_basis`             | semantic |
|-------------------------|----------|
| `GROSS`                 | base = line `net_amount` (pre-tax, pre-charge) |
| `NET_OF_INDIRECT_TAX`   | base = net + charges − discount (post-tax-credit but pre-tax) |
| `PAYMENT_ONLY`          | excluded from invoice-time computation; deferred to payment |

The PC `sequence` stays at 400; the engine resolves the base from
`wht_basis` and feeds that base into the `computeLineTax` per-component
calculator. **Authors should not re-sequence WHT to alter its base** — that
would mis-classify the policy and break the audit trail.

---

## 2. Rounding policy

### Banker's rounding (round-half-even)

All application-layer math uses **banker's rounding** at the following
precisions:

| layer                                | decimals | helper |
|--------------------------------------|----------|--------|
| `pricing_component.computed_amount`  | 4        | `roundPc(value)` |
| JE posting amounts / line caches     | 2        | `roundPosting(value)` |

Examples:

```
roundHalfEven(0.005, 2) === 0.00   // ties round to even
roundHalfEven(0.015, 2) === 0.02
roundHalfEven(0.025, 2) === 0.02
roundHalfEven(0.035, 2) === 0.04
```

The DB helper `ledger.calculate_tax` still uses `ROUND_HALF_UP` for legacy
parity with existing posted rows. New application-layer math that doesn't
round-trip through `calculate_tax` (apportionment, JS-side previews, JE
balancing remainders) uses banker's rounding.

Banker's rounding reduces statistical bias across large apportionments
(thousands of lines per invoice are not uncommon in long-tail AP). The
deviation from `ROUND_HALF_UP` is at most 1 minor-currency-unit per tied
allocation, which is within posting tolerance.

### Apportionment residue assignment

When a header-scope PC splits across N lines and the rounded per-line
shares don't reconstitute the original `totalAmount`, the residue
(`totalAmount − Σ allocated`) is assigned per the following rule:

> **Residue → line with the largest `net_amount`.**
> **Tie-break: smallest `line_no` (ASC).**

Rationale:

- Assigning to the largest line minimizes the relative-error distortion
  (`|residue| / line.net_amount` stays smallest).
- `line_no` ASC is a stable, deterministic tie-break independent of input
  ordering — the audit log can reproduce the assignment from any export.

This replaces the prior "last row absorbs remainder" rule, which gave
audit-time surprises when line iteration order was non-canonical (e.g. when
lines were re-fetched after a sort change).

### Worked example

```
totalAmount = 100.00
lines       = [
  { line_no: 10, net_amount: 100.00 },
  { line_no: 20, net_amount: 100.00 },
  { line_no: 30, net_amount: 100.00 },
]
policy      = "value"   // shares all equal 1/3

per-line share = 33.333333…
rounded (2dp)  = 33.33 each → Σ = 99.99
residue        = 100.00 − 99.99 = 0.01
target        = argmax(net_amount) = all tie at 100.00
              → tie-break: argmin(line_no) = 10
final         = [33.34, 33.33, 33.33]
```

---

## 3. Implementation references

- Helper module: `server/packages/services/business/ap/pc-precedence.ts`
- Wired in: `pricing-component.service.ts` (`createComponent` default
  sequence, `apportionToLines` residue policy)
- WHT-specific base resolution: `tax-calculation.service.ts` (consumes
  `tax_rate_schedule.wht_basis`)
- Test coverage (WS-G): `pc-precedence.test.ts` — banker's rounding tied
  values, residue tie-break across permuted inputs, degenerate-basis
  rejection.
