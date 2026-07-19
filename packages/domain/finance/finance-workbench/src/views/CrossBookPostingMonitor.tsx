"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import type { FinanceScope } from "../lib/scope";
import {
  useCrossBookPostingMonitor,
  type CrossBookDerivationStatus,
} from "../hooks/useCrossBookPostingMonitor";

export interface CrossBookPostingMonitorProps { scope: FinanceScope }

const statuses: Array<{ value: CrossBookDerivationStatus | ""; label: string }> = [
  { value: "", label: "All outcomes" },
  { value: "failed", label: "Failed" },
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "suppressed", label: "Suppressed" },
];

function statusClass(status: CrossBookDerivationStatus) {
  if (status === "completed") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "failed") return "bg-destructive/10 text-destructive";
  if (status === "pending" || status === "processing") return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "bg-muted text-muted-foreground";
}

export function CrossBookPostingMonitor({ scope }: CrossBookPostingMonitorProps) {
  const [status, setStatus] = useState<CrossBookDerivationStatus | "">("");
  const query = useCrossBookPostingMonitor(scope, status || undefined);
  const summary = query.data?.summary;
  const items = query.data?.items ?? [];

  return (
    <main className="space-y-5 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Cross-book Posting Monitor</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {scope.scopeId || "Select a company"} · derivation outcomes, source-to-target evidence, and retry health
          </p>
        </div>
        <div className="flex gap-2">
          <select
            aria-label="Derivation status"
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value as CrossBookDerivationStatus | "")}
          >
            {statuses.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <button className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </header>

      {!scope.scopeId ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Provide a company scope to load cross-book activity.</div> : null}
      {query.error ? <div className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><AlertTriangle className="h-4 w-4 shrink-0" />{query.error.message}</div> : null}

      {summary ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Completed", summary.completed ?? 0, CheckCircle2],
            ["Pending", summary.pending ?? 0, Clock3],
            ["Processing", summary.processing ?? 0, RefreshCw],
            ["Failed", summary.failed ?? 0, AlertTriangle],
            ["Suppressed", summary.suppressed ?? 0, CheckCircle2],
          ].map(([label, value, Icon]) => {
            const IconComponent = Icon as typeof CheckCircle2;
            return <div key={String(label)} className="rounded-xl border bg-card p-4"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>{String(label)}</span><IconComponent className="h-4 w-4" /></div><p className="mt-2 text-2xl font-semibold tabular-nums">{Number(value)}</p></div>;
          })}
        </section>
      ) : null}

      {query.isLoading ? <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">Loading derivation evidence…</div> : null}
      {!query.isLoading && scope.scopeId && items.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No cross-book derivations match this filter.</div> : null}
      {items.length > 0 ? (
        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Status</th><th className="px-4 py-3">Journal lineage</th><th className="px-4 py-3">Book flow</th><th className="px-4 py-3">Rule</th><th className="px-4 py-3">Period</th><th className="px-4 py-3">Attempts</th><th className="px-4 py-3">Failure / evidence</th></tr></thead>
              <tbody className="divide-y">
                {items.map((item) => (
                  <tr key={item.id} className="align-top">
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${statusClass(item.status)}`}>{item.status}</span></td>
                    <td className="px-4 py-3"><div className="flex items-center gap-2 font-medium"><span>{item.sourceJournalNumber}</span><ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /><span>{item.targetJournalNumber ?? "Not created"}</span></div><p className="mt-1 text-xs text-muted-foreground">Target: {item.targetJournalStatus ?? "—"}</p></td>
                    <td className="px-4 py-3 font-medium">{item.sourceBookCode} → {item.targetBookCode ?? "—"}</td>
                    <td className="px-4 py-3"><p className="font-medium">{item.postingRuleCode}</p><p className="mt-1 text-xs text-muted-foreground">v{item.executedRuleVersion}{item.currentRuleVersion !== item.executedRuleVersion ? ` · current v${item.currentRuleVersion}` : ""}</p></td>
                    <td className="px-4 py-3">FY{item.fiscalYear} / P{item.periodNumber}</td>
                    <td className="px-4 py-3 tabular-nums">{item.attemptCount}<p className="mt-1 text-xs text-muted-foreground">Queue: {item.outboxStatus ?? "archived"}</p></td>
                    <td className="max-w-[280px] px-4 py-3"><p className={item.errorCode ? "font-medium text-destructive" : "text-muted-foreground"}>{item.errorCode ?? "Evidence recorded"}</p><p className="mt-1 truncate text-xs text-muted-foreground" title={item.errorMessage ?? item.outboxLastError ?? ""}>{item.errorMessage ?? item.outboxLastError ?? `Idempotent execution · ${item.completedAt ?? item.lastAttemptAt ?? "pending"}`}</p></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}
