/**
 * Commission Engine — Plan Calculator
 *
 * Pure calculation logic for each plan type. No side-effects, no I/O.
 * Each calculator takes a base_amount and the relevant plan configuration
 * and returns the computed commission_amount and effective_rate.
 */

import { PlanType } from "./types.js";

import type {
  CommissionPlan,
  CalculationResult,
} from "./types.js";

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Calculate commission for the given plan and base amount.
 *
 * @param plan   The commission plan (must be active and within effective dates)
 * @param baseAmount  The metric value to calculate commission on
 * @returns Commission amount and the effective rate applied
 * @throws Error when plan configuration is invalid for the plan type
 */
export function calculateForPlan(
  plan: CommissionPlan,
  baseAmount: number,
): CalculationResult {
  if (baseAmount <= 0) {
    return { commissionAmount: 0, effectiveRate: 0 };
  }

  switch (plan.planType) {
    case PlanType.FLAT_RATE:
      return calculateFlatRate(plan, baseAmount);
    case PlanType.TIERED:
      return calculateTiered(plan, baseAmount);
    case PlanType.PERCENTAGE:
      return calculatePercentage(plan, baseAmount);
    case PlanType.FORMULA:
      return calculateFormula(plan, baseAmount);
    default: {
      const _exhaustive: never = plan.planType;
      throw new Error(`Unknown plan type: ${_exhaustive}`);
    }
  }
}

// ---------------------------------------------------------------------------
// FLAT_RATE — fixed amount per qualifying transaction
// ---------------------------------------------------------------------------

/**
 * FLAT_RATE plans pay a fixed commission amount regardless of the base amount.
 * The flat amount is stored in tiers[0].rate (with isPercentage = false).
 */
function calculateFlatRate(
  plan: CommissionPlan,
  baseAmount: number,
): CalculationResult {
  const tiers = plan.tiers;
  if (!tiers || tiers.length === 0) {
    throw new Error(
      `FLAT_RATE plan "${plan.code}" requires at least one tier entry with rate as the flat amount`,
    );
  }

  const flatAmount = tiers[0].rate;
  const effectiveRate = baseAmount !== 0 ? flatAmount / baseAmount : 0;

  return {
    commissionAmount: round4(flatAmount),
    effectiveRate: round4(effectiveRate),
  };
}

// ---------------------------------------------------------------------------
// TIERED — progressive tiers (each slice at its own rate)
// ---------------------------------------------------------------------------

/**
 * TIERED plans apply different rates to successive slices of the base amount.
 *
 * Example tiers:
 *   [{ from: 0, to: 10000, rate: 0.05, isPercentage: true },
 *    { from: 10000, to: 50000, rate: 0.08, isPercentage: true },
 *    { from: 50000, rate: 0.10, isPercentage: true }]
 *
 * For baseAmount = 60000:
 *   Slice 1: 10000 * 5%  =  500
 *   Slice 2: 40000 * 8%  = 3200
 *   Slice 3: 10000 * 10% = 1000
 *   Total = 4700,  effective rate = 4700 / 60000 ≈ 0.0783
 */
function calculateTiered(
  plan: CommissionPlan,
  baseAmount: number,
): CalculationResult {
  const tiers = plan.tiers;
  if (!tiers || tiers.length === 0) {
    throw new Error(
      `TIERED plan "${plan.code}" requires at least one tier definition`,
    );
  }

  // Sort tiers by lower bound ascending
  const sorted = [...tiers].sort((a, b) => a.from - b.from);

  let totalCommission = 0;
  let remaining = baseAmount;

  for (const tier of sorted) {
    if (remaining <= 0) break;

    const tierCeiling = tier.to ?? Infinity;
    const tierWidth = tierCeiling - tier.from;
    const applicableAmount = Math.min(remaining, tierWidth);

    if (applicableAmount <= 0) continue;

    const sliceCommission = tier.isPercentage
      ? applicableAmount * tier.rate
      : tier.rate; // flat amount for the tier

    totalCommission += sliceCommission;
    remaining -= applicableAmount;
  }

  const effectiveRate = baseAmount !== 0 ? totalCommission / baseAmount : 0;

  return {
    commissionAmount: round4(totalCommission),
    effectiveRate: round4(effectiveRate),
  };
}

// ---------------------------------------------------------------------------
// PERCENTAGE — simple percentage of the base amount
// ---------------------------------------------------------------------------

/**
 * PERCENTAGE plans apply a single percentage rate to the entire base amount.
 * The rate is stored in tiers[0].rate (with isPercentage = true).
 */
function calculatePercentage(
  plan: CommissionPlan,
  baseAmount: number,
): CalculationResult {
  const tiers = plan.tiers;
  if (!tiers || tiers.length === 0) {
    throw new Error(
      `PERCENTAGE plan "${plan.code}" requires at least one tier entry with rate as the percentage`,
    );
  }

  const rate = tiers[0].rate;
  const commissionAmount = baseAmount * rate;

  return {
    commissionAmount: round4(commissionAmount),
    effectiveRate: round4(rate),
  };
}

// ---------------------------------------------------------------------------
// FORMULA — evaluate a formula string
// ---------------------------------------------------------------------------

/**
 * FORMULA plans use a text-based formula that references `baseAmount`.
 *
 * Supported variables in the formula:
 *   - `baseAmount` — the metric value
 *
 * Example formulas:
 *   "baseAmount * 0.05 + 100"
 *   "Math.min(baseAmount * 0.10, 5000)"
 *
 * Security note: The formula is evaluated with Function(), not raw eval().
 * Only numeric/Math operations are expected. Input validation and sandboxing
 * should be enforced at the plan-creation boundary.
 */
function calculateFormula(
  plan: CommissionPlan,
  baseAmount: number,
): CalculationResult {
  const formula = plan.formula;
  if (!formula || formula.trim().length === 0) {
    throw new Error(
      `FORMULA plan "${plan.code}" requires a non-empty formula string`,
    );
  }

  let commissionAmount: number;
  try {
    // Create a function with `baseAmount` as the only parameter.
    // The formula is the return expression.
    const fn = new Function("baseAmount", `"use strict"; return (${formula});`);
    const result = fn(baseAmount);

    if (typeof result !== "number" || !isFinite(result)) {
      throw new Error(
        `Formula for plan "${plan.code}" returned non-numeric value: ${result}`,
      );
    }

    commissionAmount = result;
  } catch (err) {
    if (err instanceof Error && err.message.includes("non-numeric")) {
      throw err;
    }
    throw new Error(
      `Failed to evaluate formula for plan "${plan.code}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Ensure non-negative
  commissionAmount = Math.max(0, commissionAmount);
  const effectiveRate = baseAmount !== 0 ? commissionAmount / baseAmount : 0;

  return {
    commissionAmount: round4(commissionAmount),
    effectiveRate: round4(effectiveRate),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round to 4 decimal places (matches DECIMAL(18,4) / DECIMAL(8,4) in DB) */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
