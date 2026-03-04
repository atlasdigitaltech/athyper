// framework/runtime/src/services/business/engines/budget-engine/domain/health-calculator.ts

import {
  subtractMoney,
  addMoney,
  compareMoney,
  money,
  isZero,
  toRatio,
  multiplyAmounts,
} from "../../shared/money.js";

import { DEFAULT_HEALTH_THRESHOLDS } from "./types.js";

import type {
  HealthStatus,
  HealthThresholds,
  AvailableBalance,
  Trend,
} from "./types.js";

/**
 * Calculate health status based on utilization percentage.
 */
export function calculateHealthStatus(
  utilizationPct: number,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS,
): HealthStatus {
  if (utilizationPct >= thresholds.blackAt) return "BLACK";
  if (utilizationPct >= thresholds.redAt) return "RED";
  if (utilizationPct >= thresholds.yellowAt) return "YELLOW";
  return "GREEN";
}

/**
 * Calculate available balance and health for a funding profile.
 */
export function calculateAvailableBalance(
  totalLimit: string,
  reservedAmount: string,
  committedAmount: string,
  consumedAmount: string,
  releasedAmount: string,
  currencyCode: string,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS,
): AvailableBalance {
  const total = money(totalLimit, currencyCode);
  const reserved = money(reservedAmount, currencyCode);
  const committed = money(committedAmount, currencyCode);
  const consumed = money(consumedAmount, currencyCode);
  const released = money(releasedAmount, currencyCode);

  // Available = total - reserved - committed - consumed + released
  const used = addMoney(addMoney(reserved, committed), consumed);
  const withReleases = subtractMoney(used, released);
  const available = subtractMoney(total, withReleases);

  // MC-4: utilization % via toRatio (no parseFloat)
  // toRatio returns a decimal string (e.g. "0.7538"), multiply by 100 for percentage
  let utilizationPctStr = "0";
  let utilizationPctNum = 0;
  if (!isZero(total)) {
    const ratio = toRatio(withReleases, total, 4);
    utilizationPctStr = multiplyAmounts(ratio, "100", 2);
    utilizationPctNum = Number(utilizationPctStr);
  }

  const healthStatus = calculateHealthStatus(utilizationPctNum, thresholds);

  return {
    totalLimit,
    reservedAmount,
    committedAmount,
    consumedAmount,
    releasedAmount,
    available: available.amount,
    utilizationPct: utilizationPctStr,
    healthStatus,
  };
}

/**
 * Determine trend based on recent utilization changes.
 */
export function determineTrend(
  previousUtilization: number,
  currentUtilization: number,
  significanceThreshold = 2.0,
): Trend {
  const delta = currentUtilization - previousUtilization;
  if (delta > significanceThreshold) return "DETERIORATING";
  if (delta < -significanceThreshold) return "IMPROVING";
  return "STABLE";
}

/**
 * Check if a fund action would cause a breach.
 * Returns true if the action should be blocked.
 */
export function wouldBreach(
  available: string,
  requestedAmount: string,
  currencyCode: string,
): boolean {
  const avail = money(available, currencyCode);
  const requested = money(requestedAmount, currencyCode);
  return compareMoney(requested, avail) > 0;
}
