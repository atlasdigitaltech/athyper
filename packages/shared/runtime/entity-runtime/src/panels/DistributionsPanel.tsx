"use client";

import { useQuery } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import { Skeleton } from "@athyper/ui/primitives";

interface Distribution {
  id: string;
  account_code: string;
  account_name?: string;
  debit_amount?: number;
  credit_amount?: number;
  currency?: string;
  cost_center?: string;
  description?: string;
}

function formatAmount(amount: number, currency?: string): string {
  return new Intl.NumberFormat(undefined, {
    style:    currency ? "currency" : "decimal",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
      <Layers className="h-8 w-8 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">No accounting distributions for this record</p>
    </div>
  );
}

export interface DistributionsPanelProps {
  entityCode: string;
  recordId: string;
}

export function DistributionsPanel({ entityCode, recordId }: DistributionsPanelProps) {
  const { data, isLoading } = useQuery<{ data: Distribution[] }>({
    queryKey: ["record-distributions", entityCode, recordId],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/distributions`,
        { signal },
      );
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: Distribution[] }>;
    },
    staleTime: 60 * 1000,
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

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs font-medium text-muted-foreground">
            <th className="py-2 text-left">Account</th>
            <th className="py-2 text-left">Cost Center</th>
            <th className="py-2 text-right">Debit</th>
            <th className="py-2 text-right">Credit</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {distributions.map((d) => (
            <tr key={d.id} className="hover:bg-muted/30">
              <td className="py-2">
                <span className="font-mono text-xs">{d.account_code}</span>
                {d.account_name && (
                  <span className="ml-2 text-muted-foreground">{d.account_name}</span>
                )}
              </td>
              <td className="py-2 text-muted-foreground">{d.cost_center ?? "—"}</td>
              <td className="py-2 text-right tabular-nums">
                {d.debit_amount !== undefined ? formatAmount(d.debit_amount, d.currency) : "—"}
              </td>
              <td className="py-2 text-right tabular-nums">
                {d.credit_amount !== undefined ? formatAmount(d.credit_amount, d.currency) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
