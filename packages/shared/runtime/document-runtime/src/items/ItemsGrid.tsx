"use client";

/**
 * ItemsGrid — generic document line items table.
 *
 * Renders a tabular view of DocumentLine[] with configurable columns.
 * Intended for PO, invoice, GR, and other document types.
 *
 * Usage:
 *   <ItemsGrid lines={doc.lines} />
 *   <ItemsGrid lines={doc.lines} columns={["lineNumber","itemCode","description","quantity","amount"]} />
 */

import { FileText } from "lucide-react";
import type { DocumentLine } from "@athyper/api-contracts/documents";

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
  | "taxAmount";

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
};

const DEFAULT_COLUMNS: ItemsGridColumn[] = [
  "lineNumber", "itemCode", "description", "quantity", "unitCode", "unitPrice", "lineAmount",
];

// ── Cell renderer ─────────────────────────────────────────────────────────────

function fmtNum(v: unknown, decimals = 2): string {
  const n = Number(v);
  return isNaN(n) ? "—" : n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function cellValue(line: DocumentLine, col: ItemsGridColumn): string {
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
  }
}

// ── Public component ──────────────────────────────────────────────────────────

export interface ItemsGridProps {
  lines: DocumentLine[];
  columns?: ItemsGridColumn[];
  /** Currency code shown in header for amount columns */
  currencyCode?: string;
}

export function ItemsGrid({
  lines,
  columns = DEFAULT_COLUMNS,
  currencyCode,
}: ItemsGridProps) {
  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <FileText className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No line items</p>
      </div>
    );
  }

  // Footer totals for numeric columns
  const amountCols: ItemsGridColumn[] = ["lineAmount", "taxAmount"];
  const colTotals = new Map<ItemsGridColumn, number>();
  for (const col of amountCols) {
    if (!columns.includes(col)) continue;
    const field = col === "lineAmount" ? "line_amount" : "tax_amount";
    const sum = lines.reduce((acc, l) => acc + (Number(l[field as keyof DocumentLine]) || 0), 0);
    colTotals.set(col, sum);
  }
  const hasFooter = colTotals.size > 0;

  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            {columns.map((col) => (
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
          {lines.map((line) => (
            <tr key={line.id} className="hover:bg-muted/30 transition-colors">
              {columns.map((col) => (
                <td
                  key={col}
                  className={`px-3 py-2.5 text-${COLUMN_ALIGN[col]} text-sm ${
                    col === "itemCode"   ? "font-mono text-xs" :
                    col === "lineNumber" ? "text-muted-foreground tabular-nums" :
                    col === "lineAmount" || col === "taxAmount" || col === "unitPrice" ? "tabular-nums font-medium" : ""
                  }`}
                >
                  {cellValue(line, col)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {hasFooter && (
          <tfoot className="border-t bg-muted/30">
            <tr>
              {columns.map((col, i) => (
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
