"use client";

// components/finance/atlas/ConsolidatedRiskPanel.tsx
//
// Group-level consolidated risk view for the Global Close Monitor.
// Shows: group risk score, status distribution, delayed close ranking,
// critical path entity, and aggregate totals.

import {
  Badge,
  Card,
} from "@neon/ui";
import {
  Shield,
  AlertTriangle,
  Clock,
  Target,
  BarChart3,
  Flag,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  GlobalCloseConsolidated,
  GlobalCloseEntityRiskDriver,
} from "@/lib/finance/use-global-close-monitor";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ConsolidatedRiskPanelProps {
  consolidated: GlobalCloseConsolidated;
  parentName: string;
}

// ---------------------------------------------------------------------------
// Risk level styling
// ---------------------------------------------------------------------------

const RISK_BG: Record<string, string> = {
  HIGH: "from-red-500 to-red-600",
  MEDIUM: "from-amber-500 to-amber-600",
  LOW: "from-blue-500 to-blue-600",
  NONE: "from-gray-400 to-gray-500",
};

const STATUS_COLORS: Record<string, string> = {
  HARD_CLOSED: "bg-emerald-500",
  SOFT_CLOSED: "bg-teal-500",
  IN_PROGRESS: "bg-blue-500",
  OPEN: "bg-amber-500",
  NOT_STARTED: "bg-gray-400",
  CANCELLED: "bg-gray-300",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConsolidatedRiskPanel({ consolidated, parentName }: ConsolidatedRiskPanelProps) {
  const c = consolidated;
  const totalStatuses = Object.values(c.statusDistribution).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      {/* Group Risk Score — hero card */}
      <Card className={cn(
        "relative overflow-hidden bg-gradient-to-br text-white",
        RISK_BG[c.groupRiskLevel] ?? RISK_BG.NONE,
      )}>
        <div className="relative z-10 px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium opacity-80">Group Composite Risk</p>
              <p className="text-4xl font-bold tabular-nums mt-1">{c.groupRiskScore}</p>
              <p className="text-xs font-medium mt-0.5 opacity-90">{c.groupRiskLevel} · {parentName}</p>
            </div>
            <Shield className="h-12 w-12 opacity-20" />
          </div>
        </div>
      </Card>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <KpiCard label="Entities" value={c.entityCount} icon={BarChart3} />
        <KpiCard label="Anomalies" value={c.totalAnomalies} icon={AlertTriangle}
          accent={c.totalCriticalAnomalies > 0 ? "text-red-600" : undefined}
          sub={c.totalCriticalAnomalies > 0 ? `${c.totalCriticalAnomalies} critical` : undefined}
        />
        <KpiCard label="Open Exceptions" value={c.totalOpenExceptions} icon={Flag}
          accent={c.totalGateBlockers > 0 ? "text-red-600" : undefined}
          sub={c.totalGateBlockers > 0 ? `${c.totalGateBlockers} gate blockers` : undefined}
        />
        <KpiCard label="Delayed" value={c.delayedCloseRanking.length} icon={Clock}
          accent={c.delayedCloseRanking.length > 0 ? "text-amber-600" : undefined}
        />
        <KpiCard label="Critical Path" value={c.criticalPathEntity?.entityCode ?? "—"} icon={Target}
          accent={c.criticalPathEntity ? "text-red-600" : undefined}
          sub={c.criticalPathEntity ? `Score: ${c.criticalPathEntity.riskScore}` : undefined}
        />
      </div>

      {/* Status distribution bar */}
      <Card className="px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Close Status Distribution
        </p>
        {totalStatuses > 0 ? (
          <>
            <div className="flex h-3 overflow-hidden rounded-full">
              {Object.entries(c.statusDistribution).map(([status, count]) => (
                <div
                  key={status}
                  className={cn("transition-all", STATUS_COLORS[status] ?? "bg-gray-300")}
                  style={{ width: `${(count / totalStatuses) * 100}%` }}
                  title={`${status}: ${count}`}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-[10px]">
              {Object.entries(c.statusDistribution).map(([status, count]) => (
                <div key={status} className="flex items-center gap-1">
                  <span className={cn("inline-block h-2 w-2 rounded-full", STATUS_COLORS[status] ?? "bg-gray-300")} />
                  <span className="text-muted-foreground">{status}</span>
                  <span className="font-medium tabular-nums">{count}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No close runs for this period.</p>
        )}
      </Card>

      {/* Two-column: Delayed Ranking + Critical Path */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Delayed Close Ranking */}
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <Clock className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-semibold">Delayed Close Ranking</span>
          </div>
          {c.delayedCloseRanking.length > 0 ? (
            <div className="divide-y">
              {c.delayedCloseRanking.map((d, i) => (
                <div key={d.entityCode} className="flex items-center gap-3 px-4 py-2">
                  <span className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                    i === 0 ? "bg-red-100 text-red-700" :
                    i === 1 ? "bg-amber-100 text-amber-700" :
                    "bg-gray-100 text-gray-600",
                  )}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{d.entityName}</p>
                    <p className="text-[10px] text-muted-foreground">{d.entityCode} · {d.closeStatus}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">{d.elapsedDays}d</p>
                    <p className="text-[10px] text-muted-foreground">Risk: {d.riskScore}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No delayed entities.
            </div>
          )}
        </Card>

        {/* Critical Path Entity */}
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <Target className="h-4 w-4 text-red-500" />
            <span className="text-sm font-semibold">Critical Path Entity</span>
          </div>
          {c.criticalPathEntity ? (
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold">{c.criticalPathEntity.entityName}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{c.criticalPathEntity.entityCode}</p>
                </div>
                <Badge className={cn(
                  "text-sm tabular-nums",
                  c.criticalPathEntity.riskScore >= 70 ? "bg-red-100 text-red-700" :
                  c.criticalPathEntity.riskScore >= 40 ? "bg-amber-100 text-amber-700" :
                  "bg-blue-100 text-blue-700",
                )}>
                  {c.criticalPathEntity.riskScore}
                </Badge>
              </div>
              {c.criticalPathEntity.topDrivers.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Top Drivers</p>
                  {c.criticalPathEntity.topDrivers.map((d: GlobalCloseEntityRiskDriver, i: number) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{d.label}</span>
                      <span className="tabular-nums font-medium">{d.points}pts</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              All entities have completed close.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCard({
  label, value, icon: Icon, accent, sub,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
  sub?: string;
}) {
  return (
    <Card className="px-3 py-2">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
      <p className={cn("text-xl font-semibold tabular-nums", accent)}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </Card>
  );
}
