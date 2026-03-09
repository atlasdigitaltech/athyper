"use client";

// components/finance/reporting/DrilldownExplorer.tsx
//
// Interactive dimension drilldown component for dashboard analytics.
// Supports progressive drill: click a row to drill into its children.
// Breadcrumb navigation for drill-back.

import {
  Badge,
  Card,
} from "@neon/ui";
import { AlertTriangle, ChevronRight, CornerDownRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { ReportSkeleton } from "./ReportSkeleton";

import type { DrilldownRowDTO, PnLGroupBy } from "@/lib/finance/reporting-types";
import type { DrilldownBreadcrumb } from "@/lib/finance/use-drilldown";

// ── Types ─────────────────────────────────────────────────────────

interface DrilldownExplorerProps {
  rows: DrilldownRowDTO[];
  totals: {
    periodDebit: string;
    periodCredit: string;
    amountNet: string;
  } | null;
  axis: PnLGroupBy | null;
  breadcrumbs: DrilldownBreadcrumb[];
  onDrillInto?: (row: DrilldownRowDTO) => void;
  onBreadcrumbClick?: (index: number) => void;
  loading?: boolean;
  currencyCode?: string;
  truncated?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────

const amountCell = "text-right font-mono tabular-nums";

function formatAmount(value: string): string {
  // eslint-disable-next-line no-restricted-syntax -- DISPLAY_ONLY_FLOAT_OK
  const num = parseFloat(value || "0");
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function isNegative(value: string): boolean {
  return value.startsWith("-");
}

const AXIS_LABELS: Record<string, string> = {
  cost_center: "Cost Center",
  profit_center: "Profit Center",
  project: "Project",
  region: "Region",
  segment: "Segment",
  location: "Location",
  function: "Function",
  intercompany: "Intercompany",
};

// ── Component ─────────────────────────────────────────────────────

export function DrilldownExplorer({
  rows,
  totals,
  axis,
  breadcrumbs,
  onDrillInto,
  onBreadcrumbClick,
  loading,
  currencyCode = "USD",
  truncated,
}: DrilldownExplorerProps) {
  if (loading) {
    return <ReportSkeleton rows={6} columns={5} />;
  }

  return (
    <div className="space-y-3">
      {/* ── Breadcrumbs ── */}
      {breadcrumbs.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => onBreadcrumbClick?.(- 1)}
            className="hover:text-foreground hover:underline"
          >
            All
          </button>
          {breadcrumbs.map((bc, i) => (
            <span key={`${bc.axis}-${bc.valueId}`} className="flex items-center gap-1">
              <ChevronRight className="size-3" />
              <button
                type="button"
                onClick={() => onBreadcrumbClick?.(i)}
                className="hover:text-foreground hover:underline"
              >
                {bc.label}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* ── Axis label ── */}
      {axis && (
        <div className="flex items-center gap-2">
          <CornerDownRight className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            Drill by {AXIS_LABELS[axis] ?? axis}
          </span>
          <Badge variant="outline" className="text-[10px]">
            {rows.length} {rows.length === 1 ? "item" : "items"}
          </Badge>
        </div>
      )}

      {/* ── Drilldown Table ── */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                {AXIS_LABELS[axis ?? ""] ?? "Dimension"}
              </th>
              <th className={cn("px-3 py-2 text-xs font-medium text-muted-foreground", amountCell)}>
                Debit
              </th>
              <th className={cn("px-3 py-2 text-xs font-medium text-muted-foreground", amountCell)}>
                Credit
              </th>
              <th className={cn("px-3 py-2 text-xs font-medium text-muted-foreground", amountCell)}>
                Net ({currencyCode})
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                Rows
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No data for this drilldown. Select a different axis or period.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={row.dimensionValueId}
                className={cn(
                  "border-b last:border-b-0 hover:bg-muted/30",
                  onDrillInto && "cursor-pointer",
                )}
                onClick={() => onDrillInto?.(row)}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {row.dimensionCode}
                    </span>
                    <span className="font-medium">{row.dimensionName}</span>
                  </div>
                </td>
                <td className={cn("px-3 py-2", amountCell)}>
                  {formatAmount(row.periodDebit)}
                </td>
                <td className={cn("px-3 py-2", amountCell)}>
                  {formatAmount(row.periodCredit)}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 font-medium",
                    amountCell,
                    isNegative(row.amountNet)
                      ? "text-red-600 dark:text-red-400"
                      : "",
                  )}
                >
                  {formatAmount(row.amountNet)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {row.rowCount}
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && totals && (
            <tfoot>
              <tr className="border-t bg-muted/50 font-medium">
                <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                  Totals
                </td>
                <td className={cn("px-3 py-2", amountCell)}>
                  {formatAmount(totals.periodDebit)}
                </td>
                <td className={cn("px-3 py-2", amountCell)}>
                  {formatAmount(totals.periodCredit)}
                </td>
                <td className={cn("px-3 py-2", amountCell)}>
                  {formatAmount(totals.amountNet)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── Truncation Warning ── */}
      {truncated && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            Showing first {rows.length} rows. Select a different axis or refine filters to see the full result.
          </span>
        </div>
      )}
    </div>
  );
}
