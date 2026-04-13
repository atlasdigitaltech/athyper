"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button, Skeleton } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import type { FinanceScope } from "../lib/scope";
import type { AccountClass } from "../data/types";
import { useTrialBalance } from "../hooks/useTrialBalance";
import { AccountClassBadge, AccountClassDot } from "../components/ChartBadge";
import { BalanceCard } from "../components/BalanceCard";
import { fmtFull } from "../components/format";

interface TrialBalanceViewProps {
  scope: FinanceScope;
}

export function TrialBalanceView({ scope }: TrialBalanceViewProps) {
  const [viewMode, setViewMode] = useState<"summary" | "detailed">("summary");
  const { data, isLoading, isError } = useTrialBalance(scope);

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
    <div className="space-y-3">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[10px] text-muted-foreground">
          Source: ledger.gl_balance
          {data.asAt && ` · As at ${new Date(data.asAt).toLocaleString()}`}
          {data.isLive && (
            <span className="ml-1.5 text-emerald-600 font-medium">● Live</span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {(["summary", "detailed"] as const).map((v) => (
              <Button
                key={v}
                variant={viewMode === v ? "primary" : "outline"}
                size="sm"
                className="h-7 text-[10px] px-2.5 capitalize"
                onClick={() => setViewMode(v)}
              >
                {v}
              </Button>
            ))}
          </div>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
            <Download size={12} />
            Export
          </Button>
        </div>
      </div>

      {/* Balance summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <BalanceCard label="Total debit"   value={totalDr}           compact />
        <BalanceCard label="Total credit"  value={totalCr}           compact />
        <BalanceCard label="Balance check" value={totalDr - totalCr} variant="check" />
      </div>

      {rows.length === 0 && (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground rounded-xl border border-dashed">
          No balances found for the selected scope and period.
        </div>
      )}

      {/* Summary view — grouped by account class */}
      {viewMode === "summary" && rows.length > 0 && (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="py-2 px-3 text-left font-medium text-muted-foreground">Class</th>
                <th className="py-2 px-3 text-right font-medium text-muted-foreground">Debit</th>
                <th className="py-2 px-3 text-right font-medium text-muted-foreground">Credit</th>
                <th className="py-2 px-3 text-right font-medium text-muted-foreground">Net</th>
                <th className="py-2 px-3 text-right font-medium text-muted-foreground"># Accts</th>
              </tr>
            </thead>
            <tbody>
              {[...classMap.entries()].map(([cls, { debit, credit, count }]) => {
                const accountCls = cls as AccountClass;
                const net = debit - credit;
                return (
                  <tr key={cls} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <AccountClassDot cls={accountCls} />
                        <span className="font-medium capitalize">{cls.replace(/_/g, " ")}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right font-mono">{fmtFull(debit)}</td>
                    <td className="py-2 px-3 text-right font-mono">{fmtFull(credit)}</td>
                    <td className={cn("py-2 px-3 text-right font-mono font-medium", net >= 0 ? "" : "text-destructive")}>
                      {fmtFull(Math.abs(net))}{net < 0 ? " CR" : ""}
                    </td>
                    <td className="py-2 px-3 text-right text-muted-foreground">{count}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted/50 border-t-2">
                <td className="py-2 px-3 font-medium">Total</td>
                <td className="py-2 px-3 text-right font-mono font-medium">{fmtFull(totalDr)}</td>
                <td className="py-2 px-3 text-right font-mono font-medium">{fmtFull(totalCr)}</td>
                <td className={cn("py-2 px-3 text-right font-mono font-bold", balanced ? "text-emerald-600" : "text-destructive")}>
                  {balanced ? "✓" : fmtFull(totalDr - totalCr)}
                </td>
                <td className="py-2 px-3 text-right text-muted-foreground">{rows.length}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Detailed view — individual accounts */}
      {viewMode === "detailed" && rows.length > 0 && (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="py-2 px-3 text-left font-medium text-muted-foreground">Account</th>
                <th className="py-2 px-3 text-left font-medium text-muted-foreground">Name</th>
                <th className="py-2 px-3 text-left font-medium text-muted-foreground">Class</th>
                <th className="py-2 px-3 text-right font-medium text-muted-foreground">Closing DR</th>
                <th className="py-2 px-3 text-right font-medium text-muted-foreground">Closing CR</th>
                <th className="py-2 px-3 text-right font-medium text-muted-foreground">Net</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const net = row.closingDebit - row.closingCredit;
                return (
                  <tr key={row.accountCode} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-1.5 px-3 font-mono text-muted-foreground">{row.accountCode}</td>
                    <td className="py-1.5 px-3">{row.accountName}</td>
                    <td className="py-1.5 px-3"><AccountClassBadge cls={row.accountClass as AccountClass} /></td>
                    <td className="py-1.5 px-3 text-right font-mono">
                      {row.closingDebit ? fmtFull(row.closingDebit) : "—"}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono">
                      {row.closingCredit ? fmtFull(row.closingCredit) : "—"}
                    </td>
                    <td className={cn("py-1.5 px-3 text-right font-mono font-medium", net >= 0 ? "" : "text-destructive")}>
                      {fmtFull(Math.abs(net))}{net < 0 ? " CR" : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted/50 border-t-2">
                <td colSpan={3} className="py-2 px-3 font-medium">Total</td>
                <td className="py-2 px-3 text-right font-mono font-medium">{fmtFull(totalDr)}</td>
                <td className="py-2 px-3 text-right font-mono font-medium">{fmtFull(totalCr)}</td>
                <td className={cn("py-2 px-3 text-right font-mono font-bold", balanced ? "text-emerald-600" : "text-destructive")}>
                  {balanced ? "✓" : fmtFull(totalDr - totalCr)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
