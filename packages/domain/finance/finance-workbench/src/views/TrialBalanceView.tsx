"use client";

import { useState } from "react";
import { Button, Skeleton } from "@athyper/platform-ui/primitives";
import { cn } from "@athyper/platform-theme/utils";
import type { FinanceScope } from "../lib/scope";
import type { AccountClass } from "../data/types";
import { useTrialBalance } from "../hooks/useTrialBalance";
import { AccountClassBadge, AccountClassDot } from "../components/ChartBadge";
import { BalanceCard } from "../components/BalanceCard";
import { PeriodStatusBar } from "../components/PeriodStatusBar";
import { ReportHeaderRow, ReportLiveBadge } from "../components/ReportScaffold";
import { openAppRecordFromContextMenu } from "../lib/recordLinks";
import { fmtFull } from "../components/format";
import { usePeriodStatus } from "../hooks/usePeriodStatus";
import { useStatementReportingLens } from "../hooks/useStatementReportingLens";

interface TrialBalanceViewProps {
  scope: FinanceScope;
  viewMode?: TrialBalanceViewMode;
  onViewModeChange?: (mode: TrialBalanceViewMode) => void;
  hideViewModeToggle?: boolean;
  showReportHeader?: boolean;
}

export type TrialBalanceViewMode = "summary" | "detailed";

export function TrialBalanceView({
  scope,
  viewMode,
  onViewModeChange,
  hideViewModeToggle = false,
  showReportHeader = false,
}: TrialBalanceViewProps) {
  const [localViewMode, setLocalViewMode] = useState<TrialBalanceViewMode>("summary");
  const activeViewMode = viewMode ?? localViewMode;
  const { data, isLoading, isError } = useTrialBalance(scope);
  const { data: periodData } = usePeriodStatus(scope);
  const reportingLens = useStatementReportingLens(scope);
  const effectiveStatus = periodData?.[0]?.effectiveStatus ?? null;

  function setViewMode(nextViewMode: TrialBalanceViewMode) {
    if (viewMode === undefined) setLocalViewMode(nextViewMode);
    onViewModeChange?.(nextViewMode);
  }

  if (!scope.scopeId) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        Select a scope to view the trial balance.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-full" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-destructive">
        Failed to load trial balance.
      </div>
    );
  }

  const rows = data.rows;
  const totalDr = rows.reduce((s, r) => s + r.closingDebit,  0);
  const totalCr = rows.reduce((s, r) => s + r.closingCredit, 0);
  const balanced = Math.abs(totalDr - totalCr) < 0.01;

  const viewModeButtons = !hideViewModeToggle ? (
    <div className="flex shrink-0 items-center gap-1">
      {(["summary", "detailed"] as const).map((v) => (
        <Button
          key={v}
          variant={activeViewMode === v ? "primary" : "outline"}
          size="sm"
          className="h-8 rounded-md px-3 text-sm capitalize"
          onClick={() => setViewMode(v)}
        >
          {v}
        </Button>
      ))}
    </div>
  ) : null;

  // Group by accountClass for the summary view
  const classMap = new Map<string, { debit: number; credit: number; count: number }>();
  for (const row of rows) {
    const entry = classMap.get(row.accountClass);
    if (entry) {
      entry.debit  += row.closingDebit;
      entry.credit += row.closingCredit;
      entry.count++;
    } else {
      classMap.set(row.accountClass, { debit: row.closingDebit, credit: row.closingCredit, count: 1 });
    }
  }

  return (
    <div className="space-y-3 text-sm text-foreground">
      {/* Header bar */}
      {showReportHeader && (
        <ReportHeaderRow
          title="Trial Balance"
          meta={
            <>
              <PeriodStatusBar
                fiscalYear={scope.fiscalYear}
                period={scope.period}
                status={reportingLens.isFiscalLens ? effectiveStatus : null}
                companyCode={scope.scopeType === "company" ? scope.scopeId : undefined}
                displayLabel={reportingLens.headerLabel}
              />
              <ReportLiveBadge live={data.isLive} />
            </>
          }
          actions={viewModeButtons}
        />
      )}
      <div className={cn("flex justify-end", showReportHeader && "hidden")}>
        <span className="hidden">
          Source: ledger.gl_balance
          {data.asAt && ` · As at ${new Date(data.asAt).toLocaleString()}`}
          {data.isLive && (
            <span className="ml-1.5 text-success font-medium">● Live</span>
          )}
        </span>
        {!hideViewModeToggle && (
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {(["summary", "detailed"] as const).map((v) => (
              <Button
                key={v}
                variant={activeViewMode === v ? "primary" : "outline"}
                size="sm"
                className="h-8 px-3 text-sm capitalize"
                onClick={() => setViewMode(v)}
              >
                {v}
              </Button>
            ))}
          </div>
        </div>
        )}
      </div>

      {/* Balance summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <BalanceCard label="Total debit"   value={totalDr}           compact />
        <BalanceCard label="Total credit"  value={totalCr}           compact />
        <BalanceCard label="Balance check" value={totalDr - totalCr} variant="check" />
      </div>

      {rows.length === 0 && (
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          No balances found for the selected scope and period.
        </div>
      )}

      {/* Summary view — grouped by account class */}
      {activeViewMode === "summary" && rows.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Class</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Debit</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Credit</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Net</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground"># Accts</th>
              </tr>
            </thead>
            <tbody>
              {[...classMap.entries()].map(([cls, { debit, credit, count }]) => {
                const accountCls = cls as AccountClass;
                const net = debit - credit;
                return (
                  <tr key={cls} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <AccountClassDot cls={accountCls} />
                        <span className="font-medium capitalize">{cls.replace(/_/g, " ")}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtFull(debit)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtFull(credit)}</td>
                    <td className={cn("px-3 py-2 text-right font-medium tabular-nums", net >= 0 ? "" : "text-destructive")}>
                      {fmtFull(Math.abs(net))}{net < 0 ? " CR" : ""}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{count}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 bg-muted/50">
                <td className="px-3 py-2 font-medium">Total</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{fmtFull(totalDr)}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{fmtFull(totalCr)}</td>
                <td className={cn("px-3 py-2 text-right font-medium tabular-nums", balanced ? "text-success" : "text-destructive")}>
                  {balanced ? "✓" : fmtFull(totalDr - totalCr)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{rows.length}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Detailed view — individual accounts */}
      {activeViewMode === "detailed" && rows.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Account</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Name</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Class</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Closing DR</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Closing CR</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Net</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const net = row.closingDebit - row.closingCredit;
                return (
                  <tr key={row.accountCode} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 text-muted-foreground">
                      <span
                        className="cursor-context-menu underline-offset-2 hover:text-foreground hover:underline"
                        title="Right-click to open this GL account."
                        onContextMenu={(event) => openAppRecordFromContextMenu(event, "gl_account", row.accountCode)}
                      >
                        {row.accountCode}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="cursor-context-menu underline-offset-2 hover:underline"
                        title="Right-click to open this GL account."
                        onContextMenu={(event) => openAppRecordFromContextMenu(event, "gl_account", row.accountCode)}
                      >
                        {row.accountName}
                      </span>
                    </td>
                    <td className="px-3 py-2"><AccountClassBadge cls={row.accountClass as AccountClass} /></td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.closingDebit ? fmtFull(row.closingDebit) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.closingCredit ? fmtFull(row.closingCredit) : "—"}
                    </td>
                    <td className={cn("px-3 py-2 text-right font-medium tabular-nums", net >= 0 ? "" : "text-destructive")}>
                      {fmtFull(Math.abs(net))}{net < 0 ? " CR" : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 bg-muted/50">
                <td colSpan={3} className="px-3 py-2 font-medium">Total</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{fmtFull(totalDr)}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{fmtFull(totalCr)}</td>
                <td className={cn("px-3 py-2 text-right font-medium tabular-nums", balanced ? "text-success" : "text-destructive")}>
                  {balanced ? "✓" : fmtFull(totalDr - totalCr)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="flex justify-end">
        <span className="inline-flex max-w-full items-center gap-1 rounded-full border bg-background px-1.5 py-0.5 text-xs leading-none text-muted-foreground shadow-sm">
          <span className="truncate">
            Source: ledger.gl_balance
            {data.asAt && ` \u00b7 As at ${new Date(data.asAt).toLocaleString()}`}
          </span>
          {data.isLive && (
            <span className="inline-flex shrink-0 items-center gap-0.5 font-medium text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Live
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
