// framework/runtime/src/services/business/engines/ou-intent/domain/ou-lifecycle.ts

/**
 * Operating Unit lifecycle state machine.
 * Transitions: DRAFT → ACTIVE → UNDER_REVIEW → SUNSET → ARCHIVED
 */

import { validateTransition } from "../../shared/engine-base.js";

import { OU_TRANSITIONS } from "./types.js";

import type { OUStatus } from "./types.js";

/**
 * Validate an OU status transition.
 */
export function isValidOUTransition(
  current: OUStatus,
  target: OUStatus,
): boolean {
  return validateTransition(current, target, OU_TRANSITIONS);
}

/**
 * Get allowed next statuses for the current status.
 */
export function getAllowedTransitions(current: OUStatus): OUStatus[] {
  return OU_TRANSITIONS[current] ?? [];
}

/**
 * Determine timestamps to set based on status transition.
 */
export function getTimestampsForTransition(
  target: OUStatus,
): Record<string, Date | null> {
  const now = new Date();
  switch (target) {
    case "ACTIVE":
      return { activatedAt: now };
    case "SUNSET":
      return { sunsetAt: now };
    case "ARCHIVED":
      return { archivedAt: now };
    default:
      return {};
  }
}
