"use client";

// components/finance/atlas/CrossEntityAnomalyPanel.tsx
//
// Cross-entity anomaly intelligence for the Global Close Monitor.
// Shows: repeated anomaly patterns, hotspot accounts, severity distribution,
// override concentration.

import {
  Badge,
  Card,
} from "@neon/ui";
import {
  AlertTriangle,
  Flame,
  BarChart3,
  Shield,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  CrossEntityAnomalies,
  OverrideConcentration,
} from "@/lib/finance/use-global-close-monitor";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CrossEntityAnomalyPanelProps {
  anomalies: CrossEntityAnomalies;
  overrides: OverrideConcentration;
}

// ---------------------------------------------------------------------------
// Severity color helpers
// ---------------------------------------------------------------------------

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "bg-red-500",
  WARNING: "bg-amber-500",
  INFO: "bg-blue-400",
};

const CONCENTRATION_STYLE: Record<string, { bg: string; text: string }> = {
  HIGH: { bg: "bg-red-100", text: "text-red-700" },
  MEDIUM: { bg: "bg-amber-100", text: "text-amber-700" },
  LOW: { bg: "bg-blue-100", text: "text-blue-700" },
  NONE: { bg: "bg-gray-100", text: "text-gray-500" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CrossEntityAnomalyPanel({ anomalies, overrides }: CrossEntityAnomalyPanelProps) {
  const totalSeverity = anomalies.severityDistribution.CRITICAL +
    anomalies.severityDistribution.WARNING +
    anomalies.severityDistribution.INFO;

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Anomalies</p>
          <p className="text-xl font-semibold tabular-nums">{anomalies.totalAcrossGroup}</p>
        </Card>
        <Card className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Cross-Entity Patterns</p>
          <p className={cn("text-xl font-semibold tabular-nums", anomalies.repeatedPatterns.length > 0 && "text-amber-600")}>
            {anomalies.repeatedPatterns.length}
          </p>
        </Card>
        <Card className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Hotspot Accounts</p>
          <p className={cn("text-xl font-semibold tabular-nums", anomalies.hotspotAccounts.length > 0 && "text-red-600")}>
            {anomalies.hotspotAccounts.length}
          </p>
        </Card>
        <Card className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Override Concentration</p>
          <div className="flex items-center gap-1.5">
            <p className="text-xl font-semibold tabular-nums">{overrides.totalOverrides}</p>
            <Badge className={cn("text-[10px]", CONCENTRATION_STYLE[overrides.concentrationRisk]?.bg, CONCENTRATION_STYLE[overrides.concentrationRisk]?.text)}>
              {overrides.concentrationRisk}
            </Badge>
          </div>
        </Card>
      </div>

      {/* Severity distribution bar */}
      {totalSeverity > 0 && (
        <Card className="px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Severity Distribution
          </p>
          <div className="flex h-3 overflow-hidden rounded-full">
            {(["CRITICAL", "WARNING", "INFO"] as const).map(sev => {
              const count = anomalies.severityDistribution[sev];
              if (count === 0) return null;
              return (
                <div
                  key={sev}
                  className={cn("transition-all", SEVERITY_COLOR[sev])}
                  style={{ width: `${(count / totalSeverity) * 100}%` }}
                  title={`${sev}: ${count}`}
                />
              );
            })}
          </div>
          <div className="mt-2 flex gap-4 text-[10px]">
            {(["CRITICAL", "WARNING", "INFO"] as const).map(sev => (
              <div key={sev} className="flex items-center gap-1">
                <span className={cn("inline-block h-2 w-2 rounded-full", SEVERITY_COLOR[sev])} />
                <span className="text-muted-foreground">{sev}</span>
                <span className="font-medium tabular-nums">{anomalies.severityDistribution[sev]}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Two-column: Repeated Patterns + Hotspot Accounts */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Repeated Anomaly Patterns */}
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-semibold">Repeated Patterns</span>
            <Badge variant="outline" className="text-[10px] ml-auto">cross-entity</Badge>
          </div>
          {anomalies.repeatedPatterns.length > 0 ? (
            <div className="divide-y">
              {anomalies.repeatedPatterns.map((p) => (
                <div key={p.anomalyType} className="px-4 py-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{p.anomalyType}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] tabular-nums">
                        {p.entityCount} entities
                      </Badge>
                      <Badge variant="outline" className="text-[10px] tabular-nums">
                        {p.totalOccurrences} total
                      </Badge>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                    {p.entities.join(", ")}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No anomaly patterns repeated across entities.
            </div>
          )}
        </Card>

        {/* Hotspot Accounts */}
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <Flame className="h-4 w-4 text-red-500" />
            <span className="text-sm font-semibold">Hotspot Accounts</span>
            <Badge variant="outline" className="text-[10px] ml-auto">multi-entity</Badge>
          </div>
          {anomalies.hotspotAccounts.length > 0 ? (
            <div className="divide-y">
              {anomalies.hotspotAccounts.map((a) => (
                <div key={a.accountCode} className="px-4 py-2.5">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{a.accountName || a.accountCode}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{a.accountCode}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-[10px] tabular-nums">
                        {a.entityCount} entities
                      </Badge>
                      <Badge variant="outline" className="text-[10px] tabular-nums">
                        {a.anomalyCount} anomalies
                      </Badge>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                    {a.entities.join(", ")}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No accounts with anomalies across multiple entities.
            </div>
          )}
        </Card>
      </div>

      {/* Override Concentration */}
      {overrides.byEntity.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <Shield className="h-4 w-4 text-purple-500" />
            <span className="text-sm font-semibold">Override Concentration by Entity</span>
          </div>
          <div className="divide-y">
            {overrides.byEntity.map((o) => (
              <div key={o.entityCode} className="flex items-center justify-between px-4 py-2">
                <div>
                  <p className="text-sm font-medium">{o.entityName}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{o.entityCode}</p>
                </div>
                <Badge variant="outline" className={cn(
                  "text-xs tabular-nums",
                  o.overrideCount >= 5 ? "border-red-300 text-red-600" :
                  o.overrideCount >= 3 ? "border-amber-300 text-amber-600" :
                  "",
                )}>
                  {o.overrideCount} overrides
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
