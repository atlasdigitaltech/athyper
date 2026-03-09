"use client";

// components/finance/reporting/StatementReport.tsx
//
// Financial statement renderer with proper headings, subtotals, sign rules,
// formulas, and hierarchical row structure. Displays P&L, Balance Sheet, etc.
// MC-4 compliant: all monetary values are opaque strings.

import { useState, useCallback } from "react";
import { Download, ChevronDown, ChevronRight, RefreshCw, AlertTriangle, Bug } from "lucide-react";

import { cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/finance/export-csv";
import { ReportSkeleton } from "./ReportSkeleton";

import type {
  StatementRowDTO,
  StatementDefinitionDTO,
  StatementDiagnostic,
  DiagnosticSummary,
  DisplayStyle,
  EmphasisStyle,
} from "@/lib/finance/reporting-types";

// ── Types ─────────────────────────────────────────────────────────

interface StatementReportProps {
  definition: StatementDefinitionDTO | null;
  rows: StatementRowDTO[];
  fiscalYear: number;
  periodFrom: number;
  periodTo: number;
  bookCode: string;
  loading?: boolean;
  currencyCode?: string;
  diagnosticCount?: number;
  diagnosticSummary?: DiagnosticSummary | null;
  onRefresh?: () => void;
  onFetchDiagnostics?: () => Promise<StatementDiagnostic[]>;
}

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

function periodLabel(from: number, to: number, year: number): string {
  if (from === 1 && to === 12) return `FY ${year}`;
  if (from === to) {
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    return `${months[from - 1] ?? `P${from}`} ${year}`;
  }
  return `P${from}–P${to} ${year}`;
}

// ── Display style mapping ─────────────────────────────────────────

function rowClassName(
  row: StatementRowDTO,
): string {
  const classes: string[] = [];

  // Row type styling
  switch (row.rowType) {
    case "HEADING":
      classes.push("bg-muted/40 font-semibold text-xs text-muted-foreground uppercase tracking-wide");
      break;
    case "SUBTOTAL":
      classes.push("font-semibold");
      break;
    case "FORMULA":
      classes.push("font-semibold");
      break;
    case "RATIO":
      classes.push("text-muted-foreground text-xs italic");
      break;
    case "SPACER":
      classes.push("h-3");
      break;
  }

  // Display style
  switch (row.displayStyle as DisplayStyle) {
    case "BOLD":
      classes.push("font-bold");
      break;
    case "ITALIC":
      classes.push("italic");
      break;
    case "UNDERLINE":
      classes.push("border-b border-foreground/30");
      break;
    case "DOUBLE_LINE":
      classes.push("border-b-2 border-foreground/50");
      break;
    case "SHADED":
      classes.push("bg-muted/30");
      break;
  }

  // Emphasis
  switch (row.emphasisStyle as EmphasisStyle) {
    case "SUCCESS":
      classes.push("text-green-700 dark:text-green-400");
      break;
    case "DANGER":
      classes.push("text-red-600 dark:text-red-400");
      break;
    case "MUTED":
      classes.push("text-muted-foreground");
      break;
    case "PRIMARY":
      classes.push("text-primary");
      break;
  }

  return classes.join(" ");
}

function amountColorClass(value: string, row: StatementRowDTO): string {
  if (row.rowType === "HEADING" || row.rowType === "SPACER") return "";
  if (isNegative(value)) return "text-red-600 dark:text-red-400";
  return "";
}

// ── Component ─────────────────────────────────────────────────────

export function StatementReport({
  definition,
  rows,
  fiscalYear,
  periodFrom,
  periodTo,
  bookCode,
  loading,
  currencyCode = "USD",
  diagnosticCount = 0,
  diagnosticSummary,
  onRefresh,
  onFetchDiagnostics,
}: StatementReportProps) {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [diagnostics, setDiagnostics] = useState<StatementDiagnostic[] | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  const handleShowDiagnostics = useCallback(async () => {
    if (!onFetchDiagnostics) return;
    if (diagnostics) {
      setDiagnostics(null); // toggle off
      return;
    }
    setDiagLoading(true);
    const result = await onFetchDiagnostics();
    setDiagnostics(result);
    setDiagLoading(false);
  }, [onFetchDiagnostics, diagnostics]);

  if (loading) {
    return <ReportSkeleton rows={15} columns={5} />;
  }

  if (!definition) {
    return (
      <div className="py-8 text-center text-muted-foreground text-sm">
        Select a statement definition to render.
      </div>
    );
  }

  // Build set of children for expandable sections
  const childrenOf = new Map<string, StatementRowDTO[]>();
  for (const row of rows) {
    if (row.parentRowCode) {
      const siblings = childrenOf.get(row.parentRowCode) ?? [];
      siblings.push(row);
      childrenOf.set(row.parentRowCode, siblings);
    }
  }

  const toggleSection = (rowCode: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(rowCode)) {
        next.delete(rowCode);
      } else {
        next.add(rowCode);
      }
      return next;
    });
  };

  // Filter visible rows (respect collapse state)
  const visibleRows = rows.filter((row) => {
    if (!row.isVisible) return false;
    // Check if any ancestor is collapsed
    let parentCode = row.parentRowCode;
    while (parentCode) {
      if (collapsedSections.has(parentCode)) return false;
      const parent = rows.find((r) => r.rowCode === parentCode);
      parentCode = parent?.parentRowCode ?? null;
    }
    return true;
  });

  // Zero suppression — DISPLAY_ONLY_FLOAT_OK (boolean zero-check, no arithmetic)
  const displayRows = visibleRows.filter((row) => {
    if (row.showZero) return true;
    if (row.rowType === "HEADING" || row.rowType === "SPACER") return true;
    // eslint-disable-next-line no-restricted-syntax -- DISPLAY_ONLY_FLOAT_OK
    return parseFloat(row.amountNet) !== 0 || parseFloat(row.priorNet) !== 0;
  });

  // eslint-disable-next-line no-restricted-syntax -- DISPLAY_ONLY_FLOAT_OK
  const hasPrior = displayRows.some((r) => parseFloat(r.priorNet) !== 0);

  // Export
  const handleExportCsv = () => {
    const headers = ["Row", "Label", `Current (${periodLabel(periodFrom, periodTo, fiscalYear)})`];
    if (hasPrior) headers.push(`Prior (FY ${fiscalYear - 1})`, "Variance", "Variance %");

    const csvRows = displayRows
      .filter((r) => r.rowType !== "SPACER")
      .map((r) => {
        const indent = "  ".repeat(r.indentLevel);
        const row = [`${indent}${r.rowCode}`, `${indent}${r.label}`, r.amountNet];
        if (hasPrior) {
          row.push(r.priorNet, r.variance, r.variancePct ? `${r.variancePct}%` : "");
        }
        return row;
      });

    const isoDate = new Date().toISOString().slice(0, 10);
    downloadCsv(
      `statement-${definition.statementCode.toLowerCase()}-${bookCode.toLowerCase()}-fy${fiscalYear}-${isoDate}.csv`,
      headers,
      csvRows,
    );
  };

  return (
    <div className="space-y-3">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">{definition.name}</h3>
          <p className="text-xs text-muted-foreground">
            {periodLabel(periodFrom, periodTo, fiscalYear)} · Book: {bookCode} · {currencyCode}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50"
          >
            <Download className="size-3" />
            Export CSV
          </button>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50"
            >
              <RefreshCw className="size-3" />
              Refresh
            </button>
          )}
          {diagnosticCount > 0 && onFetchDiagnostics && (
            <button
              type="button"
              onClick={handleShowDiagnostics}
              disabled={diagLoading}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/30"
              title="Show formula diagnostics"
            >
              <Bug className="size-3" />
              {diagnosticSummary
                ? [
                    diagnosticSummary.errorCount > 0 && `${diagnosticSummary.errorCount} error${diagnosticSummary.errorCount !== 1 ? "s" : ""}`,
                    diagnosticSummary.warningCount > 0 && `${diagnosticSummary.warningCount} warning${diagnosticSummary.warningCount !== 1 ? "s" : ""}`,
                    diagnosticSummary.infoCount > 0 && `${diagnosticSummary.infoCount} info`,
                  ].filter(Boolean).join(" · ")
                : `${diagnosticCount} ${diagnosticCount === 1 ? "issue" : "issues"}`}
            </button>
          )}
        </div>
      </div>

      {/* ── Statement Diagnostics Panel ── */}
      {diagnostics && diagnostics.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-200 dark:border-amber-800">
            <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
              Statement Diagnostics ({diagnostics.length})
            </span>
          </div>
          <ul className="px-3 py-2 space-y-1">
            {diagnostics.map((d, i) => (
              <li key={i} className={cn(
                "text-xs font-mono flex items-center gap-1.5",
                d.severity === "error" && "text-red-700 dark:text-red-400",
                d.severity === "warning" && "text-amber-800 dark:text-amber-300",
                d.severity === "info" && "text-blue-700 dark:text-blue-400",
              )}>
                <span className={cn(
                  "shrink-0 inline-block w-1.5 h-1.5 rounded-full",
                  d.severity === "error" && "bg-red-500",
                  d.severity === "warning" && "bg-amber-500",
                  d.severity === "info" && "bg-blue-500",
                )} />
                <span className="font-semibold">{d.rowCode ?? "STMT"}</span>
                <span className="opacity-60">[{d.code}]</span>
                <span className="opacity-80"> — {d.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Statement Table ── */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground min-w-[300px]">
                &nbsp;
              </th>
              <th className={cn("px-4 py-2 text-xs font-medium text-muted-foreground min-w-[120px]", amountCell)}>
                {periodLabel(periodFrom, periodTo, fiscalYear)}
              </th>
              {hasPrior && (
                <>
                  <th className={cn("px-4 py-2 text-xs font-medium text-muted-foreground min-w-[120px]", amountCell)}>
                    Prior (FY {fiscalYear - 1})
                  </th>
                  <th className={cn("px-4 py-2 text-xs font-medium text-muted-foreground min-w-[100px]", amountCell)}>
                    Variance
                  </th>
                  <th className={cn("px-4 py-2 text-xs font-medium text-muted-foreground w-16", amountCell)}>
                    %
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 && (
              <tr>
                <td
                  colSpan={hasPrior ? 5 : 2}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No statement data. Ensure the reporting cube has been refreshed.
                </td>
              </tr>
            )}
            {displayRows.map((row) => {
              if (row.rowType === "SPACER") {
                return (
                  <tr key={row.rowCode} className="h-3">
                    <td colSpan={hasPrior ? 5 : 2} />
                  </tr>
                );
              }

              const isExpandable = row.isExpandable && childrenOf.has(row.rowCode);
              const isCollapsed = collapsedSections.has(row.rowCode);
              const showAmounts = row.rowType !== "HEADING";

              return (
                <tr
                  key={row.rowCode}
                  className={cn(
                    "border-b last:border-b-0",
                    rowClassName(row),
                  )}
                >
                  {/* Label */}
                  <td
                    className="px-4 py-1.5"
                    style={{ paddingLeft: `${16 + row.indentLevel * 20}px` }}
                  >
                    <div className="flex items-center gap-1">
                      {isExpandable && (
                        <button
                          type="button"
                          onClick={() => toggleSection(row.rowCode)}
                          className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"
                        >
                          {isCollapsed ? (
                            <ChevronRight className="size-3.5" />
                          ) : (
                            <ChevronDown className="size-3.5" />
                          )}
                        </button>
                      )}
                      <span>{row.label}</span>
                    </div>
                  </td>

                  {/* Current Amount */}
                  <td
                    className={cn(
                      "px-4 py-1.5",
                      amountCell,
                      showAmounts && amountColorClass(row.amountNet, row),
                    )}
                  >
                    {showAmounts ? formatAmount(row.amountNet) : ""}
                  </td>

                  {/* Prior + Variance */}
                  {hasPrior && (
                    <>
                      <td
                        className={cn(
                          "px-4 py-1.5 text-muted-foreground",
                          amountCell,
                        )}
                      >
                        {showAmounts ? formatAmount(row.priorNet) : ""}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-1.5",
                          amountCell,
                          showAmounts && amountColorClass(row.variance, row),
                        )}
                      >
                        {showAmounts ? formatAmount(row.variance) : ""}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-1.5 text-muted-foreground",
                          amountCell,
                        )}
                      >
                        {/* eslint-disable-next-line no-restricted-syntax -- DISPLAY_ONLY_FLOAT_OK */}
                        {showAmounts && row.variancePct != null
                          ? `${parseFloat(row.variancePct).toFixed(1)}%`
                          : ""}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
