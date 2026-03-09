"use client";

// components/finance/reporting/PnLReport.tsx
//
// Multi-dimensional P&L report with dimension filtering, grouping, and
// period-over-period comparison. Reads from pre-aggregated cubes for
// near-real-time performance.
// MC-4 compliant: all monetary values are opaque strings.

import { useState } from "react";
import {
  Badge,
  Card,
} from "@neon/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, ArrowDown, ArrowUp, Download, Minus, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/finance/export-csv";
import { ReportSkeleton } from "./ReportSkeleton";

import type { PnLReportRowDTO, PnLGroupBy } from "@/lib/finance/reporting-types";
import { subtractAmounts, compareAmounts } from "@athyper/runtime/services/business/engines/shared/money";

// ── Types ─────────────────────────────────────────────────────────

interface PnLReportProps {
  rows: PnLReportRowDTO[];
  totals: {
    revenue: string;
    expense: string;
    netIncome: string;
    priorRevenue: string | null;
    priorExpense: string | null;
    priorNetIncome: string | null;
  } | null;
  lastRefreshAt: string | null;
  groupBy: PnLGroupBy;
  onGroupByChange?: (groupBy: PnLGroupBy) => void;
  onRefresh?: () => void;
  onRowClick?: (row: PnLReportRowDTO) => void;
  loading?: boolean;
  currencyCode?: string;
  truncated?: boolean;
  bookCode?: string;
  fiscalYear?: number;
}

// ── Helpers ───────────────────────────────────────────────────────

const amountCell = "text-right font-mono tabular-nums";

function isNegative(value: string): boolean {
  return value.startsWith("-");
}

function formatAmount(value: string): string {
  // eslint-disable-next-line no-restricted-syntax -- DISPLAY_ONLY_FLOAT_OK
  const num = parseFloat(value || "0");
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function VarianceIndicator({ value }: { value: string | null }) {
  if (value === null) return null;
  // eslint-disable-next-line no-restricted-syntax -- DISPLAY_ONLY_FLOAT_OK
  const num = parseFloat(value);
  if (num > 0) return <ArrowUp className="inline size-3 text-green-600" />;
  if (num < 0) return <ArrowDown className="inline size-3 text-red-600" />;
  return <Minus className="inline size-3 text-muted-foreground" />;
}

const GROUP_OPTIONS: { value: PnLGroupBy; label: string }[] = [
  { value: "account", label: "By Account" },
  { value: "cost_center", label: "By Cost Center" },
  { value: "profit_center", label: "By Profit Center" },
  { value: "project", label: "By Project" },
  { value: "region", label: "By Region" },
  { value: "segment", label: "By Segment" },
  { value: "period", label: "By Period" },
];

// ── Component ─────────────────────────────────────────────────────

export function PnLReport({
  rows,
  totals,
  lastRefreshAt,
  groupBy,
  onGroupByChange,
  onRefresh,
  onRowClick,
  loading,
  currencyCode = "USD",
  truncated,
  bookCode,
  fiscalYear,
}: PnLReportProps) {
  if (loading) {
    return <ReportSkeleton rows={8} columns={4} showSummaryCards />;
  }

  const hasPrior = totals?.priorRevenue !== null;

  const handleExportCsv = () => {
    const headers = ["Group", "Revenue", "Expenses", "Net Income"];
    if (hasPrior) headers.push("Prior Net", "Variance", "Variance %");
    const csvRows = rows.map((r) => {
      const row = [r.groupLabel, r.revenue, r.expense, r.netIncome];
      if (hasPrior) {
        row.push(r.priorNetIncome ?? "", r.netIncomeVariance ?? "", r.variancePercent ? `${r.variancePercent}%` : "");
      }
      return row;
    });
    const isoDate = new Date().toISOString().slice(0, 10);
    downloadCsv(`pnl-${bookCode ?? "stat"}-fy${fiscalYear ?? new Date().getFullYear()}-${groupBy}-${isoDate}.csv`, headers, csvRows);
  };

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Select
            value={groupBy}
            onValueChange={(v) => onGroupByChange?.(v as PnLGroupBy)}
          >
            <SelectTrigger className="h-8 w-44 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUP_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {lastRefreshAt && (
            <span className="text-xs text-muted-foreground">
              Last refresh: {new Date(lastRefreshAt).toLocaleString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {rows.length > 0 && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50"
            >
              <Download className="size-3" />
              Export CSV
            </button>
          )}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50"
            >
              <RefreshCw className="size-3" />
              Refresh Cube
            </button>
          )}
        </div>
      </div>

      {/* ── Summary Cards ── */}
      {totals && (
        <div className="grid grid-cols-3 gap-3">
          <SummaryCard
            label="Revenue"
            amount={totals.revenue}
            prior={totals.priorRevenue}
            currencyCode={currencyCode}
            positive
          />
          <SummaryCard
            label="Expenses"
            amount={totals.expense}
            prior={totals.priorExpense}
            currencyCode={currencyCode}
          />
          <SummaryCard
            label="Net Income"
            amount={totals.netIncome}
            prior={totals.priorNetIncome}
            currencyCode={currencyCode}
            highlight
          />
        </div>
      )}

      {/* ── Data Table ── */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                {groupBy === "account" ? "Account" : groupBy === "period" ? "Period" : "Dimension"}
              </th>
              <th className={cn("px-3 py-2 text-xs font-medium text-muted-foreground", amountCell)}>
                Revenue
              </th>
              <th className={cn("px-3 py-2 text-xs font-medium text-muted-foreground", amountCell)}>
                Expenses
              </th>
              <th className={cn("px-3 py-2 text-xs font-medium text-muted-foreground", amountCell)}>
                Net Income
              </th>
              {hasPrior && (
                <>
                  <th className={cn("px-3 py-2 text-xs font-medium text-muted-foreground", amountCell)}>
                    Prior Net
                  </th>
                  <th className={cn("px-3 py-2 text-xs font-medium text-muted-foreground", amountCell)}>
                    Variance
                  </th>
                  <th className={cn("px-3 py-2 text-xs font-medium text-muted-foreground", amountCell)}>
                    %
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={hasPrior ? 7 : 4}
                  className="px-3 py-8 text-center text-muted-foreground text-sm"
                >
                  No P&L data for the selected filters. Ensure the cube has been refreshed.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={row.groupKey}
                className={cn(
                  "border-b last:border-b-0 hover:bg-muted/30",
                  onRowClick && "cursor-pointer",
                )}
                onClick={() => onRowClick?.(row)}
              >
                <td className="px-3 py-2 font-medium text-sm">{row.groupLabel}</td>
                <td className={cn("px-3 py-2", amountCell)}>
                  {formatAmount(row.revenue)}
                </td>
                <td className={cn("px-3 py-2", amountCell)}>
                  {formatAmount(row.expense)}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 font-medium",
                    amountCell,
                    isNegative(row.netIncome)
                      ? "text-red-600 dark:text-red-400"
                      : "text-green-700 dark:text-green-400",
                  )}
                >
                  {formatAmount(row.netIncome)}
                </td>
                {hasPrior && (
                  <>
                    <td className={cn("px-3 py-2 text-muted-foreground", amountCell)}>
                      {row.priorNetIncome !== null ? formatAmount(row.priorNetIncome) : "—"}
                    </td>
                    <td className={cn("px-3 py-2", amountCell)}>
                      {row.netIncomeVariance !== null ? (
                        <span
                          className={
                            isNegative(row.netIncomeVariance)
                              ? "text-red-600 dark:text-red-400"
                              : "text-green-700 dark:text-green-400"
                          }
                        >
                          <VarianceIndicator value={row.netIncomeVariance} />
                          {" "}{formatAmount(row.netIncomeVariance)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={cn("px-3 py-2 text-muted-foreground", amountCell)}>
                      {row.variancePercent !== null ? `${row.variancePercent}%` : "—"}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && totals && (
            <tfoot>
              <tr className="border-t bg-muted/50 font-medium">
                <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                  Totals ({currencyCode})
                </td>
                <td className={cn("px-3 py-2", amountCell)}>
                  {formatAmount(totals.revenue)}
                </td>
                <td className={cn("px-3 py-2", amountCell)}>
                  {formatAmount(totals.expense)}
                </td>
                <td className={cn("px-3 py-2", amountCell)}>
                  {formatAmount(totals.netIncome)}
                </td>
                {hasPrior && (
                  <>
                    <td className={cn("px-3 py-2 text-muted-foreground", amountCell)}>
                      {totals.priorNetIncome !== null ? formatAmount(totals.priorNetIncome) : "—"}
                    </td>
                    <td colSpan={2} />
                  </>
                )}
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
            Showing first {rows.length} rows. Refine your filters to see the full result.
          </span>
        </div>
      )}
    </div>
  );
}

// ── Summary Card ──────────────────────────────────────────────────

function SummaryCard({
  label,
  amount,
  prior,
  currencyCode,
  positive,
  highlight,
}: {
  label: string;
  amount: string;
  prior: string | null;
  currencyCode: string;
  positive?: boolean;
  highlight?: boolean;
}) {
  const variance = prior !== null ? subtractAmounts(amount, prior) : null;

  return (
    <Card className={cn("p-4", highlight && "border-primary/30 bg-primary/5")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          highlight && isNegative(amount) && "text-red-600 dark:text-red-400",
          highlight && !isNegative(amount) && "text-green-700 dark:text-green-400",
        )}
      >
        {formatAmount(amount)}
      </div>
      {variance !== null && (
        <div className="mt-1 flex items-center gap-1 text-xs">
          <VarianceIndicator value={variance} />
          <span
            className={
              compareAmounts(variance, "0") >= 0
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }
          >
            {formatAmount(variance.startsWith("-") ? variance.slice(1) : variance)}
          </span>
          <span className="text-muted-foreground">vs prior</span>
        </div>
      )}
    </Card>
  );
}
