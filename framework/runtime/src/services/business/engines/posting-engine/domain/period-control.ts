// framework/runtime/src/services/business/engines/posting-engine/domain/period-control.ts

import { validateTransition } from "../../shared/engine-base";

import { PERIOD_TRANSITIONS } from "./types";
import { isGatedTransition, evaluateGate } from "./period-close-governance";

import type { PeriodStatus, FiscalPeriod, CloseGateResult } from "./types";

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

/**
 * Determine side effects required after a period transition succeeds.
 * The caller (service layer) is responsible for executing these.
 */
export function getTransitionSideEffects(target: PeriodStatus): {
  materializeChecklist: boolean;
} {
  return {
    // When a period opens, materialize the close checklist so the ops team
    // can see the full close plan immediately.
    materializeChecklist: target === "OPEN",
  };
}

/**
 * Validate a period transition including close governance gate check.
 * Combines the basic state machine check with the checklist gate.
 *
 * @param gateResult - Result from PeriodCloseChecklistRepo.checkGate().
 *                     Pass null to skip gate check (e.g., when no checklist
 *                     has been materialized for the period).
 */
export function canTransitionPeriod(
  current: PeriodStatus,
  target: PeriodStatus,
  gateResult: CloseGateResult | null,
): { allowed: boolean; reason: string | null } {
  if (!isValidPeriodTransition(current, target)) {
    return {
      allowed: false,
      reason: `Invalid period transition: ${current} → ${target}`,
    };
  }

  if (gateResult && isGatedTransition(target)) {
    const gate = evaluateGate(gateResult, target);
    if (!gate.allowed) {
      return gate;
    }
  }

  return { allowed: true, reason: null };
}
