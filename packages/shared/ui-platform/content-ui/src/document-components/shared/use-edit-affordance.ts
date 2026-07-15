/**
 * @athyper/content-ui — useEditAffordance
 *
 * Spec v1.1 §6.8 + UI-P4. v3.1 Phase 1: PC family surfaces now derive
 * from the canonical PC affordance matrix in @athyper/api-contracts
 * rather than duplicating the per-status switch. Server consumes the
 * same matrix via server/packages/services/business/ap/pc-affordance.ts.
 *
 * Non-PC surfaces (header identity, payment terms, AD) keep their own
 * rules here — they're not governed by fn_pc_supersede_only_update so
 * pulling them through the PC matrix would over-couple them.
 *
 * Wire pattern (unchanged):
 *   const aff = useEditAffordance({
 *     status: pi.status,
 *     surface: "pc_line",
 *     hasPermission: can("PI.PC.REPLACE"),
 *   });
 */

import { useMemo } from "react";
import { getPcCapabilities } from "@athyper/api-contracts/pc-affordance-matrix";
import type { PiStatus, EditAffordance } from "../../purchase-invoice/types";

/**
 * Which surface the affordance is being resolved for. PC surfaces share
 * the matrix; non-PC surfaces have their own rules below.
 */
export type PiEditSurface =
  | "header_identity"
  | "pc_line"
  | "pc_header"
  | "ad"
  | "payment_terms"
  | "header_components_strip";

export interface UseEditAffordanceOptions {
  status: PiStatus;
  surface: PiEditSurface;
  /**
   * When `false`, surface returns `read_only` regardless of status.
   * Default `true`. Wire from a permission check (e.g. `PI.PC.REPLACE`).
   */
  hasPermission?: boolean;
  /**
   * For `on_hold`, callers must pass `previousStatus` so we can decide
   * pre-post vs post-post phase (§A5). Pre-post hold keeps the same
   * affordances as the previous editable status; default treats `on_hold`
   * as read-only when previousStatus is null/unknown.
   */
  previousStatus?: PiStatus | null;
}

const PC_SURFACES = new Set<PiEditSurface>([
  "pc_line",
  "pc_header",
  "header_components_strip",
]);

/**
 * Pure resolver — exported for unit tests + non-hook contexts.
 */
export function resolveEditAffordance(opts: UseEditAffordanceOptions): EditAffordance {
  const { status, surface, hasPermission = true, previousStatus } = opts;
  if (!hasPermission) return "read_only";

  // ── PC family: delegate to the canonical capability matrix ──────────
  if (PC_SURFACES.has(surface)) {
    const caps = getPcCapabilities(status, previousStatus ?? null);
    if (caps.canEdit)      return "edit";
    if (caps.canSupersede) return "replace";
    return "read_only";
  }

  // ── Non-PC surfaces: own rules ──────────────────────────────────────
  // on_hold phase inheritance applies here too — pre-post hold should
  // edit, post-post hold should be read-only.
  const effectiveStatus =
    status === "on_hold" && previousStatus && previousStatus !== "on_hold"
      ? previousStatus
      : status;

  switch (effectiveStatus) {
    case "draft":
    case "rejected":
      return "edit";

    case "pending_approval":
    case "approved":
      // AD remains editable pre-post; header identity + payment terms lock.
      if (surface === "ad") return "edit";
      return "read_only";

    case "posted":
    case "partially_paid":
    case "fully_paid":
    case "reversed":
    case "cancelled":
      return "read_only";

    case "on_hold":
      // Reached only when previousStatus is null/unknown — treat as
      // post-post for safety.
      return "read_only";
  }
}

/**
 * React hook variant — memoised. Use this from components.
 */
export function useEditAffordance(opts: UseEditAffordanceOptions): EditAffordance {
  return useMemo(() => resolveEditAffordance(opts), [
    opts.status,
    opts.surface,
    opts.hasPermission,
    opts.previousStatus,
  ]);
}
