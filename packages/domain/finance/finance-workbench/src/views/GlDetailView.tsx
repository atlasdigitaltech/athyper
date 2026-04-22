"use client";

import { cn } from "@athyper/theme/utils";
import { fmtCompact } from "../components/format";
import { AmountCell } from "../components/AmountCell";
import { PeriodStatusBar } from "../components/PeriodStatusBar";
import type { FinanceScope } from "../lib/scope";
import { useGlDetail } from "../hooks/useGlDetail";

interface GlDetailViewProps {
  scope: FinanceScope;
  accountCode: string;
}

export function GlDetailView({ scope, accountCode }: GlDetailViewProps) {
  const { data, isLoading, isError } = useGlDetail({ scope, accountCode });

  if (!accountCode) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        Select an account to view the GL ledger card.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground animate-pulse">
        Loading GL detail…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-destructive">
        Failed to load GL detail.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 min-w-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-0 py-1.5 border-b">
        <span className="font-mono text-doc-subtitle text-muted-foreground">{data.accountCode}</span>
        <span className="text-xs font-semibold">{data.accountName}</span>
        <span className="text-doc-label px-1.5 py-0 rounded border bg-muted text-muted-foreground uppercase font-medium">
          {data.accountClass}
        </span>
        <PeriodStatusBar
          fiscalYear={scope.fiscalYear}
          period={scope.period}
          status={null}
        />
        {data.isLive && (
          <span className="text-doc-label font-medium px-1.5 py-0 rounded border bg-primary/10 text-primary border-primary/30">
            Live
          </span>
        )}
        <div className="flex-1" />
        <div className="flex items-center gap-4 text-doc-support text-muted-foreground pr-1">
          <div className="text-right">
            <div className="text-doc-label uppercase">Opening</div>
            <AmountCell value={data.openingBalance} compact colorize />
          </div>
          <div className="text-right">
            <div className="text-doc-label uppercase">Closing</div>
            <AmountCell value={data.closingBalance} compact colorize />
          </div>
        </div>
      </div>

      {/* Lines table */}
      {data.lines.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-8">
          No postings for this period.
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50 border-b text-doc-support text-muted-foreground">
                <th className="py-1.5 px-2 text-left font-medium">Date</th>
                <th className="py-1.5 px-2 text-left font-medium">Ref</th>
                <th className="py-1.5 px-2 text-left font-medium">Description</th>
                <th className="py-1.5 px-2 text-right font-medium w-24">Debit</th>
                <th className="py-1.5 px-2 text-right font-medium w-24">Credit</th>
                <th className="py-1.5 px-2 text-right font-medium w-28">Balance</th>
              </tr>
            </thead>
            <tbody>
              {/* Opening row */}
              <tr className="border-b bg-muted/20 text-doc-support">
                <td className="py-1 px-2 text-muted-foreground">—</td>
                <td className="py-1 px-2 text-muted-foreground italic" colSpan={2}>Opening balance</td>
                <td className="py-1 px-2" />
                <td className="py-1 px-2" />
                <td className="py-1 px-2 text-right font-mono font-medium">
                  {fmtCompact(data.openingBalance)}
                </td>
              </tr>

              {/* Transaction lines */}
              {data.lines.map((line) => (
                <tr
                  key={line.journalLineId as string}
                  className="border-b last:border-0 hover:bg-muted/20 text-doc-support"
                >
                  <td className="py-1 px-2 font-mono text-muted-foreground whitespace-nowrap">
                    {String(line.postingDate).slice(0, 10)}
                  </td>
                  <td className="py-1 px-2 font-mono text-doc-label text-muted-foreground whitespace-nowrap">
                    {String(line.entryNumber)}
                  </td>
                  <td className="py-1 px-2 truncate max-w-xs">
                    {String(line.narration ?? line.sourceDocType ?? "—")}
                  </td>
                  <td className="py-1 px-2 text-right">
                    <AmountCell
                      value={(line.debitAmount as number) || 0}
                      compact
                      dashZero
                    />
                  </td>
                  <td className="py-1 px-2 text-right">
                    <AmountCell
                      value={(line.creditAmount as number) || 0}
                      compact
                      dashZero
                    />
                  </td>
                  <td className={cn(
                    "py-1 px-2 text-right font-mono font-medium",
                    (line.runningBalance as number) < 0 && "text-destructive",
                  )}>
                    {fmtCompact(line.runningBalance as number)}
                  </td>
                </tr>
              ))}

              {/* Closing row */}
              <tr className="border-t bg-muted/30 text-doc-support font-semibold">
                <td className="py-1.5 px-2 text-muted-foreground">—</td>
                <td className="py-1.5 px-2 italic text-muted-foreground" colSpan={2}>Closing balance</td>
                <td className="py-1.5 px-2" />
                <td className="py-1.5 px-2" />
                <td className="py-1.5 px-2 text-right font-mono">
                  {fmtCompact(data.closingBalance)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
