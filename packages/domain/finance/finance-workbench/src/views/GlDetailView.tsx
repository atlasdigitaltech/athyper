"use client";

import { cn } from "@athyper/theme/utils";
import { fmtCompact } from "../components/format";
import { AmountCell } from "../components/AmountCell";
import { PeriodStatusBar } from "../components/PeriodStatusBar";
import type { FinanceScope } from "../lib/scope";
import { openAppRecordFromContextMenu } from "../lib/recordLinks";
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
    <div className="flex min-w-0 flex-col gap-2 text-sm text-foreground">
      {/* Header */}
      <div className="flex min-h-9 items-center gap-3 border-b px-0 py-1.5">
        <span
          className="cursor-context-menu text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          title="Right-click to open this GL account."
          onContextMenu={(event) => openAppRecordFromContextMenu(event, "gl_account", data.accountCode)}
        >
          {data.accountCode}
        </span>
        <span
          className="cursor-context-menu text-sm font-medium underline-offset-2 hover:underline"
          title="Right-click to open this GL account."
          onContextMenu={(event) => openAppRecordFromContextMenu(event, "gl_account", data.accountCode)}
        >
          {data.accountName}
        </span>
        <span className="rounded-full border bg-muted px-2 py-0.5 text-xs font-medium leading-none text-muted-foreground">
          {data.accountClass}
        </span>
        <PeriodStatusBar
          fiscalYear={scope.fiscalYear}
          period={scope.period}
          status={null}
        />
        {data.isLive && (
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium leading-none text-primary">
            Live
          </span>
        )}
        <div className="flex-1" />
        <div className="flex items-center gap-4 pr-1 text-xs text-muted-foreground">
          <div className="text-right">
            <div className="font-medium">Opening</div>
            <AmountCell value={data.openingBalance} compact colorize />
          </div>
          <div className="text-right">
            <div className="font-medium">Closing</div>
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-muted-foreground">
                <th className="px-3 py-2 text-left text-xs font-medium">Date</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Ref</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Description</th>
                <th className="w-24 px-3 py-2 text-right text-xs font-medium">Debit</th>
                <th className="w-24 px-3 py-2 text-right text-xs font-medium">Credit</th>
                <th className="w-28 px-3 py-2 text-right text-xs font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {/* Opening row */}
              <tr className="border-b bg-muted/20 text-xs">
                <td className="py-1 px-2 text-muted-foreground">—</td>
                <td className="py-1 px-2 text-muted-foreground italic" colSpan={2}>Opening balance</td>
                <td className="py-1 px-2" />
                <td className="py-1 px-2" />
                <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                  {fmtCompact(data.openingBalance)}
                </td>
              </tr>

              {/* Transaction lines */}
              {data.lines.map((line) => (
                <tr
                  key={line.journalLineId as string}
                  className="border-b text-sm last:border-0 hover:bg-muted/20"
                >
                  <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                    {String(line.postingDate).slice(0, 10)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                    <span
                      className="cursor-context-menu underline-offset-2 hover:text-foreground hover:underline"
                      title="Right-click to open this journal entry."
                      onContextMenu={(event) => openAppRecordFromContextMenu(event, "journal_entry", String(line.entryNumber))}
                    >
                      {String(line.entryNumber)}
                    </span>
                  </td>
                  <td className="max-w-xs truncate px-3 py-1.5">
                    {String(line.narration ?? line.sourceDocType ?? "—")}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <AmountCell
                      value={(line.debitAmount as number) || 0}
                      compact
                      dashZero
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <AmountCell
                      value={(line.creditAmount as number) || 0}
                      compact
                      dashZero
                    />
                  </td>
                  <td className={cn(
                    "px-3 py-1.5 text-right font-medium tabular-nums",
                    (line.runningBalance as number) < 0 && "text-destructive",
                  )}>
                    {fmtCompact(line.runningBalance as number)}
                  </td>
                </tr>
              ))}

              {/* Closing row */}
              <tr className="border-t bg-muted/30 text-sm font-medium">
                <td className="py-1.5 px-2 text-muted-foreground">—</td>
                <td className="py-1.5 px-2 italic text-muted-foreground" colSpan={2}>Closing balance</td>
                <td className="py-1.5 px-2" />
                <td className="py-1.5 px-2" />
                <td className="px-3 py-2 text-right tabular-nums">
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
