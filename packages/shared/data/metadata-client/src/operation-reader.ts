/**
 * @athyper/metadata-client — Operation Reader
 *
 * Resolves control.entity_operation rows into action bar configuration.
 * Maps handler_type to behavior: NAVIGATE, API, MODAL, INLINE.
 * Respects surface (LIST/DETAIL/BOTH) and placement (PRIMARY/TOOLBAR/OVERFLOW).
 */
import { type EntityOperation } from "@athyper/api-contracts/metadata";

export interface ResolvedAction {
  permissionCode: string;
  label: string;
  description?: string | null;
  icon: string | null;
  handlerType: "NAVIGATE" | "API" | "MODAL" | "INLINE";
  handlerTarget: string | null;
  placement: "PRIMARY" | "TOOLBAR" | "OVERFLOW" | "CONTEXT" | "COMMAND";
  requiresRecord: boolean;
  sortOrder: number;
}

/**
 * Filter and sort operations for a specific surface (LIST or DETAIL).
 */
export function resolveActionsForSurface(
  operations: EntityOperation[],
  surface: "LIST" | "DETAIL",
): ResolvedAction[] {
  return operations
    .filter((op) => op.is_enabled)
    .filter((op) => op.surface === surface || op.surface === "BOTH")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((op) => ({
      permissionCode: op.permission_code,
      label: op.label_override ?? formatPermissionLabel(op.permission_code),
      icon: op.icon_override,
      handlerType: op.handler_type,
      handlerTarget: op.handler_target,
      placement: op.placement,
      requiresRecord: op.is_record_required,
      sortOrder: op.sort_order,
    }));
}

/**
 * Get primary actions (shown as prominent buttons).
 */
export function getPrimaryActions(actions: ResolvedAction[]): ResolvedAction[] {
  return actions.filter((a) => a.placement === "PRIMARY");
}

/**
 * Get toolbar actions (secondary buttons).
 */
export function getToolbarActions(actions: ResolvedAction[]): ResolvedAction[] {
  return actions.filter((a) => a.placement === "TOOLBAR");
}

/**
 * Get overflow actions (hidden in "more" menu).
 */
export function getOverflowActions(actions: ResolvedAction[]): ResolvedAction[] {
  return actions.filter((a) => a.placement === "OVERFLOW" || a.placement === "CONTEXT");
}

/** Convert permission_code to a human label: "entity.create" → "Create" */
function formatPermissionLabel(code: string): string {
  const parts = code.split(".");
  const lastPart = parts[parts.length - 1] ?? code;
  return lastPart.charAt(0).toUpperCase() + lastPart.slice(1).replace(/_/g, " ");
}
