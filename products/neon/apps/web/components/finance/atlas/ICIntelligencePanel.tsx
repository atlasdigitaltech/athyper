"use client";

// components/finance/atlas/ICIntelligencePanel.tsx
//
// IC Settlement Intelligence for the Global Close Monitor Phase 2.
// Shows: aging buckets, net exposure per entity pair, exception markers,
// and settlement summary.

import {
  Badge,
  Card,
} from "@neon/ui";
import {
  ArrowRightLeft,
  Clock,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  ICIntelligence,
  GlobalCloseICSettlement,
} from "@/lib/finance/use-global-close-monitor";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ICIntelligencePanelProps {
  intelligence: ICIntelligence;
  settlements: GlobalCloseICSettlement[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ICIntelligencePanel({ intelligence, settlements }: ICIntelligencePanelProps) {
  const ic = intelligence;
  const totalPending = ic.agingBuckets.current + ic.agingBuckets.days7 +
    ic.agingBuckets.days14 + ic.agingBuckets.days30 + ic.agingBuckets.over30;

  return (
    <div className="space-y-4">
      {/* Settlement summary KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total IC Txns</p>
          <p className="text-xl font-semibold tabular-nums">{ic.summary.totalTransactions}</p>
        </Card>
        <Card className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Settled</p>
          <p className="text-xl font-semibold tabular-nums text-emerald-600">
            {ic.summary.totalTransactions - ic.summary.pendingTransactions}
          </p>
          <p className="text-[10px] text-muted-foreground tabular-nums">{ic.summary.settledAmount}</p>
        </Card>
        <Card className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pending</p>
          <p className={cn("text-xl font-semibold tabular-nums", ic.summary.pendingTransactions > 0 ? "text-amber-600" : "text-muted-foreground")}>
            {ic.summary.pendingTransactions}
          </p>
          <p className="text-[10px] text-muted-foreground tabular-nums">{ic.summary.pendingAmount}</p>
        </Card>
        <Card className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Netted</p>
          <p className="text-xl font-semibold tabular-nums">{ic.summary.nettedCount}</p>
        </Card>
        <Card className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Exceptions</p>
          <p className={cn("text-xl font-semibold tabular-nums", ic.exceptionPairs.length > 0 ? "text-red-600" : "text-muted-foreground")}>
            {ic.exceptionPairs.length}
          </p>
        </Card>
      </div>

      {/* Aging buckets */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b px-4 py-2.5">
          <Clock className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">Settlement Aging</span>
          <Badge variant="outline" className="text-[10px] ml-auto tabular-nums">
            {totalPending} pending
          </Badge>
        </div>
        <div className="px-4 py-3">
          {totalPending > 0 ? (
            <>
              {/* Aging bar */}
              <div className="flex h-4 overflow-hidden rounded-full mb-3">
                {AGING_SEGMENTS.map(seg => {
                  const count = ic.agingBuckets[seg.key as keyof typeof ic.agingBuckets];
                  if (count === 0) return null;
                  return (
                    <div
                      key={seg.key}
                      className={cn("transition-all", seg.color)}
                      style={{ width: `${(count / totalPending) * 100}%` }}
                      title={`${seg.label}: ${count} txns`}
                    />
                  );
                })}
              </div>
              {/* Aging table */}
              <div className="grid grid-cols-5 gap-2 text-center">
                {AGING_SEGMENTS.map(seg => {
                  const count = ic.agingBuckets[seg.key as keyof typeof ic.agingBuckets];
                  const amount = ic.agingAmounts[seg.key as keyof typeof ic.agingAmounts];
                  return (
                    <div key={seg.key}>
                      <p className="text-[10px] text-muted-foreground">{seg.label}</p>
                      <p className="text-sm font-semibold tabular-nums">{count}</p>
                      <p className="text-[10px] text-muted-foreground tabular-nums">{formatAmount(amount)}</p>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">All IC transactions settled.</p>
          )}
        </div>
      </Card>

      {/* Two-column: Net Exposure + Exceptions */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Net Exposure */}
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <TrendingUp className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-semibold">Net Exposure</span>
          </div>
          {ic.netExposure.length > 0 ? (
            <div className="divide-y">
              {ic.netExposure.map((e, i) => (
                <div key={i} className="flex items-center gap-2 px-4 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono truncate">
                      {e.source} → {e.dest}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {e.pendingCount} pending · {e.currency}
                    </p>
                  </div>
                  <p className={cn(
                    "text-sm font-semibold tabular-nums shrink-0",
                    Math.abs(Number(e.netAmount)) > 100000 ? "text-red-600" :
                    Math.abs(Number(e.netAmount)) > 50000 ? "text-amber-600" :
                    "text-foreground",
                  )}>
                    {formatAmount(e.netAmount)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No pending IC exposure.
            </div>
          )}
        </Card>

        {/* Exception Pairs */}
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="text-sm font-semibold">Exception Pairs</span>
            <Badge variant="outline" className="text-[10px] ml-auto">
              high aging / high exposure
            </Badge>
          </div>
          {ic.exceptionPairs.length > 0 ? (
            <div className="divide-y">
              {ic.exceptionPairs.map((e, i) => (
                <div key={i} className="flex items-center gap-2 px-4 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono truncate">
                      {e.source} → {e.dest}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {e.pendingCount} pending · {formatAmount(e.netAmount)} {e.currency}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No IC settlement exceptions.
            </div>
          )}
        </Card>
      </div>

      {/* Settlement by pair (from Phase 1) */}
      {settlements.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <ArrowRightLeft className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-semibold">Settlement by Pair</span>
          </div>
          <div className="grid grid-cols-[1fr_1fr_60px_60px_60px_50px] gap-1 border-b bg-muted/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Source</span>
            <span>Dest</span>
            <span className="text-right">Total</span>
            <span className="text-right">Done</span>
            <span className="text-right">Open</span>
            <span className="text-right">%</span>
          </div>
          <div className="divide-y max-h-64 overflow-auto">
            {settlements.map((s, i) => {
              const pct = s.totalTxns > 0 ? Math.round((s.settledCount / s.totalTxns) * 100) : 0;
              return (
                <div key={i} className="grid grid-cols-[1fr_1fr_60px_60px_60px_50px] gap-1 px-3 py-1.5 text-xs">
                  <span className="font-mono truncate">{s.sourceEntity}</span>
                  <span className="font-mono truncate">{s.destEntity}</span>
                  <span className="text-right tabular-nums">{s.totalTxns}</span>
                  <span className="text-right tabular-nums text-emerald-600">{s.settledCount}</span>
                  <span className={cn("text-right tabular-nums", s.pendingCount > 0 ? "text-amber-600" : "text-muted-foreground")}>{s.pendingCount}</span>
                  <span className={cn("text-right tabular-nums", pct === 100 ? "text-emerald-600" : pct < 50 ? "text-amber-600" : "")}>{pct}%</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Constants & Helpers
// ---------------------------------------------------------------------------

const AGING_SEGMENTS = [
  { key: "current", label: "0–3d", color: "bg-emerald-500" },
  { key: "days7", label: "4–7d", color: "bg-blue-500" },
  { key: "days14", label: "8–14d", color: "bg-amber-500" },
  { key: "days30", label: "15–30d", color: "bg-orange-500" },
  { key: "over30", label: "30d+", color: "bg-red-500" },
];

function formatAmount(val: string | number): string {
  const n = Number(val);
  if (isNaN(n)) return String(val);
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(2);
}
