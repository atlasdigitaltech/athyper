// ============================================================
// Asset Engine — Depreciation Calculator
// Athyper v2.1 Business Operating Platform — Phase 2
//
// All monetary values are strings for decimal precision.
// Each method returns the monthly depreciation amount as a string.
//
// MC-4 compliance: All arithmetic uses BigInt via shared/money.
// No parseFloat / toFixed anywhere in this module.
// ============================================================

import {
  toScaledBigInt,
  fromScaledBigInt,
  subtractAmounts,
  compareAmounts,
  multiplyAmounts,
} from "../../shared/money.js";

import { DepreciationMethod } from "./types.js";

// Internal precision for all depreciation calculations (4 decimal places)
const PRECISION = 4;

// ── MACRS half-year convention rates (percentage of cost basis per year) ──
// Simplified 5-year property table (GDS 200% DB switching to SL)
// MC-4: rates expressed as string decimals instead of float constants
const MACRS_5_YEAR_RATES = [
  "0.2",
  "0.32",
  "0.192",
  "0.1152",
  "0.1152",
  "0.0576",
];
// 7-year property table
const MACRS_7_YEAR_RATES = [
  "0.1429",
  "0.2449",
  "0.1749",
  "0.1249",
  "0.0893",
  "0.0892",
  "0.0893",
  "0.0446",
];

export interface DepreciationParams {
  costBasis: string;
  residualValue: string;
  usefulLifeMonths: number;
  accumulatedDepreciation: string;
  /** Required only for UNITS_OF_PRODUCTION */
  unitsProduced?: number;
  /** Required only for UNITS_OF_PRODUCTION */
  totalEstimatedUnits?: number;
  /** Current period (1-based month from acquisition) — used by MACRS */
  currentPeriod?: number;
}

export interface DepreciationResult {
  monthlyAmount: string;
}

const ZERO = "0.0000";

/**
 * Calculate monthly depreciation using the specified method.
 */
export function calculateDepreciation(
  method: DepreciationMethod,
  params: DepreciationParams,
): DepreciationResult {
  switch (method) {
    case DepreciationMethod.STRAIGHT_LINE:
      return straightLine(params);
    case DepreciationMethod.REDUCING_BALANCE:
      return reducingBalance(params);
    case DepreciationMethod.UNITS_OF_PRODUCTION:
      return unitsOfProduction(params);
    case DepreciationMethod.ACCELERATED:
      return accelerated(params);
    case DepreciationMethod.MACRS:
      return macrs(params);
    default: {
      const _exhaustive: never = method;
      throw new Error(`Unknown depreciation method: ${_exhaustive}`);
    }
  }
}

// ── BigInt Helpers (MC-4 compliant) ─────────────────────────

/** Convert string amount to scaled bigint at PRECISION */
function scaled(v: string): bigint {
  return toScaledBigInt(v || "0", PRECISION);
}

/** Convert scaled bigint back to string at PRECISION */
function unscaled(v: bigint): string {
  return fromScaledBigInt(v, PRECISION);
}

/** BigInt division: (a / b) at PRECISION scale. b is an integer divisor. */
function bigDivByInt(a: bigint, b: number): bigint {
  if (b === 0) return 0n;
  const divisor = BigInt(b);
  // Apply HALF_UP rounding for division
  const negative = a < 0n;
  const abs = negative ? -a : a;
  const quotient = abs / divisor;
  const remainder = abs % divisor;
  const half = divisor / 2n;
  const rounded = remainder >= half ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

/**
 * MC-4 compliant cap: Ensure depreciation does not push NBV below residual.
 * All parameters are scaled bigints.
 */
function cap(
  amount: bigint,
  costBasis: bigint,
  residualValue: bigint,
  accumulatedDepreciation: bigint,
): bigint {
  const remaining = costBasis - residualValue - accumulatedDepreciation;
  if (remaining <= 0n) return 0n;
  return amount < remaining ? amount : remaining;
}

// ── Straight Line ────────────────────────────────────────────
// (cost - residual) / useful_life_months

function straightLine(params: DepreciationParams): DepreciationResult {
  const cost = scaled(params.costBasis);
  const residual = scaled(params.residualValue);
  const accum = scaled(params.accumulatedDepreciation);
  const months = params.usefulLifeMonths;

  if (months <= 0) return { monthlyAmount: ZERO };

  const depreciableBase = cost - residual;
  if (depreciableBase <= 0n) return { monthlyAmount: ZERO };

  const monthly = bigDivByInt(depreciableBase, months);
  const capped = cap(monthly, cost, residual, accum);

  return { monthlyAmount: unscaled(capped) };
}

// ── Reducing Balance ─────────────────────────────────────────
// rate = 1 / useful_life_years, monthly = (NBV * rate) / 12
// Falls back to straight-line if reducing balance < straight-line

function reducingBalance(params: DepreciationParams): DepreciationResult {
  const cost = scaled(params.costBasis);
  const residual = scaled(params.residualValue);
  const accum = scaled(params.accumulatedDepreciation);
  const months = params.usefulLifeMonths;

  if (months <= 0) return { monthlyAmount: ZERO };

  const nbv = cost - accum;
  if (nbv <= residual) return { monthlyAmount: ZERO };

  // annual rate = 1 / usefulYears = 12 / months
  // annualDepr = nbv * (12 / months) = (nbv * 12) / months
  // monthly = annualDepr / 12 = ((nbv * 12) / months) / 12 = nbv / months
  const monthly = bigDivByInt(nbv, months);

  // Straight-line fallback for remaining life
  // elapsedRatio = accum / depreciableBase, elapsedMonths = round(elapsedRatio * months)
  const depreciableBase = cost - residual;
  let remainingMonths = months;
  if (depreciableBase > 0n) {
    // elapsedMonths = (accum * months) / depreciableBase (integer math)
    const elapsedScaled = accum * BigInt(months);
    const elapsedMonthsInt = Number(elapsedScaled / depreciableBase);
    const elapsedRounded = Math.round(elapsedMonthsInt / 10 ** PRECISION);
    remainingMonths = months - elapsedRounded;
  }
  const slMonthly =
    remainingMonths > 0 ? bigDivByInt(nbv - residual, remainingMonths) : 0n;

  // Choose the larger of reducing balance vs straight-line
  const chosen = monthly > slMonthly ? monthly : slMonthly;
  const capped = cap(chosen, cost, residual, accum);

  return { monthlyAmount: unscaled(capped) };
}

// ── Units of Production ──────────────────────────────────────
// ((cost - residual) / totalEstimatedUnits) * unitsProduced

function unitsOfProduction(params: DepreciationParams): DepreciationResult {
  const cost = scaled(params.costBasis);
  const residual = scaled(params.residualValue);
  const accum = scaled(params.accumulatedDepreciation);
  const totalUnits = params.totalEstimatedUnits ?? 0;
  const produced = params.unitsProduced ?? 0;

  if (totalUnits <= 0 || produced <= 0) return { monthlyAmount: ZERO };

  const depreciableBase = cost - residual;
  if (depreciableBase <= 0n) return { monthlyAmount: ZERO };

  // perUnit = depreciableBase / totalUnits, amount = perUnit * produced
  // Combined: amount = (depreciableBase * produced) / totalUnits
  const amount = bigDivByInt(depreciableBase * BigInt(produced), totalUnits);
  const capped = cap(amount, cost, residual, accum);

  return { monthlyAmount: unscaled(capped) };
}

// ── Accelerated (Double Declining Balance) ───────────────────
// rate = (2 / useful_life_years), monthly = (NBV * rate) / 12
// Switches to straight-line when SL produces a larger charge

function accelerated(params: DepreciationParams): DepreciationResult {
  const cost = scaled(params.costBasis);
  const residual = scaled(params.residualValue);
  const accum = scaled(params.accumulatedDepreciation);
  const months = params.usefulLifeMonths;

  if (months <= 0) return { monthlyAmount: ZERO };

  const nbv = cost - accum;
  if (nbv <= residual) return { monthlyAmount: ZERO };

  // DDB rate = 2 / usefulYears = 24 / months
  // annualDepr = nbv * (24 / months) = (nbv * 24) / months
  // ddbMonthly = annualDepr / 12 = ((nbv * 24) / months) / 12 = (nbv * 2) / months
  const ddbMonthly = bigDivByInt(nbv * 2n, months);

  // Straight-line on remaining NBV over remaining useful life
  const depreciableBase = cost - residual;
  let elapsedRounded = 0;
  if (depreciableBase > 0n) {
    const elapsedScaled = accum * BigInt(months);
    const elapsedMonthsInt = Number(elapsedScaled / depreciableBase);
    elapsedRounded = Math.round(elapsedMonthsInt / 10 ** PRECISION);
  }
  const remainingMonths = Math.max(months - elapsedRounded, 1);
  const slMonthly = bigDivByInt(nbv - residual, remainingMonths);

  // Switch to SL when it yields more depreciation
  const chosen = ddbMonthly > slMonthly ? ddbMonthly : slMonthly;
  const capped = cap(chosen, cost, residual, accum);

  return { monthlyAmount: unscaled(capped) };
}

// ── MACRS ────────────────────────────────────────────────────
// Uses IRS half-year convention rate tables.
// Ignores residual value (MACRS depreciates to zero).

function macrs(params: DepreciationParams): DepreciationResult {
  const months = params.usefulLifeMonths;
  const currentPeriod = params.currentPeriod ?? 1;

  if (months <= 0) return { monthlyAmount: ZERO };

  // Determine rate table based on useful life
  const usefulYears = Math.round(months / 12);
  const rates = usefulYears <= 5 ? MACRS_5_YEAR_RATES : MACRS_7_YEAR_RATES;

  // currentPeriod is 1-based month; derive the year index (0-based)
  const yearIndex = Math.floor((currentPeriod - 1) / 12);

  if (yearIndex < 0 || yearIndex >= rates.length) {
    return { monthlyAmount: ZERO };
  }

  // MC-4: Use multiplyAmounts for cost * rate, then BigInt division by 12
  const annualRate = rates[yearIndex]!;
  const annualDepr = multiplyAmounts(params.costBasis, annualRate, PRECISION);
  const monthlyScaled = bigDivByInt(scaled(annualDepr), 12);

  // MACRS depreciates to zero (residual = 0)
  // MC-4: remaining = costBasis - accumulatedDepreciation via subtractAmounts
  const remaining = subtractAmounts(
    params.costBasis,
    params.accumulatedDepreciation,
    PRECISION,
  );
  if (compareAmounts(remaining, "0", PRECISION) <= 0) {
    return { monthlyAmount: ZERO };
  }

  // Cap: min(monthly, remaining)
  const remainingScaled = scaled(remaining);
  const capped =
    monthlyScaled < remainingScaled ? monthlyScaled : remainingScaled;

  return { monthlyAmount: unscaled(capped) };
}
