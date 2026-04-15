"use client";

/**
 * PostingTrace — GL posting trace for a single Journal Entry.
 *
 * Renders the JE header and a debit/credit line table with account code,
 * account name, dimensions (cost center / profit centre / project), and
 * functional-currency debit/credit amounts.
 *
 * Usage:
 *   <PostingTrace jeId={jeId} />
 */

import { AlertCircle, CheckCircle2, Clock, RefreshCw } from "lucide-react";
import { Badge, Skeleton } from "@athyper/ui/primitives";
import { usePostingTrace } from "../hooks/usePostingTrace";
import type { PostingTraceLine } from "../hooks/usePostingTrace";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString();
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "posted")   return <Badge variant="success">Posted</Badge>;
  if (s === "reversed") return <Badge variant="destructive">Reversed</Badge>;
  if (s === "created")  return <Badge variant="muted">Draft</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

// ── Dimension cell ─────────────────────────────────────────────────────────────

function DimCell({ code, name }: { code: string | null; name: string | null }) {
  if (!code) return <span className="text-muted-foreground/50">—</span>;
  return (
    <span className="inline-flex flex-col leading-tight">
      <span className="font-mono text-[10px]">{code}</span>
      {name && <span className="text-[10px] text-muted-foreground">{name}</span>}
    </span>
  );
}

// ── Line row ──────────────────────────────────────────────────────────────────

function TraceRow({ line }: { line: PostingTraceLine }) {
  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="px-3 py-2 text-center text-xs text-muted-foreground tabular-nums">{line.lineNumber}</td>
      <td className="px-3 py-2">
        <span className="font-mono text-xs font-medium">{line.accountCode}</span>
        <span className="ml-2 text-xs text-muted-foreground">{line.accountName}</span>
      </td>
      <td className="px-3 py-2 text-center">
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{line.accountClass}</Badge>
      </td>
      <td className="px-3 py-2"><DimCell code={line.costCenterCode}   name={line.costCenterName} /></td>
      <td className="px-3 py-2"><DimCell code={line.profitCenterCode} name={line.profitCenterName} /></td>
      <td className="px-3 py-2"><DimCell code={line.projectCode}      name={line.projectName} /></td>
      <td className="px-3 py-2 text-right tabular-nums font-medium text-success">
        {line.debitAmount  > 0 ? fmt(line.debitAmount)  : ""}
      </td>
      <td className="px-3 py-2 text-right tabular-nums font-medium text-destructive">
        {line.creditAmount > 0 ? fmt(line.creditAmount) : ""}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{line.itemText ?? line.assignment ?? "—"}</td>
    </tr>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export interface PostingTraceProps {
  jeId: string;
}

export function PostingTrace({ jeId }: PostingTraceProps) {
  const { data, isLoading, error } = usePostingTrace(jeId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Could not load posting trace for {jeId}.
      </div>
    );
  }

  const { je, lines } = data;
  const totalDebit  = lines.reduce((s, l) => s + l.debitAmount,  0);
  const totalCredit = lines.reduce((s, l) => s + l.creditAmount, 0);
  const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.001;

  return (
    <div className="flex flex-col gap-4">

      {/* JE header card */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold">{je.jeNumber}</span>
              {statusBadge(je.status)}
              {je.reversalOf && (
                <Badge variant="outline" className="text-[10px]">
                  <RefreshCw className="mr-1 h-3 w-3" />Reversal
                </Badge>
              )}
            </div>
            {je.description && (
              <p className="text-sm text-muted-foreground">{je.description}</p>
            )}
            {je.narration && je.narration !== je.description && (
              <p className="text-xs text-muted-foreground/70 italic">{je.narration}</p>
            )}
          </div>
          <div className="shrink-0 text-right text-xs text-muted-foreground space-y-0.5">
            <div className="flex items-center justify-end gap-1">
              <Clock className="h-3 w-3" />
              {fmtDate(je.postingDate)}
            </div>
            <div>FY {je.fiscalYear} / P{je.periodNumber}</div>
            {je.sourceDocType && (
              <div className="font-mono">{je.sourceDocType}{je.sourceDocRef ? ` · ${je.sourceDocRef}` : ""}</div>
            )}
          </div>
        </div>

        <div className="mt-3 flex gap-6 border-t pt-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Total Debit</p>
            <p className="tabular-nums font-semibold text-success">
              {je.currencyCode} {fmt(je.totalDebit)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Credit</p>
            <p className="tabular-nums font-semibold text-destructive">
              {je.currencyCode} {fmt(je.totalCredit)}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-xs">
            {isBalanced ? (
              <><CheckCircle2 className="h-4 w-4 text-success" /><span className="text-success">Balanced</span></>
            ) : (
              <><AlertCircle  className="h-4 w-4 text-destructive"  /><span className="text-destructive">Unbalanced</span></>
            )}
          </div>
        </div>
      </div>

      {/* Posting lines table */}
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground w-10">#</th>
              <th className="px-3 py-2.5 text-left   text-xs font-medium text-muted-foreground">GL Account</th>
              <th className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground">Class</th>
              <th className="px-3 py-2.5 text-left   text-xs font-medium text-muted-foreground">Cost Center</th>
              <th className="px-3 py-2.5 text-left   text-xs font-medium text-muted-foreground">Profit Ctr</th>
              <th className="px-3 py-2.5 text-left   text-xs font-medium text-muted-foreground">Project</th>
              <th className="px-3 py-2.5 text-right  text-xs font-medium text-muted-foreground">Debit</th>
              <th className="px-3 py-2.5 text-right  text-xs font-medium text-muted-foreground">Credit</th>
              <th className="px-3 py-2.5 text-left   text-xs font-medium text-muted-foreground">Text</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {lines.map((line) => <TraceRow key={line.id} line={line} />)}
          </tbody>
          <tfoot className="border-t bg-muted/30">
            <tr>
              <td colSpan={6} className="px-3 py-2.5 text-xs font-medium text-muted-foreground">
                {lines.length} line{lines.length !== 1 ? "s" : ""}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-xs font-semibold text-success">
                {fmt(totalDebit)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-xs font-semibold text-destructive">
                {fmt(totalCredit)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
