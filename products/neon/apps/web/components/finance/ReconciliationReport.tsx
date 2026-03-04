"use client";

// components/finance/ReconciliationReport.tsx
//
// Read-only report summary for a completed bank reconciliation session.
// Shows statement info, match statistics with progress bar, matched lines
// table, and discrepancy indicator.
// MC-4 compliant: all monetary values are opaque strings.

import { Badge, Card, Separator } from "@neon/ui";
import { AlertCircle, Check, Link2 } from "lucide-react";

import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────

interface StatementSummary {
  statementNumber: string;
  bankName: string | null;
  periodStart: string;
  periodEnd: string;
  openingBalance: string;
  closingBalance: string;
  currencyCode: string;
}

interface SessionSummary {
  status: string;
  totalLines: number;
  autoMatched: number;
  manualMatched: number;
  unmatched: number;
  excluded: number;
  discrepancy: string;
  startedAt: string;
  completedAt: string | null;
}

interface MatchedLineRow {
  lineNo: number;
  transactionDate: string;
  amount: string;
  direction: "DEBIT" | "CREDIT";
  reference: string | null;
  matchStatus: string;
  matchConfidence: number | null;
  matchedPaymentId: string | null;
}

interface ReconciliationReportProps {
  statement: StatementSummary;
  session: SessionSummary;
  matchedLines: MatchedLineRow[];
}

// ── Helpers ──────────────────────────────────────────────────────────

const amountCell = "text-right font-mono tabular-nums";

const SESSION_STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  COMPLETED: {
    label: "Completed",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-800",
  },
  OPEN: {
    label: "Open",
    className:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  },
  CANCELLED: {
    label: "Cancelled",
    className:
      "bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400 border-gray-200 dark:border-gray-700",
  },
};

const MATCH_STATUS_SHORT: Record<string, { label: string; className: string }> =
  {
    AUTO_MATCHED: {
      label: "Auto",
      className:
        "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    },
    MANUAL_MATCHED: {
      label: "Manual",
      className:
        "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-800",
    },
    CONFIRMED: {
      label: "Confirmed",
      className:
        "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    },
  };

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatAmount(value: string, currencyCode: string): string {
  try {
    const num = Number(value);
    if (Number.isNaN(num)) return value;
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return value;
  }
}

// ── Component ────────────────────────────────────────────────────────

export function ReconciliationReport({
  statement,
  session,
  matchedLines,
}: ReconciliationReportProps) {
  const statusConfig =
    SESSION_STATUS_CONFIG[session.status] ?? SESSION_STATUS_CONFIG.OPEN;
  const totalMatched = session.autoMatched + session.manualMatched;
  const matchedPercent =
    session.totalLines > 0
      ? Math.round((totalMatched / session.totalLines) * 100)
      : 0;
  const unmatchedPercent =
    session.totalLines > 0
      ? Math.round((session.unmatched / session.totalLines) * 100)
      : 0;
  const discrepancyIsZero =
    session.discrepancy === "0" ||
    session.discrepancy === "0.00" ||
    session.discrepancy === "0.0000";

  return (
    <div className="space-y-6">
      {/* ── Summary Card ── */}
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Reconciliation Report</h3>
            <Badge
              variant="outline"
              className={cn("text-xs", statusConfig.className)}
            >
              {statusConfig.label}
            </Badge>
          </div>

          <Separator />

          {/* Statement Info */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <InfoRow label="Statement" value={statement.statementNumber} />
              {statement.bankName && (
                <InfoRow label="Bank" value={statement.bankName} />
              )}
              <InfoRow
                label="Period"
                value={`${formatDate(statement.periodStart)} \u2013 ${formatDate(statement.periodEnd)}`}
              />
            </div>
            <div className="space-y-2">
              <InfoRow
                label="Opening Balance"
                value={formatAmount(
                  statement.openingBalance,
                  statement.currencyCode,
                )}
                mono
              />
              <InfoRow
                label="Closing Balance"
                value={formatAmount(
                  statement.closingBalance,
                  statement.currencyCode,
                )}
                mono
              />
              <InfoRow label="Currency" value={statement.currencyCode} />
            </div>
          </div>

          {/* Session Timestamps */}
          <Separator />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Started: {formatDateTime(session.startedAt)}</span>
            {session.completedAt && (
              <span>Completed: {formatDateTime(session.completedAt)}</span>
            )}
          </div>
        </div>
      </Card>

      {/* ── Match Statistics ── */}
      <Card className="p-6">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Match Statistics</h3>
          <Separator />

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Matched: {totalMatched} of {session.totalLines} (
                {matchedPercent}%)
              </span>
              <span>
                Unmatched: {session.unmatched} ({unmatchedPercent}%)
              </span>
            </div>
            <div className="relative h-4 overflow-hidden rounded-full bg-muted">
              {/* Auto matched segment */}
              {session.autoMatched > 0 && (
                <div
                  className="absolute inset-y-0 left-0 bg-blue-500 dark:bg-blue-400 transition-all"
                  style={{
                    width: `${session.totalLines > 0 ? (session.autoMatched / session.totalLines) * 100 : 0}%`,
                  }}
                />
              )}
              {/* Manual matched segment */}
              {session.manualMatched > 0 && (
                <div
                  className="absolute inset-y-0 bg-green-500 dark:bg-green-400 transition-all"
                  style={{
                    left: `${session.totalLines > 0 ? (session.autoMatched / session.totalLines) * 100 : 0}%`,
                    width: `${session.totalLines > 0 ? (session.manualMatched / session.totalLines) * 100 : 0}%`,
                  }}
                />
              )}
              {/* Excluded segment */}
              {session.excluded > 0 && (
                <div
                  className="absolute inset-y-0 bg-gray-400 dark:bg-gray-500 transition-all"
                  style={{
                    left: `${session.totalLines > 0 ? ((session.autoMatched + session.manualMatched) / session.totalLines) * 100 : 0}%`,
                    width: `${session.totalLines > 0 ? (session.excluded / session.totalLines) * 100 : 0}%`,
                  }}
                />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <LegendDot
                color="bg-blue-500 dark:bg-blue-400"
                label={`Auto: ${session.autoMatched}`}
              />
              <LegendDot
                color="bg-green-500 dark:bg-green-400"
                label={`Manual: ${session.manualMatched}`}
              />
              <LegendDot
                color="bg-gray-400 dark:bg-gray-500"
                label={`Excluded: ${session.excluded}`}
              />
              <LegendDot
                color="bg-muted"
                label={`Unmatched: ${session.unmatched}`}
              />
            </div>
          </div>

          {/* Discrepancy */}
          <Separator />
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Discrepancy:</span>
            {discrepancyIsZero ? (
              <Badge
                variant="outline"
                className="border-green-600/30 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
              >
                <Check className="size-3 mr-1" />
                Balanced
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-red-600/30 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
              >
                <AlertCircle className="size-3 mr-1" />
                {formatAmount(session.discrepancy, statement.currencyCode)}
              </Badge>
            )}
          </div>
        </div>
      </Card>

      {/* ── Matched Lines Table ── */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium">
          Matched Lines ({matchedLines.length})
        </h4>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="w-10 px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                  #
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Date
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                  Amount
                </th>
                <th className="w-16 px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                  Dir
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Reference
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Match Type
                </th>
                <th className="w-20 px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                  Confidence
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Payment
                </th>
              </tr>
            </thead>
            <tbody>
              {matchedLines.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-8 text-center text-muted-foreground"
                  >
                    No matched lines.
                  </td>
                </tr>
              )}
              {matchedLines.map((line) => {
                const matchConfig =
                  MATCH_STATUS_SHORT[line.matchStatus] ??
                  MATCH_STATUS_SHORT.AUTO_MATCHED;
                const isDebit = line.direction === "DEBIT";

                return (
                  <tr
                    key={`${line.lineNo}-${line.matchedPaymentId}`}
                    className="border-b last:border-b-0 hover:bg-muted/30"
                  >
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {line.lineNo}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDate(line.transactionDate)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2",
                        amountCell,
                        "font-medium",
                        isDebit
                          ? "text-red-600 dark:text-red-400"
                          : "text-green-600 dark:text-green-400",
                      )}
                    >
                      {formatAmount(line.amount, statement.currencyCode)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          isDebit
                            ? "border-red-300 text-red-700 dark:border-red-700 dark:text-red-400"
                            : "border-green-300 text-green-700 dark:border-green-700 dark:text-green-400",
                        )}
                      >
                        {line.direction}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {line.reference ?? "\u2014"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={cn("text-[10px]", matchConfig.className)}
                      >
                        {matchConfig.label}
                      </Badge>
                    </td>
                    <td className={cn("px-3 py-2", amountCell)}>
                      {line.matchConfidence != null ? (
                        <Badge
                          variant="secondary"
                          className="text-[10px] tabular-nums"
                        >
                          {Math.round(line.matchConfidence * 100)}%
                        </Badge>
                      ) : (
                        "\u2014"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {line.matchedPaymentId ? (
                        <span className="inline-flex items-center gap-1 font-mono text-xs">
                          <Link2 className="size-3 text-muted-foreground" />
                          {line.matchedPaymentId}
                        </span>
                      ) : (
                        "\u2014"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-sm font-medium truncate text-right",
          mono && "font-mono tabular-nums",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span className={cn("inline-block h-2.5 w-2.5 rounded-full", color)} />
      {label}
    </span>
  );
}
