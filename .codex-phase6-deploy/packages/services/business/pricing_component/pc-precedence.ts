/**
 * Pricing-Component Precedence + Rounding (WS-PRECEDENCE).
 *
 * Single source of truth for:
 *   1. Canonical waterfall sequence per term_type (100/200/300/400).
 *   2. Banker's rounding (round-half-even) helpers at 4dp and 2dp.
 *   3. Apportionment residue assignment policy: residue goes to the line
 *      with the largest net_amount; ties broken by line_no ASC. Documented
 *      so audit reconciles deterministically.
 *
 * Consumed by:
 *   - pricing-component.service.ts (apportionToLines, createComponent default
 *     sequence)
 *   - tax-calculation.service.ts (JE line construction)
 *   - WhtDrawer / TaxDrawer client-side preview parity (re-exported via
 *     packages/shared/ui-platform/content-ui/.../drawers/helpers.ts in a follow-up)
 *
 * Spec: docs/specs/pricing-component-ordering.md (added in WS-PRECEDENCE).
 */

// =============================================================================
// Canonical waterfall sequence per term_type
// =============================================================================
//
// Lower sequence = earlier in the waterfall. Default values chosen so each
// term type has its own decade and authors can interleave (e.g. multiple
// taxes at 310/320 still come before WHT at 400). Override allowed when a
// jurisdiction requires non-default ordering (e.g. India WHT on GROSS
// pre-tax, which is encoded via tax_rate_schedule.wht_basis='GROSS' rather
// than by reordering the PC waterfall).

export const PC_DEFAULT_SEQUENCE_BY_TERM_TYPE: Record<string, number> = Object.freeze({
  discount:          100,
  charge:            200,
  tax:               300,
  withholding:       400,
  retention:         500,
  principal_marker:  900,
});

/**
 * Resolve the default sequence for a given term_type. Callers can override
 * by supplying `input.sequence` explicitly; this helper is the fallback used
 * by createComponent when the caller leaves it blank.
 */
export function defaultSequenceFor(termType: string): number {
  return PC_DEFAULT_SEQUENCE_BY_TERM_TYPE[termType] ?? 100;
}

// =============================================================================
// Banker's rounding (round-half-even)
// =============================================================================
//
// Reduces statistical bias vs. ROUND_HALF_UP across large apportionments.
// Used at PC `computed_amount` capture (4dp) and JE posting (2dp). The DB
// helper ledger.calculate_tax uses ROUND_HALF_UP for legacy parity; this
// JS helper covers application-layer math that doesn't round-trip through
// the calculator.

/**
 * Banker's rounding (round-half-even) at a given decimal precision.
 *
 *   roundHalfEven(0.005, 2) === 0.00   // ties round to even
 *   roundHalfEven(0.015, 2) === 0.02
 *   roundHalfEven(0.025, 2) === 0.02
 *   roundHalfEven(0.035, 2) === 0.04
 *   roundHalfEven(-0.005, 2) === 0.00  // symmetric around zero
 */
export function roundHalfEven(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value;
  const factor   = 10 ** decimals;
  const scaled   = value * factor;
  const floored  = Math.floor(scaled);
  const diff     = scaled - floored;

  // Tolerance for floating-point representation of "exactly half"
  const EPSILON  = 1e-9;
  const isHalf   = Math.abs(diff - 0.5) < EPSILON;

  let rounded: number;
  if (isHalf) {
    // Tie: choose the even neighbor
    rounded = (floored % 2 === 0) ? floored : floored + 1;
  } else if (diff < 0.5) {
    rounded = floored;
  } else {
    rounded = floored + 1;
  }
  return rounded / factor;
}

/** Convenience: 4-decimal banker's rounding for PC `computed_amount`. */
export function roundPc(value: number): number {
  return roundHalfEven(value, 4);
}

/** Convenience: 2-decimal banker's rounding for JE / posting amounts. */
export function roundPosting(value: number): number {
  return roundHalfEven(value, 2);
}

// =============================================================================
// Apportionment residue policy
// =============================================================================
//
// When a header-scope PC splits across N lines and rounded shares don't
// reconstitute the original total exactly, the residue (totalAmount Ã¢Ë†â€™
// sum-of-rounded-shares) is assigned to:
//
//     argmax(net_amount) Ã¢â‚¬â€ tie-break: argmin(line_no)
//
// Rationale: assigning to the largest line minimizes the relative-error
// distortion ({{residue}} / line.net_amount stays smallest). line_no ASC
// is a stable, deterministic tie-break the audit log can reproduce.
//
// This replaces the prior "last row absorbs remainder" rule, which gave
// audit-time surprises when line order was non-canonical.

export interface ApportionLineInput {
  id:          string;
  line_no:     number;
  net_amount:  number;
  /** Quantity is required when basis='quantity'; ignored otherwise. */
  quantity?:   number;
}

export type ApportionPolicy = "value" | "quantity" | "equal";

export interface ApportionResultRow {
  id:        string;
  line_no:   number;
  allocated: number;
}

/**
 * Apportion `totalAmount` across `lines` per the chosen `policy`, rounding
 * each allocation to 2dp via banker's rounding. Residue is added to the row
 * with the largest net_amount (line_no ASC on tie). Returns rows in the
 * input order; sum(allocated) === totalAmount exactly (no fractional drift).
 *
 * Throws if `policy='value'` and all net_amounts are zero, or if
 * `policy='quantity'` and all quantities are zero Ã¢â‚¬â€ callers should switch
 * to 'equal' or fix the inputs.
 */
export function apportion(
  totalAmount: number,
  lines:       ApportionLineInput[],
  policy:      ApportionPolicy,
): ApportionResultRow[] {
  const n = lines.length;
  if (n === 0) return [];

  const sumValue = lines.reduce((s, l) => s + l.net_amount,    0);
  const sumQty   = lines.reduce((s, l) => s + (l.quantity ?? 0), 0);

  if (policy === "value" && sumValue === 0) {
    throw new Error(
      "APPORTION_DEGENERATE_BASIS: cannot apportion by value when all net amounts sum to zero. Switch to basis='equal' or fix line values.",
    );
  }
  if (policy === "quantity" && sumQty === 0) {
    throw new Error(
      "APPORTION_DEGENERATE_BASIS: cannot apportion by quantity when all quantities sum to zero. Switch to basis='equal' or fix line quantities.",
    );
  }

  // First pass: compute and round per-line allocations.
  const allocations: number[] = new Array(n);
  let running = 0;
  for (let i = 0; i < n; i++) {
    const l = lines[i]!;
    let share: number;
    switch (policy) {
      case "value":    share = l.net_amount       / sumValue; break;
      case "quantity": share = (l.quantity ?? 0)  / sumQty;   break;
      case "equal":    share = 1 / n;                          break;
    }
    const allocated = roundPosting(totalAmount * share);
    allocations[i]  = allocated;
    running += allocated;
  }

  // Compute residue and assign to argmax(net_amount); ties Ã¢â€ â€™ argmin(line_no).
  const residue = roundPosting(totalAmount - running);
  if (residue !== 0) {
    let bestIdx = 0;
    for (let i = 1; i < n; i++) {
      const a = lines[i]!;
      const b = lines[bestIdx]!;
      if (a.net_amount > b.net_amount) { bestIdx = i; continue; }
      if (a.net_amount === b.net_amount && a.line_no < b.line_no) { bestIdx = i; }
    }
    allocations[bestIdx] = roundPosting(allocations[bestIdx]! + residue);
  }

  return lines.map((l, i) => ({ id: l.id, line_no: l.line_no, allocated: allocations[i]! }));
}
