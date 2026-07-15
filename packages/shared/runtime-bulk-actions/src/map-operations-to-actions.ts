/**
 * Maps `ResolvedAction[]` (from @athyper/metadata-client) + preflight state
 * into `SelectionAction[]` ready to feed FloatingSelectionBar.
 *
 * Encapsulates today's EntityListPage logic:
 *   - "Post (8 of 15)" badge from preflight.eligible
 *   - destructive coloring for delete/cancel/deny/reject/void
 *   - hide actions with `eligible === 0` (no useful work)
 *   - "(…)" badge while preflight is loading
 *   - export is special-cased (no preflight, no badge)
 */

import { Trash2, type LucideIcon } from "lucide-react";
import { getActionIcon } from "@athyper/icons/actions";
import type { ResolvedAction } from "@athyper/metadata-client";
import type { BulkPreflightResult } from "@athyper/api-contracts/entity-list";
import type { SelectionAction } from "@athyper/ui/composites";

const DESTRUCTIVE_ACTIONS = new Set(["delete", "cancel", "deny", "reject", "void"]);
const NON_SELECTION_ACTIONS = new Set(["bulk_update", "create", "import"]);

export function bulkActionCode(action: ResolvedAction): string {
  return action.permissionCode.split(".").pop() ?? action.permissionCode;
}

/**
 * Filter a flat ops list down to those that make sense for bulk selection.
 * Mirrors the EntityListPage filter:
 *   - LIST surface, !requiresRecord, !NAVIGATE  → list-level ops (export, etc.)
 *   - DETAIL surface, requiresRecord, !NAVIGATE → per-record ops to apply in bulk
 *   - drop NON_SELECTION_ACTIONS (create, import, bulk_update)
 */
export function filterBulkOperations(
  listOps:   ResolvedAction[],
  detailOps: ResolvedAction[],
): ResolvedAction[] {
  const bulkList   = listOps.filter((a) => !a.requiresRecord && a.handlerType !== "NAVIGATE");
  const bulkRecord = detailOps.filter((a) => a.requiresRecord && a.handlerType !== "NAVIGATE");
  return [...bulkList, ...bulkRecord].filter(
    (a) => !NON_SELECTION_ACTIONS.has(bulkActionCode(a)),
  );
}

export interface MapOperationsToActionsOptions {
  /** Total currently-selected ids — used to format "X of Y" badges. */
  selectionCount: number;
  /** Preflight result per action code. */
  preflightMap:   Record<string, BulkPreflightResult | null>;
  /** Whether preflight is still running for some action. */
  preflightLoading: boolean;
  /** True when background preflight was deferred (selection too large). */
  preflightDeferred: boolean;
  /** Hide actions where preflight reports 0 eligible records. Default: false (show but disabled). */
  hideIneligible?: boolean;
  /** Per-action busy flags (for spinner on the clicked action). */
  busyActionId?:  string | null;
  /** Click handler. */
  onSelect: (actionCode: string, op: ResolvedAction) => void;
}

export function mapOperationsToActions(
  operations: ResolvedAction[],
  opts:       MapOperationsToActionsOptions,
): SelectionAction[] {
  const {
    selectionCount,
    preflightMap,
    preflightLoading,
    preflightDeferred,
    hideIneligible = false,
    busyActionId = null,
    onSelect,
  } = opts;

  return operations.map((op) => {
    const actionCode  = bulkActionCode(op);
    const isExport    = actionCode === "export";
    const isDestruct  = DESTRUCTIVE_ACTIONS.has(actionCode);
    const pf          = preflightMap[actionCode];

    let badge: string | undefined;
    if (!isExport && !preflightDeferred) {
      if (preflightLoading && !pf) badge = "…";
      else if (pf)                 badge = `${pf.eligible} of ${selectionCount}`;
    }

    const isIneligible = !isExport && !preflightLoading && pf?.canProceed === false;
    const disabled     = isIneligible || (busyActionId !== null && busyActionId !== actionCode);

    const Icon: LucideIcon = isDestruct ? Trash2 : getActionIcon(op.icon ?? actionCode);

    return {
      id:        actionCode,
      label:     op.label,
      icon:      Icon,
      variant:   isDestruct ? "destructive" : "default",
      group:     isExport || isDestruct ? "secondary" : "primary",
      disabled,
      busy:      busyActionId === actionCode,
      hidden:    hideIneligible && isIneligible,
      badge,
      badgeTone: isIneligible ? "error" : (pf && pf.eligible < selectionCount ? "warning" : "neutral"),
      onSelect:  () => onSelect(actionCode, op),
    } satisfies SelectionAction;
  });
}
