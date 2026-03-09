"use client";

// components/finance/admin/ReadinessTrendChart.tsx
//
// Cross-period readiness trend chart for CFO workspace.
// Shows readiness score, SLA status, and clean close designation
// across all periods in a fiscal year.

import {
  BarChart3,
  Check,
  Loader2,
  ShieldAlert,
  Target,
  TrendingUp,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { ReadinessTrendDTO, PeriodTrendDTO } from "@/lib/finance/use-pack-readiness";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReadinessTrendChartProps {
  trend: ReadinessTrendDTO | null;
  loading?: boolean;
  currentPeriod?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReadinessTrendChart({ trend, loading, currentPeriod }: ReadinessTrendChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Readiness Trend
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Loading trends...</span>
        </CardContent>
      </Card>
    );
  }

  if (!trend || trend.periods.length === 0) return null;

  const s = trend.summary;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Readiness Trend — FY{trend.fiscalYear}
            </CardTitle>
            <CardDescription className="text-xs">
              {s.closedPeriods} of {s.totalPeriods} periods closed
              {s.averageReadinessScore != null && ` · Avg score: ${s.averageReadinessScore}%`}
            </CardDescription>
          </div>
          <div className="flex gap-1.5">
            {s.cleanCloseRate != null && (
              <Badge variant={s.cleanCloseRate >= 80 ? "default" : "secondary"} className="text-[10px]">
                {s.cleanCloseRate}% clean
              </Badge>
            )}
            {s.slaBreaches > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {s.slaBreaches} SLA breach{s.slaBreaches !== 1 ? "es" : ""}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary metrics row */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <TrendMetric icon={Target} label="Avg Score" value={s.averageReadinessScore != null ? `${s.averageReadinessScore}%` : "—"} />
          <TrendMetric icon={Check} label="Clean Closes" value={`${s.cleanCloseCount}/${s.closedPeriods}`} />
          <TrendMetric icon={ShieldAlert} label="SLA Met" value={`${s.slaMet}/${s.totalPeriods}`} />
          <TrendMetric icon={BarChart3} label="Avg Days" value={s.avgWorkingDays != null ? `${s.avgWorkingDays}d` : "—"} />
        </div>

        {/* Period bars */}
        <div className="space-y-1">
          {trend.periods.map((p) => (
            <PeriodBar key={p.period_number} period={p} isCurrent={p.period_number === currentPeriod} />
          ))}
        </div>

        {/* Working days trend */}
        {trend.workingDaysTrend.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-[10px] font-medium text-muted-foreground mb-2">Working Days: Target vs Actual</p>
            <div className="flex gap-1 items-end h-16">
              {trend.workingDaysTrend.map((d) => {
                const maxDays = Math.max(...trend.workingDaysTrend.map((x) => Math.max(x.target, x.actual)));
                const targetH = maxDays > 0 ? (d.target / maxDays) * 100 : 0;
                const actualH = maxDays > 0 ? (d.actual / maxDays) * 100 : 0;
                return (
                  <Tooltip key={d.period}>
                    <TooltipTrigger asChild>
                      <div className="flex-1 flex gap-px items-end">
                        <div className="flex-1 bg-blue-200 rounded-t" style={{ height: `${targetH}%` }} />
                        <div
                          className={`flex-1 rounded-t ${d.variance > 0 ? "bg-red-400" : "bg-emerald-400"}`}
                          style={{ height: `${actualH}%` }}
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="text-[10px]">
                      P{d.period}: Target {d.target}d, Actual {d.actual}d
                      {d.variance > 0 ? ` (+${d.variance}d over)` : d.variance < 0 ? ` (${d.variance}d under)` : " (on target)"}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
              <span>P{trend.workingDaysTrend[0].period}</span>
              <div className="flex gap-2">
                <span className="flex items-center gap-0.5"><span className="w-2 h-2 bg-blue-200 rounded" /> Target</span>
                <span className="flex items-center gap-0.5"><span className="w-2 h-2 bg-emerald-400 rounded" /> Actual</span>
              </div>
              <span>P{trend.workingDaysTrend[trend.workingDaysTrend.length - 1].period}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Period Bar
// ---------------------------------------------------------------------------

function PeriodBar({ period: p, isCurrent }: { period: PeriodTrendDTO; isCurrent: boolean }) {
  const score = p.readiness_score != null ? Number(p.readiness_score) : null;
  const barWidth = score != null ? Math.max(score, 2) : 0;
  const barColor =
    score == null ? "bg-gray-200" :
    score >= 90 ? "bg-emerald-500" :
    score >= 70 ? "bg-blue-500" :
    score >= 50 ? "bg-amber-500" :
    "bg-red-500";

  const isClean = p.is_clean_close === "true";

  return (
    <div className={`flex items-center gap-2 py-0.5 ${isCurrent ? "bg-blue-50 rounded px-1 -mx-1" : ""}`}>
      <span className={`text-[10px] w-6 text-right font-mono ${isCurrent ? "font-bold text-blue-700" : "text-muted-foreground"}`}>
        P{p.period_number}
      </span>
      <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden relative">
        <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${barWidth}%` }} />
        {score != null && (
          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-medium">
            {score}%
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 w-20">
        {p.sla_status === "BREACHED" && (
          <XCircle className="h-3 w-3 text-red-500 flex-shrink-0" />
        )}
        {isClean && (
          <Check className="h-3 w-3 text-emerald-500 flex-shrink-0" />
        )}
        <Badge
          variant={
            p.close_status === "HARD_CLOSED" ? "default" :
            p.close_status === "SOFT_CLOSED" ? "secondary" :
            "outline"
          }
          className="text-[8px] truncate"
        >
          {formatCloseStatus(p.close_status)}
        </Badge>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trend Metric
// ---------------------------------------------------------------------------

function TrendMetric({ icon: Icon, label, value }: { icon: typeof Target; label: string; value: string }) {
  return (
    <div className="text-center p-1.5 rounded bg-gray-50">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mx-auto mb-0.5" />
      <div className="text-xs font-semibold">{value}</div>
      <div className="text-[9px] text-muted-foreground">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCloseStatus(status: string | null): string {
  switch (status) {
    case "HARD_CLOSED": return "Closed";
    case "SOFT_CLOSED": return "Soft";
    case "IN_PROGRESS": return "Active";
    case "OPEN": return "Open";
    case "REOPENED": return "Reopen";
    default: return status ?? "—";
  }
}
