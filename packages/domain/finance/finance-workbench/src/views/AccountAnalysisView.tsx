"use client";

import { cn } from "@athyper/theme/utils";
import { fmtFull, fmtCompact } from "../components/format";
import type { FinanceScope } from "../lib/scope";
import { useAccountAnalysis } from "../hooks/useAccountAnalysis";

interface AccountAnalysisViewProps {
  scope:       FinanceScope;
  accountCode: string;
}

function DeltaBadge({ value }: { value: number }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const pos = value > 0;
  return (
    <span className={cn("font-mono", pos ? "text-emerald-600" : "text-rose-600")}>
      {pos ? "+" : ""}{fmtCompact(value)}
    </span>
  );
}

export function AccountAnalysisView({ scope, accountCode }: AccountAnalysisViewProps) {
  const { data, isLoading, isError } = useAccountAnalysis({ scope, accountCode });

  if (!accountCode) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        Enter an account code above to run the analysis.
      </div>
    );
  }

  if (!scope.scopeId) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        Select a scope to run account analysis.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground animate-pulse">
        Loading account analysis…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-destructive">
        Failed to load account analysis.
      </div>
    );
  }

  const { periods } = data;

  return (
    <div className="space-y-3">
      {/* Account header */}
      <div className="flex items-center gap-3 rounded-lg border bg-muted/20 px-4 py-2.5">
        <span className="font-mono text-xs text-muted-foreground">{data.accountCode}</span>
        <span className="font-semibold text-sm">{data.accountName}</span>
        <span className="text-[10px] rounded border bg-background px-1.5 py-0.5 uppercase font-medium text-muted-foreground">
          {data.accountClass}
        </span>
        <span className="text-[10px] rounded border bg-background px-1.5 py-0.5 text-muted-foreground">
          Normal: {data.normalBalance}
        </span>
        {data.isLive && (
          <span className="text-[10px] rounded border bg-blue-50 border-blue-200 px-1.5 py-0.5 text-blue-600 font-medium">
            Live
          </span>
        )}
        <div className="flex-1" />
        <div className="flex gap-6 text-xs text-muted-foreground">
          <div className="text-right">
            <div className="text-[9px] uppercase mb-0.5">Year Opening</div>
            <span className="font-mono font-medium text-foreground">{fmtCompact(data.yearOpeningBalance)}</span>
          </div>
          <div className="text-right">
            <div className="text-[9px] uppercase mb-0.5">Year Closing</div>
            <span className="font-mono font-medium text-foreground">{fmtCompact(data.yearClosingBalance)}</span>
          </div>
        </div>
      </div>

      {/* Period-by-period table */}
      {periods.length === 0 ? (
        <div className="flex items-center justify-center h-20 text-sm text-muted-foreground rounded-xl border border-dashed">
          No activity for FY{scope.fiscalYear}.
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="py-2 px-3 text-left font-medium text-muted-foreground w-20">Period</th>
                <th className="py-2 px-3 text-right font-medium text-muted-foreground">Opening</th>
                <th className="py-2 px-3 text-right font-medium text-muted-foreground">Debits</th>
                <th className="py-2 px-3 text-right font-medium text-muted-foreground">Credits</th>
                <th className="py-2 px-3 text-right font-medium text-muted-foreground">Net</th>
                <th className="py-2 px-3 text-right font-medium text-muted-foreground">Closing</th>
                <th className="py-2 px-3 text-right font-medium text-muted-foreground w-16"># JEs</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr
                  key={String(p.period)}
                  className={cn(
                    "border-b last:border-0 hover:bg-muted/30",
                    p.entryCount === 0 && "opacity-50",
                  )}
                >
                  <td className="py-1.5 px-3 font-medium">{p.periodLabel}</td>
                  <td className="py-1.5 px-3 text-right font-mono text-muted-foreground">
                    {fmtFull(p.openingBalance)}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono text-emerald-700">
                    {p.totalDebits ? fmtFull(p.totalDebits) : "—"}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono text-rose-700">
                    {p.totalCredits ? fmtFull(p.totalCredits) : "—"}
                  </td>
                  <td className="py-1.5 px-3 text-right">
                    <DeltaBadge value={p.netMovement} />
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono font-semibold">
                    {fmtFull(p.closingBalance)}
                  </td>
                  <td className="py-1.5 px-3 text-right text-muted-foreground">{p.entryCount || "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/50 border-t-2 font-semibold">
                <td className="py-2 px-3">FY Total</td>
                <td className="py-2 px-3 text-right font-mono">{fmtFull(data.yearOpeningBalance)}</td>
                <td className="py-2 px-3 text-right font-mono text-emerald-700">{fmtFull(data.yearTotalDebits)}</td>
                <td className="py-2 px-3 text-right font-mono text-rose-700">{fmtFull(data.yearTotalCredits)}</td>
                <td className="py-2 px-3 text-right">
                  <DeltaBadge value={data.yearClosingBalance - data.yearOpeningBalance} />
                </td>
                <td className="py-2 px-3 text-right font-mono font-bold">{fmtFull(data.yearClosingBalance)}</td>
                <td className="py-2 px-3 text-right text-muted-foreground">
                  {periods.reduce((s, p) => s + p.entryCount, 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
