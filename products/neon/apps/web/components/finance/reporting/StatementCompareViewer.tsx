"use client";

// components/finance/reporting/StatementCompareViewer.tsx
//
// Renders a line-by-line comparison between two statement sources (live vs
// snapshot, snapshot vs snapshot). Uses changeType classification from the
// comparison API for filtering and row highlighting.
// MC-4 compliant: all monetary values are opaque strings.

import { useState, useMemo, useCallback, useRef } from "react";
import { Card } from "@neon/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowDown,
  ArrowUp,
  ChevronsDown,
  Download,
  GitCompare,
  Minus,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/finance/export-csv";
import { ReportSkeleton } from "./ReportSkeleton";

import type {
  StatementCompareDTO,
  CompareRowDTO,
  CompareSourceInfo,
  ChangeFilter,
  DiagnosticSummary,
} from "@/lib/finance/reporting-types";

// ── Types ─────────────────────────────────────────────────────────

interface StatementCompareViewerProps {
  data: StatementCompareDTO | null;
  loading?: boolean;
  error?: string | null;
  currencyCode?: string;
  onClear?: () => void;
}

// ── Filter options ────────────────────────────────────────────────

const FILTER_OPTIONS: { value: ChangeFilter; label: string }[] = [
  { value: "ALL", label: "All rows" },
  { value: "CHANGED_OR_NEW", label: "Changed + New" },
  { value: "CHANGED", label: "Changed only" },
  { value: "ADDED", label: "Added only" },
  { value: "REMOVED", label: "Removed only" },
];

// ── Helpers ───────────────────────────────────────────────────────

const amountCell = "text-right font-mono tabular-nums";

function formatAmount(value: string): string {
  // eslint-disable-next-line no-restricted-syntax -- DISPLAY_ONLY_FLOAT_OK
  const num = parseFloat(value || "0");
  if (num === 0) return "—";
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function isNegative(value: string): boolean {
  return value.startsWith("-");
}

function DeltaIndicator({ value }: { value: string }) {
  // eslint-disable-next-line no-restricted-syntax -- DISPLAY_ONLY_FLOAT_OK
  const num = parseFloat(value);
  if (num > 0) return <ArrowUp className="inline size-3 text-green-600" />;
  if (num < 0) return <ArrowDown className="inline size-3 text-red-600" />;
  return <Minus className="inline size-3 text-muted-foreground" />;
}

const CHANGE_ROW_CLASS: Record<string, string> = {
  UNCHANGED: "",
  CHANGED: "bg-yellow-50/70 dark:bg-yellow-900/15",
  ADDED: "bg-green-50/70 dark:bg-green-900/15",
  REMOVED: "bg-red-50/70 dark:bg-red-900/15",
};

function sourceLabel(info: CompareSourceInfo): string {
  if (info.type === "live") return "Live render";
  const parts = ["Snapshot"];
  if (info.triggerContext) {
    parts.push(
      info.triggerContext === "PERIOD_CLOSE"
        ? "(period close)"
        : info.triggerContext === "MANUAL"
          ? "(manual)"
          : "(scheduled)",
    );
  }
  if (info.generatedAt) {
    parts.push(`· ${new Date(info.generatedAt).toLocaleDateString()}`);
  }
  return parts.join(" ");
}

function diagnosticLabel(summary: DiagnosticSummary | null, count: number): string | null {
  if (count === 0 || !summary) return null;
  const parts: string[] = [];
  if (summary.errorCount > 0) parts.push(`${summary.errorCount} error${summary.errorCount !== 1 ? "s" : ""}`);
  if (summary.warningCount > 0) parts.push(`${summary.warningCount} warning${summary.warningCount !== 1 ? "s" : ""}`);
  if (summary.infoCount > 0) parts.push(`${summary.infoCount} info`);
  return parts.join(" · ");
}

// ── Component ─────────────────────────────────────────────────────

export function StatementCompareViewer({
  data,
  loading,
  error,
  currencyCode = "USD",
  onClear,
}: StatementCompareViewerProps) {
  const [changeFilter, setChangeFilter] = useState<ChangeFilter>("ALL");
  const tableRef = useRef<HTMLDivElement>(null);

  // ── Filtered rows ──

  const visibleRows = useMemo(() => {
    if (!data) return [];
    switch (changeFilter) {
      case "ALL":
        return data.rows;
      case "CHANGED":
        return data.rows.filter((r) => r.changeType === "CHANGED");
      case "ADDED":
        return data.rows.filter((r) => r.changeType === "ADDED");
      case "REMOVED":
        return data.rows.filter((r) => r.changeType === "REMOVED");
      case "CHANGED_OR_NEW":
        return data.rows.filter((r) => r.changeType !== "UNCHANGED");
    }
  }, [data, changeFilter]);

  // ── Jump to first change ──

  const firstChangeIndex = useMemo(() => {
    if (!data) return -1;
    return data.rows.findIndex((r) => r.changeType !== "UNCHANGED");
  }, [data]);

  const handleJumpToChange = useCallback(() => {
    if (firstChangeIndex < 0 || !tableRef.current) return;
    const row = tableRef.current.querySelector(`[data-row-index="${firstChangeIndex}"]`);
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [firstChangeIndex]);

  // ── Export ──

  const handleExportCsv = useCallback(() => {
    if (!data) return;
    const headers = [
      "Row Code", "Label", "Change",
      "Base Net", "Compare Net", "Delta Net", "Delta %",
      "Base Prior", "Compare Prior", "Delta Prior",
    ];
    const csvRows = visibleRows
      .map((r) => [
        r.rowCode,
        r.label,
        r.changeType,
        r.baseNet,
        r.compareNet,
        r.deltaNet,
        r.deltaPct ?? "",
        r.basePriorNet,
        r.comparePriorNet,
        r.deltaPriorNet,
      ]);
    const isoDate = new Date().toISOString().slice(0, 10);
    downloadCsv(
      `compare-${data.definition.statementCode.toLowerCase()}-${isoDate}.csv`,
      headers,
      csvRows,
    );
  }, [data, visibleRows]);

  // ── Loading / empty states ──

  if (loading) {
    return <ReportSkeleton rows={12} columns={7} showSummaryCards />;
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <Card className="p-8 text-center">
        <GitCompare className="mx-auto size-8 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          Select two sources to compare. Choose &ldquo;live&rdquo; for the current
          render or a snapshot instance ID.
        </p>
      </Card>
    );
  }

  const { definition, summary, base, compare } = data;
  const hasChanges = summary.changedRows + summary.addedRows + summary.removedRows > 0;

  return (
    <div className="space-y-3">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">{definition.name}</h3>
          <p className="text-xs text-muted-foreground">
            Comparison · {sourceLabel(base)} vs {sourceLabel(compare)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && changeFilter === "ALL" && firstChangeIndex >= 0 && (
            <button
              type="button"
              onClick={handleJumpToChange}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50"
            >
              <ChevronsDown className="size-3" />
              Jump to first change
            </button>
          )}
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50"
          >
            <Download className="size-3" />
            Export CSV
          </button>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-4 gap-3">
        <CompareSummaryCard
          label="Changed"
          count={summary.changedRows}
          colorClass="text-yellow-700 dark:text-yellow-400"
          bgClass="bg-yellow-50/70 dark:bg-yellow-900/15"
        />
        <CompareSummaryCard
          label="Added"
          count={summary.addedRows}
          colorClass="text-green-700 dark:text-green-400"
          bgClass="bg-green-50/70 dark:bg-green-900/15"
        />
        <CompareSummaryCard
          label="Removed"
          count={summary.removedRows}
          colorClass="text-red-600 dark:text-red-400"
          bgClass="bg-red-50/70 dark:bg-red-900/15"
        />
        <Card className="p-4 border-primary/30 bg-primary/5">
          <div className="text-xs text-muted-foreground">Total Delta</div>
          <div
            className={cn(
              "mt-1 text-xl font-semibold tabular-nums",
              isNegative(summary.totalDeltaNet)
                ? "text-red-600 dark:text-red-400"
                : "text-green-700 dark:text-green-400",
            )}
          >
            <DeltaIndicator value={summary.totalDeltaNet} />
            {" "}
            {formatAmount(
              summary.totalDeltaNet.startsWith("-")
                ? summary.totalDeltaNet.slice(1)
                : summary.totalDeltaNet,
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {summary.totalRows} rows · {summary.unchangedRows} unchanged
          </div>
        </Card>
      </div>

      {/* ── Source Diagnostic Badges ── */}
      {(base.diagnosticCount > 0 || compare.diagnosticCount > 0) && (
        <div className="flex items-center gap-3 text-xs">
          {base.diagnosticCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 px-2 py-1 text-amber-700 dark:border-amber-800 dark:text-amber-400">
              Base: {diagnosticLabel(base.diagnosticSummary, base.diagnosticCount)}
            </span>
          )}
          {compare.diagnosticCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 px-2 py-1 text-amber-700 dark:border-amber-800 dark:text-amber-400">
              Compare: {diagnosticLabel(compare.diagnosticSummary, compare.diagnosticCount)}
            </span>
          )}
        </div>
      )}

      {/* ── Filter Toolbar ── */}
      <div className="flex items-center gap-3">
        <Select
          value={changeFilter}
          onValueChange={(v) => setChangeFilter(v as ChangeFilter)}
        >
          <SelectTrigger className="h-8 w-44 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {changeFilter === "ALL"
            ? `${data.rows.length} rows`
            : `${visibleRows.length} of ${data.rows.length} rows (${data.summary.unchangedRows} unchanged hidden)`}
        </span>
      </div>

      {/* ── Comparison Table ── */}
      <div ref={tableRef} className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground min-w-[280px]">
                &nbsp;
              </th>
              <th className={cn("px-4 py-2 text-xs font-medium text-muted-foreground min-w-[110px]", amountCell)}>
                Base
              </th>
              <th className={cn("px-4 py-2 text-xs font-medium text-muted-foreground min-w-[110px]", amountCell)}>
                Compare
              </th>
              <th className={cn("px-4 py-2 text-xs font-medium text-muted-foreground min-w-[110px]", amountCell)}>
                Delta
              </th>
              <th className={cn("px-4 py-2 text-xs font-medium text-muted-foreground w-16", amountCell)}>
                %
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground w-20">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  {changeFilter !== "ALL"
                    ? `No ${changeFilter.toLowerCase().replace(/_/g, " ")} rows in this comparison.`
                    : "No comparison data available."}
                </td>
              </tr>
            )}
            {visibleRows.map((row, idx) => {
              // Compute the original index for "jump to change" scroll targeting
              const originalIndex = changeFilter === "ALL"
                ? idx
                : data.rows.indexOf(row);

              return (
                <CompareRow
                  key={row.rowCode}
                  row={row}
                  dataIndex={originalIndex}
                />
              );
            })}
          </tbody>
          {visibleRows.length > 0 && (
            <tfoot>
              <tr className="border-t bg-muted/50 font-medium">
                <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                  Totals ({currencyCode})
                </td>
                <td className={cn("px-4 py-2", amountCell)}>
                  {formatAmount(sumColumn(visibleRows, "baseNet"))}
                </td>
                <td className={cn("px-4 py-2", amountCell)}>
                  {formatAmount(sumColumn(visibleRows, "compareNet"))}
                </td>
                <td className={cn("px-4 py-2", amountCell)}>
                  {formatAmount(sumColumn(visibleRows, "deltaNet"))}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Compare Row ───────────────────────────────────────────────────

function CompareRow({
  row,
  dataIndex,
}: {
  row: CompareRowDTO;
  dataIndex: number;
}) {
  const showAmounts = row.rowType !== "HEADING";

  return (
    <tr
      data-row-index={dataIndex}
      className={cn(
        "border-b last:border-b-0",
        CHANGE_ROW_CLASS[row.changeType] ?? "",
      )}
    >
      {/* Label */}
      <td
        className="px-4 py-1.5"
        style={{ paddingLeft: `${16 + row.indentLevel * 20}px` }}
      >
        {row.label}
      </td>

      {/* Base */}
      <td className={cn("px-4 py-1.5", amountCell)}>
        {showAmounts ? formatAmount(row.baseNet) : ""}
      </td>

      {/* Compare */}
      <td className={cn("px-4 py-1.5", amountCell)}>
        {showAmounts ? formatAmount(row.compareNet) : ""}
      </td>

      {/* Delta */}
      <td
        className={cn(
          "px-4 py-1.5",
          amountCell,
          showAmounts && row.changeType !== "UNCHANGED" && (
            isNegative(row.deltaNet)
              ? "text-red-600 dark:text-red-400"
              : "text-green-700 dark:text-green-400"
          ),
        )}
      >
        {showAmounts && row.changeType !== "UNCHANGED" ? (
          <>
            <DeltaIndicator value={row.deltaNet} />
            {" "}{formatAmount(row.deltaNet)}
          </>
        ) : showAmounts ? (
          "—"
        ) : (
          ""
        )}
      </td>

      {/* Delta % */}
      <td className={cn("px-4 py-1.5 text-muted-foreground", amountCell)}>
        {/* eslint-disable-next-line no-restricted-syntax -- DISPLAY_ONLY_FLOAT_OK */}
        {showAmounts && row.deltaPct != null
          ? `${parseFloat(row.deltaPct).toFixed(1)}%`
          : ""}
      </td>

      {/* Change badge */}
      <td className="px-3 py-1.5 text-center">
        <ChangeTypeBadge changeType={row.changeType} />
      </td>
    </tr>
  );
}

// ── Change Type Badge ─────────────────────────────────────────────

function ChangeTypeBadge({ changeType }: { changeType: string }) {
  switch (changeType) {
    case "CHANGED":
      return (
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300">
          Changed
        </span>
      );
    case "ADDED":
      return (
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
          Added
        </span>
      );
    case "REMOVED":
      return (
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
          Removed
        </span>
      );
    default:
      return null; // UNCHANGED — no badge
  }
}

// ── Summary Card ──────────────────────────────────────────────────

function CompareSummaryCard({
  label,
  count,
  colorClass,
  bgClass,
}: {
  label: string;
  count: number;
  colorClass: string;
  bgClass: string;
}) {
  return (
    <Card className={cn("p-4", count > 0 && bgClass)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-xl font-semibold tabular-nums", count > 0 && colorClass)}>
        {count}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {count === 1 ? "row" : "rows"}
      </div>
    </Card>
  );
}

// ── Utilities ─────────────────────────────────────────────────────

function sumColumn(rows: CompareRowDTO[], key: "baseNet" | "compareNet" | "deltaNet"): string {
  let total = 0;
  for (const row of rows) {
    if (row.rowType === "HEADING" || row.rowType === "SPACER") continue;
    // eslint-disable-next-line no-restricted-syntax -- DISPLAY_ONLY_FLOAT_OK
    total += parseFloat(row[key] || "0");
  }
  return String(total);
}
