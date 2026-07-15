"use client";

import { type ChangeEvent } from "react";
import type { SourceColumn } from "@athyper/runtime-contracts";
import {
  adapterRequiresQty,
  adapterRequiresUom,
  readRowId,
  type PickerRowKey,
  type PickerValidationState,
} from "./types";
import type { SourceAdapter } from "../adapter/types";

// ─────────────────────────────────────────────────────────────────────────────
// SourceAdapterPickerGrid — renders the adapter's `picker.columns` as a
// table. Selection + per-row qty/uom inputs are driven by the picker hook
// (see useSourceAdapterPicker). Validation issues surface inline per row.
//
// Intentionally minimal — this is the framework's "good enough" picker grid.
// Apps that want fancier UX (sticky headers, virtualization, drag-to-select)
// can build their own grid against the same hook API.
// ─────────────────────────────────────────────────────────────────────────────

export interface SourceAdapterPickerGridProps<
  Selection extends Record<string, unknown>,
> {
  adapter: SourceAdapter<Selection, never, never>;
  rows: Selection[];
  selectedIds: ReadonlySet<PickerRowKey>;
  validation: PickerValidationState;
  onToggleRow(rowId: PickerRowKey): void;
  getQty(rowId: PickerRowKey): number | undefined;
  setQty(rowId: PickerRowKey, qty: number): void;
  getUom(rowId: PickerRowKey): string | undefined;
  setUom(rowId: PickerRowKey, uom: string): void;
}

export function SourceAdapterPickerGrid<Selection extends Record<string, unknown>>(
  props: SourceAdapterPickerGridProps<Selection>,
) {
  const { adapter, rows, selectedIds, validation } = props;
  const columns = adapter.manifest.picker?.columns ?? [];
  const wantsQty = adapterRequiresQty(adapter);
  const wantsUom = adapterRequiresUom(adapter);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <p className="text-sm text-muted-foreground">No items match.</p>
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 z-10 border-b border-border bg-muted/40">
        <tr>
          <th className="w-8 px-2 py-2 text-left" aria-label="Select" />
          {columns.map((c) => (
            <th
              key={c.key}
              className="px-2 py-2 text-left text-xs font-medium text-muted-foreground"
              style={{ width: typeof c.width === "number" ? `${c.width}px` : c.width }}
            >
              {c.label}
            </th>
          ))}
          {wantsQty && (
            <th className="w-24 px-2 py-2 text-left text-xs font-medium text-muted-foreground">
              Qty
            </th>
          )}
          {wantsUom && (
            <th className="w-20 px-2 py-2 text-left text-xs font-medium text-muted-foreground">
              UOM
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const id = readRowId(adapter, row);
          const selected = selectedIds.has(id);
          const issues = validation.rowIssues[id];
          return (
            <tr
              key={id}
              data-row-id={id}
              data-selected={selected ? "true" : "false"}
              className={`border-b border-border/40 hover:bg-muted/30 ${selected ? "bg-muted/40" : ""}`}
            >
              <td className="px-2 py-2">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => props.onToggleRow(id)}
                  aria-label={`Select row ${id}`}
                />
              </td>
              {columns.map((c) => (
                <td key={c.key} className="px-2 py-2">
                  {formatCell(row[c.key], c)}
                </td>
              ))}
              {wantsQty && (
                <td className="px-2 py-2">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={props.getQty(id) ?? ""}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v)) props.setQty(id, v);
                    }}
                    aria-label={`Quantity for row ${id}`}
                    disabled={!selected}
                    className="w-20 rounded border border-border bg-background px-2 py-1 text-xs disabled:opacity-40"
                  />
                </td>
              )}
              {wantsUom && (
                <td className="px-2 py-2">
                  <input
                    type="text"
                    value={props.getUom(id) ?? ""}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => props.setUom(id, e.target.value)}
                    aria-label={`UOM for row ${id}`}
                    disabled={!selected}
                    className="w-16 rounded border border-border bg-background px-2 py-1 text-xs uppercase disabled:opacity-40"
                  />
                </td>
              )}
              {issues && issues.length > 0 && (
                <td colSpan={columns.length + 1 + (wantsQty ? 1 : 0) + (wantsUom ? 1 : 0)}
                  className="border-t-0 px-2 pb-2 text-xs text-destructive">
                  {issues.join(" · ")}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function formatCell(value: unknown, column: SourceColumn): string {
  if (value == null) return "";
  if (column.kind === "money" && typeof value === "number") {
    return value.toFixed(2);
  }
  if (column.kind === "quantity" && typeof value === "number") {
    return value.toString();
  }
  if (column.kind === "date" && typeof value === "string") return value;
  return String(value);
}
