/**
 * @athyper/content-ui — useEditAffordance
 *
 * Spec v1.1 §6.8 + UI-P4.
 *
 * Resolves the (parent status × surface × permission) tuple to an
 * `EditAffordance` used by every band/drawer.
 *
 * Authoritative source of "what's editable when" lives server-side
 * in `entity_field.editable_in_status` + permission checks. This hook
 * is the UI-side projection that mirrors those rules so affordances
 * don't drift between server and client.
 *
 * Wire pattern:
 *   const aff = useEditAffordance({ status: pi.status, surface: "pc", hasPermission: can("PI.PC.REPLACE") });
 *
 * Today this is a pure derivation. When the field-rule projection lands
 * server-side, swap the body to read from that endpoint without changing
 * the call sites.
 */

import { useMemo } from "react";
import type { PiStatus, EditAffordance } from "../../purchase-invoice/types";

/**
 * Which surface the affordance is being resolved for. The matrix
 * differs by surface — e.g. PC supersedes in approval, AD remains
 * editable pre-post.
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
   * affordances as the previous editable status (rare but real); the
   * default below treats `on_hold` as read-only when previousStatus
   * is unknown.
   */
  previousStatus?: PiStatus | null;
}

/**
 * Pure resolver — exported for unit tests + non-hook contexts.
 */
export function resolveEditAffordance(opts: UseEditAffordanceOptions): EditAffordance {
  const { status, surface, hasPermission = true, previousStatus } = opts;

  if (!hasPermission) return "read_only";

  // on_hold inherits the previous status for affordance purposes per §A5.
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
      // PC + header components strip → supersede only.
      // AD remains editable pre-post.
      // Header identity, payment terms → read-only in approval (per state matrix).
      if (surface === "pc_line" || surface === "pc_header" || surface === "header_components_strip") {
        return "replace";
      }
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
