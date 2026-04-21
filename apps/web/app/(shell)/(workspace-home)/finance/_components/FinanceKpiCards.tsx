"use client";

import { TrendingUp, TrendingDown, DollarSign, BookOpen, CreditCard, Landmark } from "lucide-react";
import { useFinanceDashboardKpis } from "@athyper/finance-workbench/hooks";

// ── Format helpers ────────────────────────────────────────────────────────────

function fmtCurrency(n: number | null): string {
  if (n === null) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtCount(n: number | null): string {
  return n === null ? "—" : n.toLocaleString();
}

// ── KPI tile ──────────────────────────────────────────────────────────────────

interface KpiTileProps {
  label: string;
  value: string;
  icon: React.ElementType;
  loading?: boolean;
}

function KpiTile({ label, value, icon: Icon, loading }: KpiTileProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="h-4.5 w-4.5 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        {loading ? (
          <div className="mt-0.5 h-5 w-16 animate-pulse rounded bg-muted" />
        ) : (
          <p className="mt-0.5 text-base font-semibold tabular-nums">{value}</p>
        )}
      </div>
    </div>
  );
}

// ── FinanceKpiCards ───────────────────────────────────────────────────────────

export function FinanceKpiCards() {
  const { data, isLoading } = useFinanceDashboardKpis();

  const tiles: KpiTileProps[] = [
    { label: "Revenue MTD",    value: fmtCurrency(data?.revenueMtd  ?? null), icon: TrendingUp   },
    { label: "Expenses MTD",   value: fmtCurrency(data?.expensesMtd ?? null), icon: TrendingDown },
    { label: "Open AP",        value: fmtCurrency(data?.openAp      ?? null), icon: CreditCard   },
    { label: "Open AR",        value: fmtCurrency(data?.openAr      ?? null), icon: DollarSign   },
    { label: "Cash Balance",   value: fmtCurrency(data?.cashBalance  ?? null), icon: Landmark     },
    { label: "Journal Entries",value: fmtCount(data?.journalCount   ?? null), icon: BookOpen     },
  ];

  return (
    <div>
      {data?.period && (
        <p className="mb-2 text-xs text-muted-foreground">
          Period {data.period} — as at {new Date(data.asAt).toLocaleDateString()}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {tiles.map((t) => (
          <KpiTile key={t.label} {...t} loading={isLoading} />
        ))}
      </div>
    </div>
  );
}
