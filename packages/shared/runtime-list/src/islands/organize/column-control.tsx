"use client";

/**
 * ColumnControl — URL-driven wrapper around `ColumnPickerBase`.
 *
 * The entire picker UI (drawer, search, sections, drag-to-reorder,
 * Apply/Reset/Discard) lives in `ColumnPickerBase`. This wrapper only
 * supplies:
 *   - URL persistence via `useRouter` + `serializeOrganizeState`.
 *   - Panel open/close state from the `OrganizePalette` provider.
 *
 * Callers outside the OrganizePalette context (e.g. the embedded line
 * items grid in `@athyper/runtime-line-item`) should consume
 * `ColumnPickerBase` directly with their own open-state + persistence.
 */

import { useRouter } from "next/navigation";
import type { ResolvedColumn } from "../../core/types";
import { LIST_URL_PARAMS as P } from "../../core/types";
import { serializeOrganizeState } from "./organize-url";
import { useOrganizePanel } from "./organize-state";
import { ColumnPickerBase } from "./column-picker-base";

interface ColumnControlProps {
  columns:         ResolvedColumn[];
  allColumns:      ResolvedColumn[];
  defaultColumns:  ResolvedColumn[];
  listBaseHref:    string;
  rawSearchParams: Record<string, string | string[] | undefined>;
  enabled:         boolean;
  trigger?:        "button" | "hidden";
}

export function ColumnControl({
  columns,
  allColumns,
  defaultColumns,
  listBaseHref,
  rawSearchParams,
  enabled,
  trigger = "button",
}: ColumnControlProps) {
  const router = useRouter();
  const panel = useOrganizePanel("columns");

  const handleApply = (visible: string[]) => {
    const defaultNames = defaultColumns.map((column) => column.name);
    const matchesDefault = arraysEqual(visible, defaultNames);
    router.push(serializeOrganizeState(listBaseHref, rawSearchParams, {
      [P.COLUMNS]: matchesDefault ? null : visible.join(","),
    }));
  };

  return (
    <ColumnPickerBase
      columns={columns}
      allColumns={allColumns}
      defaultColumns={defaultColumns}
      enabled={enabled}
      open={panel.open}
      onOpenChange={(next) => (next ? panel.show() : panel.close())}
      onApply={handleApply}
      trigger={trigger}
    />
  );
}

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}
