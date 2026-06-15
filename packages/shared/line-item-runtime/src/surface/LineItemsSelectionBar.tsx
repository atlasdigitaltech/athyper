"use client";

/**
 * LineItemsSelectionBar — surface adapter for line-item grids.
 *
 * Phase 4a (visual only): swaps the bespoke pill that lived inline at the
 * top of LinesGrid.tsx for the shared `FloatingSelectionBar` primitive.
 * Action set is intentionally minimal — Copy / Delete / Clear — and the
 * existing per-row handlers are preserved unchanged.
 *
 * Phase 4b will add View / Edit / Mass Edit / Reclassify / Export, route
 * them through @athyper/runtime-bulk-actions, and gain the full
 * preflight + confirm + result dialog flow.
 */

import { useMemo } from "react";
import { Copy, Trash2 } from "lucide-react";
import {
  FloatingSelectionBar,
  type SelectionAction,
} from "@athyper/ui/composites";

interface LineItemsSelectionBarProps {
  selectionCount:    number;
  onClearSelection:  () => void;
  onCopySelected?:   () => void;
  onDeleteSelected?: () => void;
  /** Edit mode toggles availability of mutating actions (Copy / Delete). */
  editMode?:         boolean;
}

export function LineItemsSelectionBar({
  selectionCount,
  onClearSelection,
  onCopySelected,
  onDeleteSelected,
  editMode,
}: LineItemsSelectionBarProps) {
  const actions = useMemo<SelectionAction[]>(() => {
    const list: SelectionAction[] = [];
    if (editMode && onCopySelected) {
      list.push({
        id:       "copy",
        label:    "Copy",
        icon:     Copy,
        group:    "secondary",
        onSelect: onCopySelected,
      });
    }
    if (editMode && onDeleteSelected) {
      list.push({
        id:       "delete",
        label:    "Delete",
        icon:     Trash2,
        variant:  "destructive",
        group:    "secondary",
        onSelect: onDeleteSelected,
      });
    }
    return list;
  }, [editMode, onCopySelected, onDeleteSelected]);

  return (
    <FloatingSelectionBar
      count={selectionCount}
      noun={{ singular: "line", plural: "lines" }}
      actions={actions}
      onClear={onClearSelection}
      // Line grids share key affordances with inline cell editors; disable
      // global shortcut binding to avoid swallowing typing.
      enableShortcuts={false}
      autoFocus="keyboard-only"
      testId="line-items-selection-bar"
    />
  );
}
