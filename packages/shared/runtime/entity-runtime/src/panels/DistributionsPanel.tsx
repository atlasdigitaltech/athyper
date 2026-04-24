"use client";

import { useQuery } from "@tanstack/react-query";
import { Layers, SplitSquareHorizontal } from "lucide-react";
import { Skeleton } from "@athyper/ui/primitives";
import type { AccountingDistribution } from "@athyper/api-contracts/documents";

function fmtAmt(amount: number, currency?: string): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount) + (currency ? ` ${currency}` : "");
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
      <Layers className="h-8 w-8 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">No accounting distributions for this document</p>
    </div>
  );
}

export interface DistributionsPanelProps {
  entityCode: string;
  recordId: string;
}

export function DistributionsPanel({ entityCode, recordId }: DistributionsPanelProps) {
  const { data, isLoading } = useQuery<{ data: AccountingDistribution[] }>({
    queryKey: ["record-distributions", entityCode, recordId],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/distributions`,
        { signal },
      );
      if (!res.ok) throw new Error(`distributions ${res.status}`);
      return res.json() as Promise<{ data: AccountingDistribution[] }>;
    },
    staleTime: 60 * 1000,
    retry: 3,
    retryDelay: 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  const distributions = data?.data ?? [];
  if (distributions.length === 0) return <EmptyState />;

  // Group by source_line_id
  const lineGroups = new Map<string, AccountingDistribution[]>();
  for (const d of distributions) {
    const arr = lineGroups.get(d.source_line_id) ?? [];
    arr.push(d);
    lineGroups.set(d.source_line_id, arr);
  }

  const lineTotal = distributions.reduce((s, d) => s + Number(d.distributed_amount), 0);
  const currency  = distributions[0]?.currency_code ?? "";

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SplitSquareHorizontal className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {distributions.length} distribution{distributions.length !== 1 ? "s" : ""}
            {" across "}
            {lineGroups.size} line{lineGroups.size !== 1 ? "s" : ""}
          </span>
        </div>
        <span className="text-sm font-semibold tabular-nums">
          {fmtAmt(lineTotal, currency)}
        </span>
      </div>

      {/* Per-line groups */}
      {[...lineGroups.entries()].map(([lineId, dists]) => {
        const lineTotal = dists.reduce((s, d) => s + Number(d.distributed_amount), 0);
        return (
          <div key={lineId} className="rounded-lg border border-border/50 overflow-hidden">
            {/* Group header */}
            <div className="flex items-center justify-between bg-muted/40 px-3 py-2 border-b border-border/40">
              <span className="text-xs font-mono text-muted-foreground">
                Line {dists[0]?.distribution_no !== undefined ? `· ${dists.length} split${dists.length > 1 ? "s" : ""}` : ""}
              </span>
              <span className="text-xs tabular-nums font-medium">
                {fmtAmt(lineTotal, dists[0]?.currency_code ?? "")}
              </span>
            </div>

            {/* Distribution rows */}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 text-xs font-medium text-muted-foreground">
                  <th className="px-3 py-2 text-center w-8">#</th>
                  <th className="px-3 py-2 text-left">Basis</th>
                  <th className="px-3 py-2 text-left">Account Source</th>
                  <th className="px-3 py-2 text-left">Account</th>
                  <th className="px-3 py-2 text-left">Cost Centre</th>
                  <th className="px-3 py-2 text-left">Project</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {dists.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 text-center text-xs text-muted-foreground tabular-nums">
                      {d.distribution_no}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center h-[16px] px-[5px] rounded-[3px] text-[9.5px] font-semibold bg-muted border border-border/50 text-muted-foreground leading-none">
                        {d.distribution_basis === "PERCENT" && d.split_pct != null
                          ? `${Number(d.split_pct).toFixed(1)}%`
                          : d.distribution_basis}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {d.account_source.replace(/_/g, " ")}
                    </td>
                    <td className="px-3 py-2">
                      {d.account_code ? (
                        <span className="font-mono text-xs">{d.account_code}</span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {d.cost_center_id ? (
                        <span className="font-mono">{d.cost_center_id.slice(0, 8)}…</span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {d.project_id ? (
                        <span className="font-mono">{d.project_id.slice(0, 8)}…</span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-sm font-medium">
                      {fmtAmt(Number(d.distributed_amount), d.currency_code)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
