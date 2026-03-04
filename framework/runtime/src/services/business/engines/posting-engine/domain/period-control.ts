// framework/runtime/src/services/business/engines/posting-engine/domain/period-control.ts

import { validateTransition } from "../../shared/engine-base.js";

import { PERIOD_TRANSITIONS } from "./types.js";

import type { PeriodStatus, FiscalPeriod } from "./types.js";

/**
 * Validate a period status transition.
 */
export function isValidPeriodTransition(
  current: PeriodStatus,
  target: PeriodStatus,
): boolean {
  return validateTransition(current, target, PERIOD_TRANSITIONS);
}

/**
 * Check if posting is allowed in a period.
 * MC-8: HARD_CLOSE is ABSOLUTE — no exceptions.
 */
export function canPostToPeriod(period: FiscalPeriod): {
  allowed: boolean;
  reason: string | null;
} {
  switch (period.status) {
    case "OPEN":
      return { allowed: true, reason: null };
    case "SOFT_CLOSE":
      // Soft-close allows adjusting entries (with elevated permissions)
      return {
        allowed: true,
        reason: "Period is soft-closed, only adjusting entries allowed",
      };
    case "HARD_CLOSE":
      return {
        allowed: false,
        reason:
          "Period is HARD_CLOSED — posting is absolutely prohibited (MC-8)",
      };
    case "FUTURE":
      return { allowed: false, reason: "Period is not yet open" };
    default:
      return {
        allowed: false,
        reason: `Unknown period status: ${period.status}`,
      };
  }
}

/**
 * Find the correct fiscal period for a posting date.
 */
export function findPeriodForDate(
  periods: FiscalPeriod[],
  postingDate: Date,
): FiscalPeriod | null {
  return (
    periods.find((p) => {
      return postingDate >= p.startDate && postingDate <= p.endDate;
    }) ?? null
  );
}

/**
 * Get timestamps for period transition.
 */
export function getPeriodTimestamps(
  target: PeriodStatus,
): Record<string, Date | null> {
  const now = new Date();
  switch (target) {
    case "OPEN":
      return { openedAt: now };
    case "SOFT_CLOSE":
      return { softClosedAt: now };
    case "HARD_CLOSE":
      return { hardClosedAt: now };
    default:
      return {};
  }
}
