"use client";

// components/finance/atlas/LongitudinalIntelligencePanel.tsx
//
// Longitudinal Intelligence panel for the Global Close Monitor Phase 4.
// Shows: entity behavior profiles, persistent anomaly patterns,
// entity trends, and delay explanations.

import {
  Badge,
  Card,
} from "@neon/ui";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Brain,
  Repeat,
  Activity,
  MessageSquare,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  LongitudinalIntelligence,
  EntityBehaviorProfile,
  EntityTrend,
} from "@/lib/finance/use-global-close-monitor";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LongitudinalIntelligencePanelProps {
  intelligence: LongitudinalIntelligence;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TREND_ICON = {
  improving: TrendingDown,
  stable: Minus,
  worsening: TrendingUp,
} as const;

const TREND_COLOR = {
  improving: "text-emerald-500",
  stable: "text-muted-foreground",
  worsening: "text-red-500",
} as const;

const DIRECTION_STYLE = {
  improving: { bg: "bg-emerald-100", text: "text-emerald-700" },
  stable: { bg: "bg-blue-100", text: "text-blue-700" },
  needs_attention: { bg: "bg-red-100", text: "text-red-700" },
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LongitudinalIntelligencePanel({ intelligence }: LongitudinalIntelligencePanelProps) {
  const { entityProfiles, persistentPatterns, entityTrends, delayExplanations } = intelligence;

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Entities Profiled</p>
          <p className="text-xl font-semibold tabular-nums">{entityProfiles.length}</p>
        </Card>
        <Card className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Persistent Patterns</p>
          <p className={cn("text-xl font-semibold tabular-nums", persistentPatterns.length > 0 && "text-amber-600")}>
            {persistentPatterns.length}
          </p>
        </Card>
        <Card className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Needs Attention</p>
          <p className={cn(
            "text-xl font-semibold tabular-nums",
            entityTrends.filter(t => t.overallDirection === "needs_attention").length > 0 && "text-red-600",
          )}>
            {entityTrends.filter(t => t.overallDirection === "needs_attention").length}
          </p>
        </Card>
        <Card className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Delay Explanations</p>
          <p className="text-xl font-semibold tabular-nums">{delayExplanations.length}</p>
        </Card>
      </div>

      {/* Entity Behavior Profiles */}
      {entityProfiles.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <Brain className="h-4 w-4 text-indigo-500" />
            <span className="text-sm font-semibold">Entity Behavior Profiles</span>
            <Badge variant="outline" className="text-[10px] ml-auto">cross-period analysis</Badge>
          </div>
          <div className="grid grid-cols-[2fr_65px_65px_55px_55px_70px_55px] gap-1 border-b bg-muted/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Entity</span>
            <span className="text-right">Avg Days</span>
            <span className="text-right">Median</span>
            <span className="text-right">Periods</span>
            <span className="text-right">Breaches</span>
            <span className="text-right">Breach %</span>
            <span className="text-center">Trend</span>
          </div>
          <div className="divide-y max-h-72 overflow-auto">
            {entityProfiles.map((ep: EntityBehaviorProfile) => {
              const Icon = TREND_ICON[ep.trend];
              return (
                <div key={ep.entityCode} className="grid grid-cols-[2fr_65px_65px_55px_55px_70px_55px] gap-1 px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{ep.entityName}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{ep.entityCode}</p>
                  </div>
                  <p className={cn(
                    "text-right tabular-nums font-medium",
                    ep.avgCloseDays > 15 ? "text-red-600" :
                    ep.avgCloseDays > 10 ? "text-amber-600" : "",
                  )}>
                    {ep.avgCloseDays}d
                  </p>
                  <p className="text-right tabular-nums text-muted-foreground">{ep.medianCloseDays}d</p>
                  <p className="text-right tabular-nums text-muted-foreground">{ep.periodCount}</p>
                  <p className={cn(
                    "text-right tabular-nums",
                    ep.slaBreachCount > 0 ? "text-red-600" : "text-muted-foreground",
                  )}>
                    {ep.slaBreachCount}
                  </p>
                  <p className={cn(
                    "text-right tabular-nums",
                    ep.slaBreachRate >= 50 ? "text-red-600" :
                    ep.slaBreachRate >= 30 ? "text-amber-600" : "",
                  )}>
                    {ep.slaBreachRate}%
                  </p>
                  <div className="flex justify-center items-center">
                    <Icon className={cn("h-3.5 w-3.5", TREND_COLOR[ep.trend])} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Two-column: Persistent Patterns + Entity Trends */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Persistent Anomaly Patterns */}
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <Repeat className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-semibold">Persistent Patterns</span>
            <Badge variant="outline" className="text-[10px] ml-auto">multi-period</Badge>
          </div>
          {persistentPatterns.length > 0 ? (
            <div className="divide-y max-h-64 overflow-auto">
              {persistentPatterns.map((p) => (
                <div key={p.anomalyType} className="px-4 py-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{p.anomalyType}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] tabular-nums">
                        {p.periodCount} periods
                      </Badge>
                      <Badge variant="outline" className="text-[10px] tabular-nums">
                        {p.entityCount} entities
                      </Badge>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {p.totalOccurrences} total occurrences · {p.entities.slice(0, 4).join(", ")}
                    {p.entities.length > 4 ? ` +${p.entities.length - 4}` : ""}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No anomaly patterns persisting across periods.
            </div>
          )}
        </Card>

        {/* Entity Trends */}
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <Activity className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-semibold">Entity Trends</span>
            <Badge variant="outline" className="text-[10px] ml-auto">close speed + anomaly</Badge>
          </div>
          {entityTrends.length > 0 ? (
            <div className="divide-y max-h-64 overflow-auto">
              {entityTrends.map((t: EntityTrend) => {
                const CloseIcon = TREND_ICON[t.closeSpeedTrend];
                const AnomalyIcon = TREND_ICON[t.anomalyTrend];
                const style = DIRECTION_STYLE[t.overallDirection];
                return (
                  <div key={t.entityCode} className="px-4 py-2.5">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{t.entityName}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{t.entityCode}</p>
                      </div>
                      <Badge className={cn("text-[10px]", style.bg, style.text)}>
                        {t.overallDirection === "needs_attention" ? "Needs Attention" :
                         t.overallDirection === "improving" ? "Improving" : "Stable"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 text-[10px] text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <CloseIcon className={cn("h-3 w-3", TREND_COLOR[t.closeSpeedTrend])} />
                        <span>Close speed</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <AnomalyIcon className={cn("h-3 w-3", TREND_COLOR[t.anomalyTrend])} />
                        <span>Anomalies ({t.latestAnomalyCount} latest)</span>
                      </div>
                      <span>{t.periodCount} periods</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No cross-period trend data available.
            </div>
          )}
        </Card>
      </div>

      {/* Delay Explanations */}
      {delayExplanations.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <MessageSquare className="h-4 w-4 text-red-500" />
            <span className="text-sm font-semibold">Why Do These Entities Delay?</span>
            <Badge variant="outline" className="text-[10px] ml-auto">longitudinal reasoning</Badge>
          </div>
          <div className="divide-y">
            {delayExplanations.map((d) => (
              <div key={d.entityCode} className="px-4 py-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div>
                    <p className="text-sm font-medium">{d.entityName}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{d.entityCode}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px] tabular-nums">
                      {d.avgCloseDays}d avg
                    </Badge>
                    <Badge className={cn(
                      "text-[10px]",
                      d.slaBreachRate >= 50 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700",
                    )}>
                      {d.slaBreachRate}% breach rate
                    </Badge>
                  </div>
                </div>
                <p className="text-sm leading-relaxed">{d.explanation}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Empty state */}
      {entityProfiles.length === 0 && persistentPatterns.length === 0 && (
        <Card className="px-4 py-8 text-center">
          <Brain className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No historical close data available for longitudinal analysis.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Longitudinal intelligence requires at least 2 completed close periods per entity.
          </p>
        </Card>
      )}
    </div>
  );
}
