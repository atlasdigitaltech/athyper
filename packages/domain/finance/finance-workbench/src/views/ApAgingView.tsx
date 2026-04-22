"use client";

import { fmtFull, fmtCompact } from "../components/format";
import type { FinanceScope } from "../lib/scope";
import { useApAging, type ApAgingRow } from "../hooks/useApWorkbench";

// ── Bucket config ─────────────────────────────────────────────────────────────

const BUCKETS: { key: keyof ApAgingRow; label: string }[] = [
  { key: "current",   label: "Current"   },
  { key: "days1to30", label: "1–30 days" },
  { key: "days31to60",label: "31–60 days"},
  { key: "days61to90",label: "61–90 days"},
  { key: "over90",    label: "Over 90"   },
];

interface ApAgingViewProps {
  scope: FinanceScope;
}

export function ApAgingView({ scope }: ApAgingViewProps) {
  const { data, isLoading, isError } = useApAging(scope);

  if (!scope.scopeId) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        Select a scope to view AP aging.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground animate-pulse">
        Loading AP aging…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-destructive">
        Failed to load AP aging.
      </div>
    );
  }

  const rows = data.rows;

  // Bucket totals for summary row
  const totals = BUCKETS.reduce<Record<string, number>>((acc, b) => {
    acc[b.key] = rows.reduce((s, r) => s + (r[b.key] as number), 0);
    return acc;
  }, {});
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-doc-support text-muted-foreground">
          Source: fin.ap_invoice · As at {data.asAt ? new Date(data.asAt).toLocaleDateString() : "period end"}
        </span>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span>Total outstanding: <span className="font-semibold text-foreground">{fmtCompact(grandTotal)}</span></span>
          <span>{rows.length} vendor{rows.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Summary bucket cards */}
      <div className="grid grid-cols-5 gap-2">
        {BUCKETS.map((b) => {
          const val = totals[b.key] ?? 0;
          const pct = grandTotal > 0 ? (val / grandTotal) * 100 : 0;
          const isOverdue = b.key !== "current";
          return (
            <div key={b.key} className="rounded-lg border p-2.5 space-y-1">
              <div className="text-doc-support text-muted-foreground">{b.label}</div>
              <div className={`text-sm font-semibold font-mono ${isOverdue && val > 0 ? "text-warning" : ""}`}>
                {fmtCompact(val)}
              </div>
              <div className="text-doc-support text-muted-foreground">{pct.toFixed(1)}%</div>
            </div>
          );
        })}
      </div>

      {/* Aging grid */}
      {rows.length === 0 ? (
        <div className="flex items-center justify-center h-24 text-sm text-muted-foreground rounded-xl border border-dashed">
          No outstanding payables for the selected scope.
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="py-2 px-3 text-left font-medium text-muted-foreground">Vendor</th>
                {BUCKETS.map((b) => (
                  <th key={b.key} className="py-2 px-3 text-right font-medium text-muted-foreground">
                    {b.label}
                  </th>
                ))}
                <th className="py-2 px-3 text-right font-medium text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.supplierId ?? i} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-1.5 px-3">
                    <div className="font-medium">{row.supplierName ?? "Unknown vendor"}</div>
                    {row.supplierId && (
                      <div className="text-doc-support text-muted-foreground">{row.supplierId}</div>
                    )}
                  </td>
                  {BUCKETS.map((b) => {
                    const val = row[b.key] as number;
                    return (
                      <td key={b.key} className={`py-1.5 px-3 text-right font-mono ${b.key !== "current" && val > 0 ? "text-warning" : ""}`}>
                        {val ? fmtFull(val) : "—"}
                      </td>
                    );
                  })}
                  <td className="py-1.5 px-3 text-right font-mono font-semibold">
                    {fmtFull(row.total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/50 border-t-2">
                <td className="py-2 px-3 font-semibold">Total</td>
                {BUCKETS.map((b) => (
                  <td key={b.key} className="py-2 px-3 text-right font-mono font-semibold">
                    {totals[b.key] ? fmtFull(totals[b.key]!) : "—"}
                  </td>
                ))}
                <td className="py-2 px-3 text-right font-mono font-bold">
                  {fmtFull(grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
