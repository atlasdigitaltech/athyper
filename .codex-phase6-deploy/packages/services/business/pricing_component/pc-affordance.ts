/**
 * Server-side PC affordance gate (v3.1 Phase 1).
 *
 * Thin server consumer of the canonical matrix in
 * `@athyper/api-contracts/pc-affordance-matrix`. Replaces the
 * hand-maintained `PC_MUTABLE_STATUSES` / `PC_SUPERSEDE_STATUSES` sets
 * scattered in ap.route.ts so client and server can never drift.
 *
 * Use these helpers — not raw status set lookups — at every PC route
 * gate. The parity verifier
 * (`server/scripts/verify-pc-affordance-parity.ts`) diffs both this
 * matrix AND the trigger SQL to keep all three layers in lockstep.
 */

import {
  getPcCapabilities,
  hasPcCapability,
  type PcCapability,
  type PcCapabilities,
} from "@athyper/api-contracts/pc-affordance-matrix";

export { getPcCapabilities, hasPcCapability };
export type { PcCapability, PcCapabilities };

/**
 * Returns true iff the matrix grants `action` for `status`. `previousStatus`
 * is required only for `status === 'on_hold'` to drive §A5 phase inheritance.
 *
 * Route example:
 *   if (!canPcAction(invoice.status, "canEdit")) {
 *     return res.status(422).json({ error: "NOT_EDITABLE", ... });
 *   }
 */
export function canPcAction(
  status:          string,
  action:          PcCapability,
  previousStatus?: string | null,
): boolean {
  return hasPcCapability(status, action, previousStatus ?? null);
}
