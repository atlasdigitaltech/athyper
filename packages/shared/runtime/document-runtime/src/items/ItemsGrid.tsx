"use client";

import React from "react";
import { FileText, SplitSquareHorizontal } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import type { DocumentLine, AccountingDistribution } from "@athyper/api-contracts/documents";

// ── Column registry ───────────────────────────────────────────────────────────

export type ItemsGridColumn =
  | "lineNumber"
  | "itemCode"
  | "description"
  | "quantity"
  | "unitCode"
  | "unitPrice"
  | "lineAmount"
  | "taxCode"
  | "taxAmount"
  | "allocatedTo";

const COLUMN_LABELS: Record<ItemsGridColumn, string> = {
  lineNumber:  "#",
  itemCode:    "Item",
  description: "Description",
  quantity:    "Qty",
  unitCode:    "Unit",
  unitPrice:   "Unit Price",
  lineAmount:  "Amount",
  taxCode:     "Tax Code",
  taxAmount:   "Tax Amount",
  allocatedTo: "Allocated To",
};

const COLUMN_ALIGN: Record<ItemsGridColumn, "left" | "right" | "center"> = {
  lineNumber:  "center",
  itemCode:    "left",
  description: "left",
  quantity:    "right",
  unitCode:    "center",
  unitPrice:   "right",
  lineAmount:  "right",
  taxCode:     "center",
  taxAmount:   "right",
  allocatedTo: "left",
};

const DEFAULT_COLUMNS: ItemsGridColumn[] = [
  "lineNumber", "itemCode", "description", "quantity", "unitCode", "unitPrice", "lineAmount",
];

// ── Cell renderer ─────────────────────────────────────────────────────────────

function fmtNum(v: unknown, decimals = 2): string {
  const n = Number(v);
  return isNaN(n) ? "—" : n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function cellValue(line: DocumentLine, col: ItemsGridColumn, lineDists?: AccountingDistribution[]): React.ReactNode {
  switch (col) {
    case "lineNumber":  return String(line.line_number);
    case "itemCode":    return line.item_code    ?? "—";
    case "description": return line.description  ?? "—";
    case "quantity":    return line.quantity   != null ? fmtNum(line.quantity, 0) : "—";
    case "unitCode":    return line.unit_code   ?? "—";
    case "unitPrice":   return line.unit_price  != null ? fmtNum(line.unit_price)  : "—";
    case "lineAmount":  return line.line_amount != null ? fmtNum(line.line_amount) : "—";
    case "taxCode":     return line.tax_code ?? "—";
    case "taxAmount":   return line.tax_amount  != null ? fmtNum(line.tax_amount)  : "—";
    case "allocatedTo": {
      if (!lineDists || lineDists.length === 0) return <span className="text-muted-foreground/50">—</span>;
      if (lineDists.length === 1) {
        const d = lineDists[0];
        const label = d!.account_code ?? (d!.cost_center_id ? "CC" : d!.spend_category_id ? "CAT" : "DIST");
        return (
          <span className="inline-flex items-center h-[18px] px-[6px] rounded-[4px] text-2xs font-mono font-semibold bg-muted border border-border/60 text-muted-foreground leading-none">
            {label}
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 h-[18px] px-[6px] rounded-[4px] text-2xs font-semibold bg-info/10 border border-info/20 text-info leading-none">
          <SplitSquareHorizontal className="h-[10px] w-[10px]" />
          {lineDists.length} splits
        </span>
      );
    }
  }
}

// ── Public component ──────────────────────────────────────────────────────────

export interface ItemsGridProps {
  lines: DocumentLine[];
  columns?: ItemsGridColumn[];
  /** Currency code shown in header for amount columns */
  currencyCode?: string;
  /** Accounting distributions for all lines — enables Allocated To column */
  distributions?: AccountingDistribution[];
  /** Currently selected line ID */
  selectedLineId?: string;
  /** Called when user clicks a row */
  onLineSelect?: (line: DocumentLine) => void;
}

export function ItemsGrid({
  lines,
  columns = DEFAULT_COLUMNS,
  currencyCode,
  distributions,
  selectedLineId,
  onLineSelect,
}: ItemsGridProps) {
  // Resolve effective columns — inject allocatedTo after description when distributions are passed.
  // Must happen before early returns so column logic is consistent.
  const effectiveCols: ItemsGridColumn[] = React.useMemo(() => {
    if (!distributions) return columns;
    if (columns.includes("allocatedTo")) return columns;
    const descIdx = columns.indexOf("description");
    const insertAt = descIdx >= 0 ? descIdx + 1 : columns.length;
    return [...columns.slice(0, insertAt), "allocatedTo", ...columns.slice(insertAt)];
  }, [columns, distributions]);

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <FileText className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No line items</p>
      </div>
    );
  }

  // Build distribution map keyed by source_line_id for O(1) lookup
  const distByLine = new Map<string, AccountingDistribution[]>();
  if (distributions) {
    for (const d of distributions) {
      const key = d.source_line_id;
      const arr = distByLine.get(key) ?? [];
      arr.push(d);
      distByLine.set(key, arr);
    }
  }

  // Footer totals for numeric columns
  const amountCols: ItemsGridColumn[] = ["lineAmount", "taxAmount"];
  const colTotals = new Map<ItemsGridColumn, number>();
  for (const col of amountCols) {
    if (!effectiveCols.includes(col)) continue;
    const field = col === "lineAmount" ? "line_amount" : "tax_amount";
    const sum = lines.reduce((acc, l) => acc + (Number(l[field as keyof DocumentLine]) || 0), 0);
    colTotals.set(col, sum);
  }
  const hasFooter = colTotals.size > 0;
  const isInteractive = !!onLineSelect;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            {effectiveCols.map((col) => (
              <th
                key={col}
                className={`px-3 py-2.5 text-${COLUMN_ALIGN[col]} text-xs font-medium text-muted-foreground whitespace-nowrap`}
              >
                {col === "lineAmount" && currencyCode
                  ? `Amount (${currencyCode})`
                  : COLUMN_LABELS[col]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {lines.map((line) => {
            const isSelected = selectedLineId === line.id;
            const lineDists  = distByLine.get(line.id);
            return (
              <tr
                key={line.id}
                onClick={isInteractive ? () => onLineSelect(line) : undefined}
                className={cn(
                  "transition-colors",
                  isInteractive && "cursor-pointer",
                  isSelected
                    ? "bg-accent/50 hover:bg-accent/60"
                    : "hover:bg-muted/30",
                )}
              >
                {effectiveCols.map((col) => (
                  <td
                    key={col}
                    className={`px-3 py-2.5 text-${COLUMN_ALIGN[col]} text-sm ${
                      col === "itemCode"   ? "font-mono text-xs" :
                      col === "lineNumber" ? "text-muted-foreground tabular-nums" :
                      col === "lineAmount" || col === "taxAmount" || col === "unitPrice" ? "tabular-nums font-medium" : ""
                    }`}
                  >
                    {cellValue(line, col, lineDists)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
        {hasFooter && (
          <tfoot className="border-t bg-muted/30">
            <tr>
              {effectiveCols.map((col, i) => (
                <td
                  key={col}
                  className={`px-3 py-2.5 text-${COLUMN_ALIGN[col]} text-xs font-semibold tabular-nums`}
                >
                  {i === 0 ? `${lines.length} item${lines.length !== 1 ? "s" : ""}` :
                   colTotals.has(col)
                     ? fmtNum(colTotals.get(col)!)
                     : ""}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
