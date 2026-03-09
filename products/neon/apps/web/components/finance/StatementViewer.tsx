"use client";

// components/finance/StatementViewer.tsx
//
// Renders a financial statement instance (P&L, Balance Sheet, etc.)
// with hierarchical line display, prior-year comparison, variance columns,
// and account-level drill-down.

import { useState } from "react";
import {
  Badge,
  Card,
  Button,
} from "@neon/ui";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Send,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/finance/export-csv";
import { downloadStatementXlsx } from "@/lib/finance/export-xlsx";

import type {
  StmtEngineInstanceDTO,
  StmtEngineInstanceLineDTO,
  StatementInstanceStatus,
  AccountBreakdownDTO,
} from "@/lib/finance/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface StatementViewerProps {
  instance: StmtEngineInstanceDTO;
  lines: StmtEngineInstanceLineDTO[];
  onStatusChange?: (
    instanceId: string,
    targetStatus: StatementInstanceStatus,
  ) => void;
  onRefresh?: () => void;
  statusUpdating?: boolean;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<StatementInstanceStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  REVIEWED: "bg-blue-100 text-blue-700",
  APPROVED: "bg-green-100 text-green-700",
  FINALIZED: "bg-purple-100 text-purple-700",
  PUBLISHED: "bg-emerald-100 text-emerald-700",
  SUPERSEDED: "bg-gray-100 text-gray-500",
};

const NEXT_STATUS: Partial<Record<StatementInstanceStatus, StatementInstanceStatus>> = {
  DRAFT: "REVIEWED",
  REVIEWED: "APPROVED",
  APPROVED: "FINALIZED",
  FINALIZED: "PUBLISHED",
};

const STATUS_ACTION_LABEL: Partial<Record<StatementInstanceStatus, string>> = {
  DRAFT: "Mark as Reviewed",
  REVIEWED: "Approve",
  APPROVED: "Finalize",
  FINALIZED: "Publish",
};

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmtAmount(val: string | null): string {
  if (val === null || val === undefined) return "-";
  // eslint-disable-next-line no-restricted-syntax -- DISPLAY_ONLY_FLOAT_OK
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtPct(val: string | null): string {
  if (val === null || val === undefined) return "-";
  // eslint-disable-next-line no-restricted-syntax -- DISPLAY_ONLY_FLOAT_OK
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function varianceColor(val: string | null): string {
  if (!val) return "";
  // eslint-disable-next-line no-restricted-syntax -- DISPLAY_ONLY_FLOAT_OK
  const n = parseFloat(val);
  if (isNaN(n) || n === 0) return "";
  return n > 0 ? "text-green-600" : "text-red-600";
}

// ---------------------------------------------------------------------------
// CSV export helper
// ---------------------------------------------------------------------------

function handleCsvExport(
  instance: StmtEngineInstanceDTO,
  lines: StmtEngineInstanceLineDTO[],
) {
  const hasPrior = lines.some((l) => l.priorAmount !== null);
  const headers = ["Line Code", "Description", "Current"];
  if (hasPrior) headers.push("Prior Year", "Variance", "Var %");

  const rows = lines
    .filter((l) => l.lineType !== "SEPARATOR")
    .map((l) => {
      const row = [l.lineCode, l.label, l.currentAmount];
      if (hasPrior) {
        row.push(
          l.priorAmount ?? "",
          l.varianceAmount ?? "",
          l.variancePct ?? "",
        );
      }
      return row;
    });

  const period =
    instance.periodFrom === instance.periodTo
      ? `P${instance.periodFrom}`
      : `P${instance.periodFrom}-${instance.periodTo}`;
  const filename = `${instance.definitionCode ?? instance.statementType}_FY${instance.fiscalYear}_${period}_${instance.bookCode}.csv`;
  downloadCsv(filename, headers, rows);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StatementViewer({
  instance,
  lines,
  onStatusChange,
  onRefresh,
  statusUpdating,
}: StatementViewerProps) {
  const [expandedLines, setExpandedLines] = useState<Set<string>>(new Set());

  const toggleBreakdown = (lineCode: string) => {
    setExpandedLines((prev) => {
      const next = new Set(prev);
      if (next.has(lineCode)) {
        next.delete(lineCode);
      } else {
        next.add(lineCode);
      }
      return next;
    });
  };

  const nextStatus = NEXT_STATUS[instance.status];
  const isPublished = instance.status === "PUBLISHED";

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">
                {instance.definitionName}
              </h2>
              <Badge className={cn("text-xs", STATUS_COLORS[instance.status])}>
                {instance.status}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              FY {instance.fiscalYear} &middot; Period{" "}
              {instance.periodFrom === instance.periodTo
                ? instance.periodFrom
                : `${instance.periodFrom}-${instance.periodTo}`}
              {" "}&middot; Book: {instance.bookCode}
              {" "}&middot; {instance.currencyCode}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Export buttons */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCsvExport(instance, lines)}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadStatementXlsx(instance, lines)}
            >
              <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
              Excel
            </Button>
            {onRefresh && (
              <Button variant="outline" size="sm" onClick={onRefresh}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Refresh
              </Button>
            )}
            {nextStatus && onStatusChange && (
              <Button
                size="sm"
                disabled={statusUpdating}
                onClick={() => onStatusChange(instance.id, nextStatus)}
              >
                {statusUpdating
                  ? "Updating..."
                  : STATUS_ACTION_LABEL[instance.status]}
              </Button>
            )}
          </div>
        </div>

        {instance.generatedAt && (
          <p className="mt-2 text-xs text-muted-foreground">
            Generated {new Date(instance.generatedAt).toLocaleString()}
            {instance.generationDurationMs != null &&
              ` (${instance.generationDurationMs}ms)`}
            {instance.supersedesId && " \u00b7 Superseded a prior version"}
          </p>
        )}
      </div>

      {/* Statement table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="px-6 py-2.5 font-medium text-muted-foreground w-[40%]">
                Line
              </th>
              <th className="px-3 py-2.5 text-right font-medium text-muted-foreground w-[15%]">
                Current
              </th>
              <th className="px-3 py-2.5 text-right font-medium text-muted-foreground w-[15%]">
                Prior Year
              </th>
              <th className="px-3 py-2.5 text-right font-medium text-muted-foreground w-[15%]">
                Variance
              </th>
              <th className="px-3 py-2.5 text-right font-medium text-muted-foreground w-[15%]">
                Var %
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <StatementLineRow
                key={line.lineCode}
                line={line}
                expanded={expandedLines.has(line.lineCode)}
                onToggle={() => toggleBreakdown(line.lineCode)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {lines.length === 0 && (
        <div className="px-6 py-12 text-center text-muted-foreground">
          No line items in this statement.
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Line row
// ---------------------------------------------------------------------------

function StatementLineRow({
  line,
  expanded,
  onToggle,
}: {
  line: StmtEngineInstanceLineDTO;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isSeparator = line.lineType === "SEPARATOR";
  const isNote = line.lineType === "NOTE";
  const isSection = line.lineType === "SECTION";
  const hasBreakdown =
    line.accountBreakdown && line.accountBreakdown.length > 0;

  if (isSeparator) {
    return (
      <tr>
        <td colSpan={5} className="px-6 py-1">
          <hr className="border-border" />
        </td>
      </tr>
    );
  }

  if (isNote) {
    return (
      <tr>
        <td
          colSpan={5}
          className="px-6 py-1.5 text-xs italic text-muted-foreground"
          style={{ paddingLeft: `${1.5 + line.indentLevel * 1.25}rem` }}
        >
          {line.label}
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr
        className={cn(
          "border-b border-border/50 transition-colors hover:bg-muted/30",
          isSection && "bg-muted/20",
          line.isUnderlined && "border-b-2 border-border",
        )}
      >
        {/* Label */}
        <td
          className={cn("px-6 py-2", line.isBold && "font-semibold")}
          style={{ paddingLeft: `${1.5 + line.indentLevel * 1.25}rem` }}
        >
          <span className="flex items-center gap-1.5">
            {hasBreakdown && (
              <button
                type="button"
                onClick={onToggle}
                className="rounded p-0.5 hover:bg-muted"
                title="Show account breakdown"
              >
                {expanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            )}
            {line.label}
            {line.isCalculated && (
              <Badge variant="outline" className="ml-2 text-[10px] py-0">
                calc
              </Badge>
            )}
          </span>
        </td>

        {/* Current */}
        <td
          className={cn(
            "px-3 py-2 text-right tabular-nums",
            line.isBold && "font-semibold",
          )}
        >
          {isSection ? "" : fmtAmount(line.currentAmount)}
        </td>

        {/* Prior */}
        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
          {isSection ? "" : fmtAmount(line.priorAmount)}
        </td>

        {/* Variance */}
        <td
          className={cn(
            "px-3 py-2 text-right tabular-nums",
            varianceColor(line.varianceAmount),
          )}
        >
          {isSection ? "" : fmtAmount(line.varianceAmount)}
        </td>

        {/* Variance % */}
        <td
          className={cn(
            "px-3 py-2 text-right tabular-nums",
            varianceColor(line.variancePct),
          )}
        >
          {isSection ? "" : fmtPct(line.variancePct)}
        </td>
      </tr>

      {/* Account breakdown (expanded) */}
      {expanded && hasBreakdown && (
        <tr>
          <td colSpan={5} className="bg-muted/10 px-6 py-0">
            <AccountBreakdownTable
              entries={line.accountBreakdown!}
              indentLevel={line.indentLevel}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Account breakdown sub-table
// ---------------------------------------------------------------------------

function AccountBreakdownTable({
  entries,
  indentLevel,
}: {
  entries: AccountBreakdownDTO[];
  indentLevel: number;
}) {
  return (
    <table
      className="w-full text-xs text-muted-foreground"
      style={{ marginLeft: `${1.25 + indentLevel * 1.25}rem` }}
    >
      <tbody>
        {entries.map((e) => (
          <tr key={e.accountId} className="border-b border-dashed border-border/30">
            <td className="py-1 pr-4 font-mono">{e.accountCode}</td>
            <td className="py-1 pr-4">{e.accountName}</td>
            <td className="py-1 text-right tabular-nums">{fmtAmount(e.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
