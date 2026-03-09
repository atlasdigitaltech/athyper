"use client";

// components/finance/atlas/GlobalForecastPanel.tsx
//
// Global Close Forecasting panel for the Global Close Monitor Phase 3.
// Shows: group-level predicted completion, per-entity forecast table,
// breach risk distribution, readiness trajectory, confidence intervals.

import {
  Badge,
  Card,
} from "@neon/ui";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  BarChart3,
  AlertTriangle,
  Clock,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { GroupForecast, EntityForecast } from "@/lib/finance/use-global-close-monitor";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GlobalForecastPanelProps {
  forecast: GroupForecast;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GlobalForecastPanel({ forecast }: GlobalForecastPanelProps) {
  const { group, breachDistribution, trajectorySummary, entityForecasts } = forecast;

  return (
    <div className="space-y-4">
      {/* Group Forecast Hero */}
      <Card className={cn(
        "overflow-hidden",
        group.predictedCompletionDays != null && group.predictedCompletionDays > 15 ? "bg-gradient-to-r from-red-50 to-background" :
        group.predictedCompletionDays != null && group.predictedCompletionDays > 10 ? "bg-gradient-to-r from-amber-50 to-background" :
        "bg-gradient-to-r from-blue-50 to-background",
      )}>
        <div className="px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-5 w-5 text-blue-600" />
            <span className="text-sm font-semibold">Group Close Forecast</span>
            {group.confidence != null && (
              <Badge variant="outline" className="text-[10px] ml-auto tabular-nums">
                {group.confidence}% confidence
              </Badge>
            )}
          </div>
          <div className="flex items-baseline gap-6">
            <div>
              <p className="text-3xl font-bold tabular-nums">
                {group.predictedCompletionDays != null ? `${group.predictedCompletionDays}d` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">predicted group completion</p>
            </div>
            {group.slowestEntity && (
              <div>
                <p className="text-sm font-medium">{group.slowestEntity.entityName}</p>
                <p className="text-xs text-muted-foreground">
                  critical path · {group.slowestEntity.predictedDays}d predicted
                </p>
              </div>
            )}
            <div className="ml-auto text-right">
              <p className="text-sm font-medium tabular-nums">{group.entityCount}</p>
              <p className="text-xs text-muted-foreground">open entities</p>
            </div>
          </div>
        </div>
      </Card>

      {/* KPI row: breach distribution + trajectory */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Breach Risk: Critical</p>
          <p className={cn("text-xl font-semibold tabular-nums", breachDistribution.critical > 0 && "text-red-600")}>
            {breachDistribution.critical}
          </p>
          <p className="text-[10px] text-muted-foreground">&ge;70% breach probability</p>
        </Card>
        <Card className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Breach Risk: High</p>
          <p className={cn("text-xl font-semibold tabular-nums", breachDistribution.high > 0 && "text-amber-600")}>
            {breachDistribution.high}
          </p>
          <p className="text-[10px] text-muted-foreground">50–70% breach probability</p>
        </Card>
        <Card className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Trajectory: Improving</p>
          <div className="flex items-center gap-1.5">
            <p className="text-xl font-semibold tabular-nums text-emerald-600">{trajectorySummary.improving}</p>
            <TrendingDown className="h-4 w-4 text-emerald-500" />
          </div>
        </Card>
        <Card className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Trajectory: Worsening</p>
          <div className="flex items-center gap-1.5">
            <p className={cn("text-xl font-semibold tabular-nums", trajectorySummary.worsening > 0 && "text-red-600")}>
              {trajectorySummary.worsening}
            </p>
            {trajectorySummary.worsening > 0 && <TrendingUp className="h-4 w-4 text-red-500" />}
          </div>
        </Card>
      </div>

      {/* Per-entity forecast table */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b px-4 py-2.5">
          <BarChart3 className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-semibold">Entity Close Forecast</span>
          <Badge variant="outline" className="text-[10px] ml-auto">
            historical + pace blended
          </Badge>
        </div>
        <div className="grid grid-cols-[2fr_65px_65px_70px_55px_55px_55px_55px] gap-1 border-b bg-muted/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Entity</span>
          <span className="text-right">Hist Avg</span>
          <span className="text-right">Pace</span>
          <span className="text-right">Predicted</span>
          <span className="text-right">Conf</span>
          <span className="text-right">Breach</span>
          <span className="text-right">Done</span>
          <span className="text-center">Trend</span>
        </div>
        <div className="divide-y max-h-80 overflow-auto">
          {entityForecasts.map((ef: EntityForecast) => (
            <div key={ef.entityCode} className="grid grid-cols-[2fr_65px_65px_70px_55px_55px_55px_55px] gap-1 px-3 py-2 text-xs">
              <div className="min-w-0">
                <p className="font-medium truncate">{ef.entityName}</p>
                <p className="text-[10px] text-muted-foreground font-mono">{ef.entityCode}</p>
              </div>
              <p className="text-right tabular-nums text-muted-foreground">
                {ef.historicalAvgDays != null ? `${ef.historicalAvgDays}d` : "—"}
              </p>
              <p className="text-right tabular-nums text-muted-foreground">
                {ef.currentPaceDays != null ? `${ef.currentPaceDays}d` : "—"}
              </p>
              <p className={cn(
                "text-right tabular-nums font-medium",
                ef.predictedDays > 15 ? "text-red-600" :
                ef.predictedDays > 10 ? "text-amber-600" :
                "text-foreground",
              )}>
                {ef.predictedDays}d
              </p>
              <p className={cn(
                "text-right tabular-nums",
                ef.confidence < 50 ? "text-amber-600" : "text-muted-foreground",
              )}>
                {ef.confidence}%
              </p>
              <p className={cn(
                "text-right tabular-nums",
                (ef.hardBreachPct ?? 0) >= 70 ? "text-red-600" :
                (ef.hardBreachPct ?? 0) >= 50 ? "text-amber-600" :
                "text-muted-foreground",
              )}>
                {ef.hardBreachPct != null ? `${ef.hardBreachPct}%` : "—"}
              </p>
              <p className="text-right tabular-nums">{ef.completionPct}%</p>
              <div className="flex justify-center items-center">
                {ef.trend === "improving" ? (
                  <TrendingDown className="h-3.5 w-3.5 text-emerald-500" />
                ) : ef.trend === "worsening" ? (
                  <TrendingUp className="h-3.5 w-3.5 text-red-500" />
                ) : (
                  <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </div>
            </div>
          ))}
        </div>
        {entityForecasts.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            All entities have completed close — no forecast needed.
          </div>
        )}
      </Card>

      {/* Confidence interval detail for top entities */}
      {entityForecasts.filter(ef => ef.historicalPeriodCount >= 4).length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <Clock className="h-4 w-4 text-indigo-500" />
            <span className="text-sm font-semibold">Historical Confidence Intervals</span>
            <Badge variant="outline" className="text-[10px] ml-auto">entities with 4+ periods</Badge>
          </div>
          <div className="grid grid-cols-[2fr_60px_60px_60px_60px_60px] gap-1 border-b bg-muted/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Entity</span>
            <span className="text-right">Avg</span>
            <span className="text-right">StdDev</span>
            <span className="text-right">P75</span>
            <span className="text-right">P95</span>
            <span className="text-right">Periods</span>
          </div>
          <div className="divide-y max-h-48 overflow-auto">
            {entityForecasts
              .filter(ef => ef.historicalPeriodCount >= 4)
              .map((ef: EntityForecast) => (
                <div key={ef.entityCode} className="grid grid-cols-[2fr_60px_60px_60px_60px_60px] gap-1 px-3 py-1.5 text-xs">
                  <p className="font-medium truncate">{ef.entityName}</p>
                  <p className="text-right tabular-nums">{ef.historicalAvgDays ?? "—"}d</p>
                  <p className="text-right tabular-nums text-muted-foreground">{ef.historicalStddev ?? "—"}d</p>
                  <p className="text-right tabular-nums">{ef.historicalP75Days ?? "—"}d</p>
                  <p className={cn(
                    "text-right tabular-nums",
                    ef.historicalP95Days != null && ef.historicalP95Days > 15 ? "text-red-600" : "",
                  )}>
                    {ef.historicalP95Days ?? "—"}d
                  </p>
                  <p className="text-right tabular-nums text-muted-foreground">{ef.historicalPeriodCount}</p>
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* Breach warnings */}
      {(breachDistribution.critical > 0 || breachDistribution.high > 0) && (
        <Card className="overflow-hidden bg-red-50/50">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="text-sm font-semibold text-red-800">SLA Breach Risk Entities</span>
          </div>
          <div className="divide-y">
            {entityForecasts
              .filter(ef => (ef.hardBreachPct ?? 0) >= 50)
              .map((ef: EntityForecast) => (
                <div key={ef.entityCode} className="flex items-center justify-between px-4 py-2">
                  <div>
                    <p className="text-sm font-medium">{ef.entityName}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{ef.entityCode}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={cn(
                      "text-[10px]",
                      (ef.hardBreachPct ?? 0) >= 70 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700",
                    )}>
                      {ef.hardBreachPct}% breach risk
                    </Badge>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {ef.predictedDays}d predicted
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </Card>
      )}
    </div>
  );
}
