"use client";

/**
 * LinesColumnPicker — line-items adapter for `ColumnPickerBase`.
 *
 * Owns the open/close state internally (`useState`) so it doesn't need
 * `OrganizePaletteProvider`. Converts compiled `EntityField`s to the
 * `ResolvedColumn` shape `ColumnPickerBase` expects, and routes the
 * apply callback to the parent's persistence handler.
 *
 * Persistence is the consumer's responsibility (`LinesGrid` wires this to
 * `useLocalStoragePreference`). The adapter stays a pure controlled
 * wrapper so it can be tested without storage stubs.
 */

import { useMemo, useState } from "react";
import { ColumnPickerBase, type ResolvedColumn } from "@athyper/runtime-list/islands";
import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";
import { selectableColumnFields } from "./columns";

export interface LinesColumnPickerProps {
  /** Compiled line entity — source of the candidate pool. */
  entity:        CompiledEntity;
  /** Default visible field names (typically `display_config.list_columns`). */
  defaultVisible: string[];
  /** Currently visible field names, in display order. */
  visible:       string[];
  /** Apply handler — called with the user's new visible-list on commit. */
  onApply:       (next: string[]) => void;
}

export function LinesColumnPicker({
  entity,
  defaultVisible,
  visible,
  onApply,
}: LinesColumnPickerProps) {
  const [open, setOpen] = useState(false);

  const candidateFields = useMemo(() => selectableColumnFields(entity), [entity]);

  // EntityField → ResolvedColumn. Picker only reads name, label, dataType
  // (label/visible-pool driven by the descriptor). Defaults that the
  // runtime-list page would care about (display config, compact/excel
  // visibility) aren't load-bearing here.
  const allColumns = useMemo<ResolvedColumn[]>(
    () => candidateFields.map((f) => entityFieldToResolvedColumn(f)),
    [candidateFields],
  );

  const allByName = useMemo(
    () => new Map(allColumns.map((c) => [c.name, c])),
    [allColumns],
  );

  const visibleColumns = useMemo<ResolvedColumn[]>(
    () => visible
      .map((name) => allByName.get(name))
      .filter((c): c is ResolvedColumn => c !== undefined),
    [visible, allByName],
  );

  const defaultColumns = useMemo<ResolvedColumn[]>(
    () => defaultVisible
      .map((name) => allByName.get(name))
      .filter((c): c is ResolvedColumn => c !== undefined),
    [defaultVisible, allByName],
  );

  return (
    <ColumnPickerBase
      columns={visibleColumns}
      allColumns={allColumns}
      defaultColumns={defaultColumns}
      enabled
      open={open}
      onOpenChange={setOpen}
      onApply={onApply}
      // Embedded toolbar sits in a tight header strip alongside the
      // SearchInput; the entity-list page's "default" size + bordered
      // chrome looks oversized here. Compact + plain matches the
      // surrounding muted controls.
      triggerSize="compact"
      triggerChrome="plain"
      // Transparent backdrop keeps the parent document page (Purchase
      // Invoice header card, tab bar, action icons) at full clarity
      // behind the drawer — matches the "Comments" side-panel UX.
      backdrop="transparent"
      // Suppress the hidden-column count badge on the trigger. The
      // drawer header ("List Columns N/M") already shows this number,
      // and the toolbar reads cleaner without the numeric pill.
      showHiddenCount={false}
    />
  );
}

function entityFieldToResolvedColumn(field: EntityField): ResolvedColumn {
  return {
    name:         field.name,
    label:        field.label ?? field.name,
    dataType:     field.data_type,
    uiType:       field.ui_type ?? undefined,
    columnName:   field.column_name,
    isSortable:   field.is_sortable,
    isFilterable: field.is_filterable,
  } as ResolvedColumn;
}
