/**
 * @athyper/api-contracts - PC Affordance Matrix
 *
 * Single source of truth for pricing-component mutations by parent invoice
 * status. The parent document lifecycle owns editability; pricing components
 * do not expose their own business lifecycle.
 *
 * Consumed by:
 *   - Client UI (useEditAffordance) - projects to edit/replace/read_only
 *   - Server route gates (server/packages/services/business/ap/pc-affordance.ts)
 *   - Parity verifier (server/scripts/verify-pc-affordance-parity.ts)
 *
 * Unified rule:
 *   - draft/proforma: save means replace current pricing rows
 *   - pending_approval/approved/posted/terminal: rows are read-only; request
 *     revision or reopen to draft before changing pricing
 *
 * `canSupersede` remains only as a compatibility field for older callers.
 * Unified lifecycle keeps it false for every status.
 */

export type PcCapability =
  | "canEdit"
  | "canDelete"
  | "canSupersede"
  | "canAdd";

export interface PcCapabilities {
  readonly canEdit:      boolean;
  readonly canDelete:    boolean;
  readonly canSupersede: boolean;
  readonly canAdd:       boolean;
}

export const PC_CAPABILITIES_NONE: PcCapabilities = Object.freeze({
  canEdit:      false,
  canDelete:    false,
  canSupersede: false,
  canAdd:       false,
});

export type PcAffordanceEntry =
  | PcCapabilities
  | "inherit_from_previous_status";

export const PC_AFFORDANCE_MATRIX: Record<string, PcAffordanceEntry> = Object.freeze({
  draft:            { canEdit: true,  canDelete: true,  canSupersede: false, canAdd: true  },
  proforma:         { canEdit: true,  canDelete: true,  canSupersede: false, canAdd: true  },

  rejected:         PC_CAPABILITIES_NONE,
  pending_approval: PC_CAPABILITIES_NONE,
  approved:         PC_CAPABILITIES_NONE,
  posted:           PC_CAPABILITIES_NONE,
  partially_paid:   PC_CAPABILITIES_NONE,
  fully_paid:       PC_CAPABILITIES_NONE,
  reversed:         PC_CAPABILITIES_NONE,
  cancelled:        PC_CAPABILITIES_NONE,

  // Pre-post hold inherits the previous status; unknown hold context is
  // fail-closed in getPcCapabilities().
  on_hold:          "inherit_from_previous_status",
});

export function getPcCapabilities(
  status:           string,
  previousStatus?:  string | null,
): PcCapabilities {
  const entry = PC_AFFORDANCE_MATRIX[status];
  if (entry == null) return PC_CAPABILITIES_NONE;
  if (entry === "inherit_from_previous_status") {
    if (previousStatus == null || previousStatus === "on_hold") {
      return PC_CAPABILITIES_NONE;
    }
    return getPcCapabilities(previousStatus, null);
  }
  return entry;
}

export function hasPcCapability(
  status:           string,
  capability:       PcCapability,
  previousStatus?:  string | null,
): boolean {
  return getPcCapabilities(status, previousStatus)[capability];
}

