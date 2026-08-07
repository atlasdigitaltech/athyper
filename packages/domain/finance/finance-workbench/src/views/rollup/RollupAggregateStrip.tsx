"use client";

import { AlertCircle, Building2, CheckCircle2, TrendingUp } from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";

export interface RollupAggregateStripProps {
  completeCompanies: number;
  totalCompanies:    number;
  avgCoveragePct:    number;
  conflictCount:     number;
  className?:        string;
}

export function RollupAggregateStrip({
  completeCompanies,
  totalCompanies,
  avgCoveragePct,
  conflictCount,
  className,
}: RollupAggregateStripProps) {
  const readinessPct = totalCompanies === 0 ? 100 : Math.round((completeCompanies / totalCompanies) * 100);
  return (
    <section
      className={cn(
        "grid grid-cols-1 gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
      aria-label="Scope aggregate KPIs"
    >
      <Kpi
        icon={Building2}
        label="Companies"
        value={String(totalCompanies)}
        sub={`${completeCompanies} complete`}
        tone="info"
      />
      <Kpi
        icon={CheckCircle2}
        label="Ready"
        value={`${readinessPct}%`}
        sub={`${completeCompanies}/${totalCompanies}`}
        tone={readinessPct === 100 ? "success" : readinessPct >= 60 ? "warning" : "destructive"}
        withBar={{ pct: readinessPct }}
      />
      <Kpi
        icon={TrendingUp}
        label="Avg GL coverage"
        value={`${avgCoveragePct}%`}
        sub="control per postable account"
        tone={avgCoveragePct === 100 ? "success" : avgCoveragePct >= 60 ? "warning" : "destructive"}
        withBar={{ pct: avgCoveragePct }}
      />
      <Kpi
        icon={AlertCircle}
        label="Open issues"
        value={String(conflictCount)}
        sub={conflictCount === 0 ? "all clear" : "across the scope"}
        tone={conflictCount === 0 ? "success" : conflictCount > 20 ? "destructive" : "warning"}
      />
    </section>
  );
}

interface KpiProps {
  icon:  React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
  sub:   string;
  tone:  "info" | "success" | "warning" | "destructive";
  withBar?: { pct: number };
}

function Kpi({ icon: Icon, label, value, sub, tone, withBar }: KpiProps) {
  const toneCls = {
    info:         "text-info",
    success:      "text-success",
    warning:      "text-warning",
    destructive:  "text-destructive",
  }[tone];
  const barCls = {
    info:         "bg-info",
    success:      "bg-success",
    warning:      "bg-warning",
    destructive:  "bg-destructive",
  }[tone];
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-3.5 w-3.5", toneCls)} aria-hidden />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <span className={cn("text-2xl font-semibold tabular-nums", toneCls)}>{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80">{sub}</span>
      {withBar && (
        <div className="mt-1 h-1 w-full overflow-hidden rounded bg-muted">
          <div
            className={cn("h-full transition-all", barCls)}
            style={{ width: `${Math.min(100, Math.max(0, withBar.pct))}%` }}
            role="progressbar"
            aria-valuenow={withBar.pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      )}
    </div>
  );
}
