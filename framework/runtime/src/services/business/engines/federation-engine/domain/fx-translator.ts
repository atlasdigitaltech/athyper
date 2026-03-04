// framework/runtime/src/services/business/engines/federation-engine/domain/fx-translator.ts
//
// MC-4 compliance: All arithmetic uses BigInt via shared/money.
// No parseFloat / toFixed anywhere in this module.

import {
  multiplyAmounts,
  subtractAmounts,
  toScaledBigInt,
  fromScaledBigInt,
  compareAmounts,
} from "../../shared/money.js";

import type { FxRate, FxRateType } from "./types.js";

/**
 * Translate an amount from one currency to another using an FX rate.
 * MC-4 compliant: uses multiplyAmounts instead of parseFloat multiplication.
 */
export function translateAmount(amount: string, rate: string): string {
  return multiplyAmounts(amount, rate);
}

/**
 * Translate amount using inverse rate (for reverse direction).
 * MC-4 compliant: uses BigInt division instead of parseFloat division.
 */
export function translateAmountInverse(amount: string, rate: string): string {
  if (compareAmounts(rate, "0") === 0)
    throw new Error("FX rate cannot be zero");
  const precision = 4;
  const amtScaled = toScaledBigInt(amount, precision);
  const rateScaled = toScaledBigInt(rate, precision);
  const factor = 10n ** BigInt(precision);
  // (amount / rate) at precision: (amtScaled * factor) / rateScaled
  const rawResult = (amtScaled * factor) / rateScaled;
  return fromScaledBigInt(rawResult, precision);
}

/**
 * Calculate unrealized gain/loss from FX revaluation.
 * MC-4 compliant: uses subtractAmounts instead of parseFloat subtraction.
 */
export function calculateUnrealizedGainLoss(
  originalFunctionalAmount: string,
  revaluedFunctionalAmount: string,
): string {
  return subtractAmounts(revaluedFunctionalAmount, originalFunctionalAmount);
}

/**
 * Select the best FX rate from available rates.
 * Priority: exact date match > most recent before date.
 */
export function selectRate(
  rates: FxRate[],
  rateType: FxRateType,
  asOfDate: Date,
): FxRate | null {
  const matching = rates
    .filter((r) => r.rateType === rateType)
    .filter((r) => r.effectiveDate <= asOfDate)
    .sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime());

  return matching[0] ?? null;
}

/**
 * Get triangulated rate (A->B via A->USD->B).
 * MC-4 compliant: uses multiplyAmounts with higher precision for rate chaining.
 */
export function triangulateRate(
  rateAtoUsd: string,
  rateUsdToB: string,
): string {
  return multiplyAmounts(rateAtoUsd, rateUsdToB, 10);
}
