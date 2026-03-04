// framework/runtime/src/services/business/engines/budget-engine/domain/hierarchy-validator.ts

import {
  addMoney,
  compareMoney,
  subtractMoney,
  money,
} from "../../shared/money.js";

import type { FundingProfile } from "./types.js";

/**
 * Validate hierarchy constraint: SUM(child.total_limit) <= parent.total_limit
 */
export function validateChildLimits(
  parent: FundingProfile,
  children: FundingProfile[],
): { valid: boolean; overBy: string | null } {
  if (children.length === 0) return { valid: true, overBy: null };

  let childSum = money("0", parent.currencyCode);
  for (const child of children) {
    if (child.currencyCode !== parent.currencyCode) {
      // Cross-currency children require FX conversion first
      continue;
    }
    childSum = addMoney(childSum, money(child.totalLimit, child.currencyCode));
  }

  const parentLimit = money(parent.totalLimit, parent.currencyCode);
  const comparison = compareMoney(childSum, parentLimit);

  if (comparison > 0) {
    // MC-4: subtractMoney instead of parseFloat difference
    const over = subtractMoney(childSum, parentLimit);
    return { valid: false, overBy: over.amount };
  }

  return { valid: true, overBy: null };
}

/**
 * Check if parent is BLACK — blocks all children operations.
 */
export function isParentBlocked(parent: FundingProfile): boolean {
  return parent.healthStatus === "BLACK";
}

/**
 * Validate that a funding profile can accept a fund action.
 */
export function canAcceptAction(fp: FundingProfile): {
  allowed: boolean;
  reason: string | null;
} {
  if (fp.status === "FROZEN") {
    return { allowed: false, reason: "Funding profile is frozen" };
  }
  if (fp.status === "CLOSED") {
    return { allowed: false, reason: "Funding profile is closed" };
  }
  if (fp.healthStatus === "BLACK") {
    return {
      allowed: false,
      reason: "Funding profile health is BLACK (fully consumed)",
    };
  }
  return { allowed: true, reason: null };
}
