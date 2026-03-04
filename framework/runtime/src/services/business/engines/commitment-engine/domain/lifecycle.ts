// framework/runtime/src/services/business/engines/commitment-engine/domain/lifecycle.ts

import { validateTransition } from "../../shared/engine-base.js";
import { compareAmounts } from "../../shared/money.js";

import { COMMITMENT_TRANSITIONS } from "./types.js";

import type { CommitmentStatus } from "./types.js";

/**
 * Validate a commitment status transition.
 */
export function isValidCommitmentTransition(
  current: CommitmentStatus,
  target: CommitmentStatus,
): boolean {
  return validateTransition(current, target, COMMITMENT_TRANSITIONS);
}

/**
 * Get allowed next statuses.
 */
export function getAllowedCommitmentTransitions(
  current: CommitmentStatus,
): CommitmentStatus[] {
  return COMMITMENT_TRANSITIONS[current] ?? [];
}

/**
 * Determine if commitment should auto-transition based on fulfillment.
 * MC-4 compliance: Uses compareAmounts. NO FLOAT.
 */
export function determineStatusFromFulfillment(
  totalAmount: string,
  fulfilledAmount: string,
): CommitmentStatus {
  if (compareAmounts(fulfilledAmount, "0") <= 0) return "ACTIVE";
  if (compareAmounts(fulfilledAmount, totalAmount) >= 0) return "FULFILLED";
  return "PARTIALLY_FULFILLED";
}
