"use client";

import { fmtFull, fmtCompact } from "../components/format";
import { PeriodStatusBar } from "../components/PeriodStatusBar";
import {
  ReportHeaderRow,
  ReportLiveBadge,
  ReportMetricCard,
  ReportMetricGrid,
} from "../components/ReportScaffold";
import type { FinanceScope } from "../lib/scope";
import { useApAging, type ApAgingRow } from "../hooks/useApWorkbench";
import { usePeriodStatus } from "../hooks/usePeriodStatus";
import { useStatementReportingLens } from "../hooks/useStatementReportingLens";

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
  showReportHeader?: boolean;
}

export function ApAgingView({ scope, showReportHeader = false }: ApAgingViewProps) {
  const { data, isLoading, isError } = useApAging(scope);
  const { data: periodData } = usePeriodStatus(scope);
  const reportingLens = useStatementReportingLens(scope);
  const effectiveStatus = periodData?.[0]?.effectiveStatus ?? null;

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
      {showReportHeader && (
        <ReportHeaderRow
          title="AP Aging"
          meta={
            <>
              <PeriodStatusBar
                fiscalYear={scope.fiscalYear}
                period={scope.period}
                status={reportingLens.isFiscalLens ? effectiveStatus : null}
                companyCode={scope.scopeType === "company" ? scope.scopeId : undefined}
                displayLabel={reportingLens.headerLabel}
              />
              <ReportLiveBadge />
            </>
          }
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Source: fin.ap_invoice · As at {data.asAt ? new Date(data.asAt).toLocaleDateString() : "period end"}
        </span>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span>Total outstanding: <span className="font-semibold text-foreground">{fmtCompact(grandTotal)}</span></span>
          <span>{rows.length} supplier{rows.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Summary bucket cards */}
      <ReportMetricGrid>
        {BUCKETS.map((b) => {
          const val = totals[b.key] ?? 0;
          const pct = grandTotal > 0 ? (val / grandTotal) * 100 : 0;
          const isOverdue = b.key !== "current";
          return (
            <ReportMetricCard
              key={b.key}
              label={b.label}
              value={fmtCompact(val)}
              detail={`${pct.toFixed(1)}%`}
              tone={isOverdue && val > 0 ? "warning" : "neutral"}
            />
          );
        })}
      </ReportMetricGrid>

      {/* Aging grid */}
      {rows.length === 0 ? (
        <div className="flex items-center justify-center h-24 text-sm text-muted-foreground rounded-xl border border-dashed">
          No outstanding payables for the selected scope.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="py-2 px-3 text-left text-xs font-semibold text-muted-foreground">Supplier</th>
                {BUCKETS.map((b) => (
                  <th key={b.key} className="py-2 px-3 text-right text-xs font-semibold text-muted-foreground">
                    {b.label}
                  </th>
                ))}
                <th className="py-2 px-3 text-right text-xs font-semibold text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.supplierId ?? i} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-1.5 px-3">
                    <div className="font-medium">{row.supplierName ?? "Unknown supplier"}</div>
                    {row.supplierId && (
                      <div className="text-doc-support text-muted-foreground">{row.supplierId}</div>
                    )}
                  </td>
                  {BUCKETS.map((b) => {
                    const val = row[b.key] as number;
                    return (
                      <td key={b.key} className={`py-1.5 px-3 text-right tabular-nums ${b.key !== "current" && val > 0 ? "text-warning" : ""}`}>
                        {val ? fmtFull(val) : "—"}
                      </td>
                    );
                  })}
                  <td className="py-1.5 px-3 text-right font-semibold tabular-nums">
                    {fmtFull(row.total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/50 border-t-2">
                <td className="py-2 px-3 font-semibold">Total</td>
                {BUCKETS.map((b) => (
                  <td key={b.key} className="py-2 px-3 text-right font-semibold tabular-nums">
                    {totals[b.key] ? fmtFull(totals[b.key]!) : "—"}
                  </td>
                ))}
                <td className="py-2 px-3 text-right font-semibold tabular-nums">
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
