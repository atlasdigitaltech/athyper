/**
 * ExcelView — spreadsheet-style tabular view for EntityListPage
 *
 * Renders all visible columns in a dense, monospace-accented table that
 * resembles a spreadsheet. Differences from DataTable:
 *   - No row hover / selection — read-only export-preview layout
 *   - All columns shown (no hiding); first column sticky-left
 *   - Aggregation footer shown when aggregations prop is provided
 *   - Row click still navigates to record detail
 *   - Compact fixed-size rows for maximum data density
 */
"use client";

import { cn } from "@athyper/theme/utils";
import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import type { ColumnPresentation } from "@athyper/api-contracts/entity-list";

export interface ExcelViewProps {
  rows:              Record<string, unknown>[];
  entity:            CompiledEntity;
  /** Ordered list of visible field names. When empty, all entity fields are shown. */
  visibleColumns?:   string[];
  presentationConfig?: { columns: ColumnPresentation[] };
  onRowClick?:       (row: Record<string, unknown>) => void;
  onRowContextMenu?: (row: Record<string, unknown>, e: { clientX: number; clientY: number; preventDefault(): void }) => void;
  aggregations?:     Record<string, number | null>;
  loading?:          boolean;
}

export function ExcelView({
  rows,
  entity,
  visibleColumns,
  presentationConfig,
  onRowClick,
  onRowContextMenu,
  aggregations,
  loading = false,
}: ExcelViewProps) {
  // Resolve ordered fields — sorted by sort_order for consistent column order
  const allFields = [...entity.fields].sort((a, b) => a.sort_order - b.sort_order);
  const orderedFields = visibleColumns && visibleColumns.length > 0
    ? visibleColumns
        .map((name) => allFields.find((f) => f.name === name))
        .filter((f): f is (typeof allFields)[number] => f != null)
    : allFields;

  const getLabel = (fieldName: string) => {
    const pres = presentationConfig?.columns.find((c) => c.fieldName === fieldName);
    return pres?.label ?? entity.fields.find((f) => f.name === fieldName)?.label ?? fieldName;
  };

  const formatCell = (value: unknown, fieldName: string): string => {
    if (value == null) return "";
    const field = entity.fields.find((f) => f.name === fieldName);
    if (field?.data_type === "money" || field?.data_type === "decimal") {
      const n = typeof value === "number" ? value : parseFloat(String(value));
      if (!isNaN(n)) return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (field?.data_type === "date" || field?.data_type === "datetime") {
      const d = new Date(String(value));
      if (!isNaN(d.getTime())) return d.toLocaleDateString();
    }
    return String(value);
  };

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  const hasAgg = aggregations && Object.keys(aggregations).length > 0 && rows.length > 0;

  return (
    <div className="overflow-auto rounded-md border max-h-[calc(100dvh-10rem)] min-h-[50dvh]">
      <table className="w-full text-xs font-mono border-collapse">
        {/* Header */}
        <thead className="sticky top-0 z-10 bg-muted">
          <tr>
            {/* Row-number column */}
            <th className="sticky left-0 z-20 w-9 border-b border-r bg-muted px-2 py-1 text-right text-2xs text-muted-foreground/60 select-none">
              #
            </th>
            {orderedFields.map((field, idx) => (
              <th
                key={field.name}
                className={cn(
                  "whitespace-nowrap border-b border-r px-2 py-1 text-left font-semibold text-muted-foreground",
                  idx === 0 && "sticky left-9 z-10 bg-muted shadow-[1px_0_0_0_hsl(var(--border))]",
                )}
              >
                {getLabel(field.name)}
              </th>
            ))}
          </tr>
        </thead>

        {/* Body */}
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={orderedFields.length + 1}
                className="h-20 text-center text-sm text-muted-foreground"
              >
                No records
              </td>
            </tr>
          ) : (
            rows.map((row, rowIdx) => (
              <tr
                key={String(row.id ?? rowIdx)}
                className={cn(
                  "border-b hover:bg-primary/5 transition-colors",
                  onRowClick && "cursor-pointer",
                )}
                onClick={() => onRowClick?.(row)}
                onContextMenu={(e) => onRowContextMenu?.(row, e)}
              >
                {/* Row number */}
                <td className="sticky left-0 z-10 w-9 border-r bg-background px-2 py-0.5 text-right text-2xs text-muted-foreground/50 select-none">
                  {rowIdx + 1}
                </td>
                {orderedFields.map((field, idx) => (
                  <td
                    key={field.name}
                    className={cn(
                      "border-r px-2 py-0.5 whitespace-nowrap",
                      idx === 0 && "sticky left-9 z-10 bg-background shadow-[1px_0_0_0_hsl(var(--border))]",
                      (field.data_type === "money" || field.data_type === "decimal" || field.data_type === "integer")
                        && "text-right tabular-nums",
                    )}
                  >
                    {formatCell(row[field.name], field.name)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>

        {/* Aggregation footer */}
        {hasAgg && (
          <tfoot className="sticky bottom-0 z-10 border-t-2 bg-muted font-semibold">
            <tr>
              <td className="sticky left-0 z-20 w-9 border-r bg-muted px-2 py-1 text-right text-2xs text-muted-foreground/60">
                Σ
              </td>
              {orderedFields.map((field, idx) => {
                const val = aggregations![field.name];
                return (
                  <td
                    key={field.name}
                    className={cn(
                      "border-r px-2 py-1 text-right tabular-nums",
                      idx === 0 && "sticky left-9 z-10 bg-muted",
                    )}
                  >
                    {val != null
                      ? val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : null}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
