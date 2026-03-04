"use client";

/**
 * Entity List Actions Hook
 *
 * Derives list page actions (primary action, row actions, bulk actions)
 * from entity capabilities. Replaces hardcoded action definitions in
 * schema-list-config with capability-driven actions.
 *
 * Usage:
 *   const { primaryAction, rowActions, bulkActions } = useEntityListActions("purchase_order");
 */

import { useRouter } from "next/navigation";
import { useMemo } from "react";

import {
  useEntityCapabilities,
} from "./entity-capabilities";

import type { BulkAction, RowAction } from "@/components/mesh/list/types";

// ============================================================================
// Types
// ============================================================================

export interface ListPrimaryAction {
  label: string;
  onClick: () => void;
}

// ============================================================================
// Hook
// ============================================================================

export function useEntityListActions(entityKey: string): {
  primaryAction: ListPrimaryAction | undefined;
  rowActions: RowAction<any>[];
  bulkActions: BulkAction<any>[];
  loading: boolean;
} {
  const { capabilities, loading } = useEntityCapabilities(entityKey);
  const router = useRouter();

  return useMemo(() => {
    if (!capabilities) {
      return { primaryAction: undefined, rowActions: [], bulkActions: [], loading };
    }

    const listOps = capabilities.operations.filter(
      (op) => op.surface === "LIST" || op.surface === "BOTH",
    );

    // Primary action: first op with placement = PRIMARY on list surface
    const primaryOp = listOps.find((op) => op.placement === "PRIMARY");
    const primaryAction: ListPrimaryAction | undefined = primaryOp
      ? {
          label: primaryOp.label,
          onClick: () => {
            if (primaryOp.handlerType === "NAVIGATE" && primaryOp.handlerTarget) {
              router.push(primaryOp.handlerTarget);
            } else if (primaryOp.handlerType === "NAVIGATE") {
              router.push(capabilities.routes.create);
            }
          },
        }
      : undefined;

    // Row actions: ops with requiresRecord = true on list surface
    const rowActions: RowAction<any>[] = listOps
      .filter((op) => op.requiresRecord && op.placement !== "PRIMARY")
      .map((op) => ({
        id: op.code,
        label: op.label,
        variant: isDestructiveOp(op.code)
          ? ("destructive" as const)
          : ("default" as const),
        onClick: (_item: any) => {
          // Row actions dispatch to the appropriate handler
          // The actual execution depends on handlerType
          if (op.handlerType === "NAVIGATE" && op.handlerTarget) {
            // For navigate, the target may contain {id} template
            // Actual navigation handled by the page
          }
          // API/MODAL/INLINE actions require the list page to handle them
        },
      }));

    // Bulk actions: ops with requiresRecord = false, on list surface, non-primary
    const bulkActions: BulkAction<any>[] = listOps
      .filter(
        (op) =>
          !op.requiresRecord &&
          op.placement !== "PRIMARY" &&
          (op.placement === "TOOLBAR" || op.placement === "OVERFLOW"),
      )
      .map((op) => ({
        id: op.code,
        label: op.label,
        variant: isDestructiveOp(op.code)
          ? ("destructive" as const)
          : ("default" as const),
        onClick: (_items: any[]) => {
          // Bulk action execution handled by the list page
        },
      }));

    return { primaryAction, rowActions, bulkActions, loading };
  }, [capabilities, loading, router]);
}

// ============================================================================
// Helpers
// ============================================================================

const DESTRUCTIVE_OPS = new Set([
  "deny", "reject", "cancel", "void", "delete", "delete_draft",
  "bulk_delete",
]);

function isDestructiveOp(code: string): boolean {
  return DESTRUCTIVE_OPS.has(code);
}
