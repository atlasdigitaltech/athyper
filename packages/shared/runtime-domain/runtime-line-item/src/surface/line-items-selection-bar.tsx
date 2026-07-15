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
import { BadgePercent, Calculator, Copy, Eye, Pencil, Plus, ReceiptText, ShieldMinus, Tag, Trash2 } from "lucide-react";
import type { LinePricingComponentKind } from "../types";
import type { MetaEntityOperation } from "@athyper/runtime-contracts";
import { resolveLineSelectionActions } from "./resolve-line-selection-actions";
import {
  FloatingSelectionBar,
  type SelectionAction,
} from "@athyper/ui/composites";

interface LineItemsSelectionBarProps {
  selectionCount:    number;
  onClearSelection:  () => void;
  onEditSelected?:   () => void;
  onViewSelected?:   () => void;
  onEditAccountingSelected?: () => void;
  onViewAccountingSelected?: () => void;
  onManageComponentsSelected?: () => void;
  onAddComponentSelected?: (kind: LinePricingComponentKind) => void;
  onCopySelected?:   () => void;
  onDeleteSelected?: () => void;
  /** Edit mode toggles availability of mutating actions (Copy / Delete). */
  editMode?:         boolean;
  operations?: ReadonlyArray<MetaEntityOperation>;
}

export function LineItemsSelectionBar({
  selectionCount,
  onClearSelection,
  onEditSelected,
  onViewSelected,
  onEditAccountingSelected,
  onViewAccountingSelected,
  onManageComponentsSelected,
  onAddComponentSelected,
  onCopySelected,
  onDeleteSelected,
  editMode,
  operations = [],
}: LineItemsSelectionBarProps) {
  const actions = useMemo<SelectionAction[]>(() => {
    const metadataActions = resolveLineSelectionActions(operations, selectionCount, {
      editItem: onEditSelected,
      editAccounting: onEditAccountingSelected,
      addComponent: onAddComponentSelected,
      copy: onCopySelected,
      delete: onDeleteSelected,
    });
    if (metadataActions.length > 0) {
      const mapped = metadataActions.map((action) => selectionCount > 1 && action.label.toLowerCase().includes("accounting")
        ? { ...action, label: "Mass Edit Accounting" }
        : action);
      if (!editMode && selectionCount === 1 && onViewSelected) {
        mapped.unshift({
          id: "view-details",
          label: "View details",
          icon: Eye,
          group: "primary",
          onSelect: onViewSelected,
        });
      }
      if (!editMode && selectionCount === 1 && onViewAccountingSelected) {
        mapped.splice(Math.min(1, mapped.length), 0, {
          id: "view-accounting",
          label: "View accounting",
          icon: Calculator,
          group: "primary",
          onSelect: onViewAccountingSelected,
        });
      }
      const hasAccounting = mapped.some((action) =>
        action.label.toLowerCase().includes("accounting")
        || action.items?.some((item) => item.label.toLowerCase().includes("accounting")),
      );
      if (editMode && selectionCount > 1 && onEditAccountingSelected && !hasAccounting) {
        mapped.splice(Math.min(1, mapped.length), 0, {
          id: "mass-edit-accounting",
          label: "Mass Edit Accounting",
          icon: Calculator,
          group: "primary",
          onSelect: onEditAccountingSelected,
        });
      }
      return mapped;
    }
    const list: SelectionAction[] = [];
    if (!editMode && onViewSelected) {
      list.push({
        id: "view-details",
        label: "View details",
        icon: Eye,
        group: "primary",
        onSelect: onViewSelected,
      });
    }
    if (!editMode && onViewAccountingSelected) {
      list.push({
        id: "view-accounting",
        label: "View accounting",
        icon: Calculator,
        group: "primary",
        onSelect: onViewAccountingSelected,
      });
    }
    if (editMode && onEditSelected) {
      list.push({
        id:       "edit",
        label:    "Edit item",
        icon:     Pencil,
        group:    "primary",
        onSelect: onEditSelected,
      });
    }
    if (editMode && onEditAccountingSelected) {
      list.push({
        id:       "edit-accounting",
        label:    selectionCount > 1 ? "Mass Edit Accounting" : "Edit Accounting",
        icon:     Calculator,
        group:    "primary",
        onSelect: onEditAccountingSelected,
      });
    }
    if (editMode && (onManageComponentsSelected || onAddComponentSelected)) {
      list.push({
        id: "components",
        label: "Components",
        icon: Plus,
        group: "primary",
        onSelect: () => undefined,
        items: [
          ...(onManageComponentsSelected ? [{ id: "manage", label: "Manage components", icon: Pencil, onSelect: onManageComponentsSelected }] : []),
          ...(onAddComponentSelected ? [
            { id: "discount", label: "Add discount", icon: BadgePercent, onSelect: () => onAddComponentSelected("discount") },
            { id: "charge", label: "Add charge", icon: Tag, onSelect: () => onAddComponentSelected("charge") },
            { id: "tax", label: "Add tax", icon: ReceiptText, onSelect: () => onAddComponentSelected("tax") },
            { id: "withholding", label: "Add withholding tax", icon: ShieldMinus, onSelect: () => onAddComponentSelected("withholding") },
          ] : []),
        ] satisfies SelectionAction["items"],
      });
    }
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
  }, [editMode, operations, selectionCount, onViewSelected, onViewAccountingSelected, onEditSelected, onEditAccountingSelected, onManageComponentsSelected, onAddComponentSelected, onCopySelected, onDeleteSelected]);

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
