"use client";

// Atlas Global Close Monitor
//
// Multi-entity close intelligence workspace. Read-only, advisory.
// Local Control Towers remain authoritative — no mutations, no bypass.
//
// Phase 1: Overview, Entity Grid, IC Settlement.
// Phase 2: Anomaly Patterns, IC Intelligence, Narratives & Projections.
// Phase 3: Forecast — historical-data-driven group close forecasting.
// Phase 4: Longitudinal — cross-period intelligence, entity behavior profiles.

import { useState } from "react";
import {
  Globe,
  BarChart3,
  Grid3X3,
  ArrowRightLeft,
  AlertTriangle,
  FileText,
  RefreshCw,
  Loader2,
  TrendingUp,
  Brain,
} from "lucide-react";
import {
  Badge,
  Card,
} from "@neon/ui";

import { cn } from "@/lib/utils";
import { useGlobalCloseMonitor } from "@/lib/finance/use-global-close-monitor";
import { ConsolidatedRiskPanel } from "@/components/finance/atlas/ConsolidatedRiskPanel";
import { EntityReadinessGrid } from "@/components/finance/atlas/EntityReadinessGrid";
import { CrossEntityAnomalyPanel } from "@/components/finance/atlas/CrossEntityAnomalyPanel";
import { ICIntelligencePanel } from "@/components/finance/atlas/ICIntelligencePanel";
import { GroupNarrativePanel } from "@/components/finance/atlas/GroupNarrativePanel";
import { GlobalForecastPanel } from "@/components/finance/atlas/GlobalForecastPanel";
import { LongitudinalIntelligencePanel } from "@/components/finance/atlas/LongitudinalIntelligencePanel";

// ---------------------------------------------------------------------------
// Tab config
// ---------------------------------------------------------------------------

const TABS = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "grid", label: "Entity Grid", icon: Grid3X3 },
  { id: "anomalies", label: "Anomaly Patterns", icon: AlertTriangle },
  { id: "ic", label: "IC Intelligence", icon: ArrowRightLeft },
  { id: "narrative", label: "Narratives", icon: FileText },
  { id: "forecast", label: "Forecast", icon: TrendingUp },
  { id: "longitudinal", label: "Longitudinal", icon: Brain },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ---------------------------------------------------------------------------
// Context (shared parent entity + period selector)
// ---------------------------------------------------------------------------

interface MonitorContext {
  parentEntityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

const DEFAULT_CONTEXT: MonitorContext = {
  parentEntityCode: "LE-CA",
  fiscalYear: 2026,
  periodNumber: 3,
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function GlobalCloseMonitorPage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [ctx, setCtx] = useState<MonitorContext>(DEFAULT_CONTEXT);

  const { data, loading, error, refresh } = useGlobalCloseMonitor({
    parentEntityCode: ctx.parentEntityCode,
    fiscalYear: ctx.fiscalYear,
    periodNumber: ctx.periodNumber,
  });

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b bg-background/95 px-4 py-2 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-blue-600" />
              <h1 className="text-lg font-semibold">Global Close Monitor</h1>
              <Badge variant="outline" className="text-[10px]">Advisory</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Multi-entity close intelligence · read-only view
            </p>
          </div>

          {/* Parent Entity / Period selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Parent</label>
            <input
              type="text"
              value={ctx.parentEntityCode}
              onChange={(e) => setCtx({ ...ctx, parentEntityCode: e.target.value })}
              className="h-7 w-24 rounded border bg-background px-2 text-xs"
            />
            <label className="text-xs text-muted-foreground">FY</label>
            <input
              type="number"
              value={ctx.fiscalYear}
              onChange={(e) => setCtx({ ...ctx, fiscalYear: Number(e.target.value) })}
              className="h-7 w-16 rounded border bg-background px-2 text-xs tabular-nums"
            />
            <label className="text-xs text-muted-foreground">P</label>
            <input
              type="number"
              value={ctx.periodNumber}
              min={1}
              max={12}
              onChange={(e) => setCtx({ ...ctx, periodNumber: Number(e.target.value) })}
              className="h-7 w-14 rounded border bg-background px-2 text-xs tabular-nums"
            />
            <button
              onClick={refresh}
              disabled={loading}
              className="rounded p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </button>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-1 overflow-x-auto px-4 py-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {loading && !data && (
          <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Computing global close intelligence...
          </div>
        )}

        {error && (
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertTriangle className="h-4 w-4" />
              {error}
              <button onClick={refresh} className="ml-auto text-xs underline">Retry</button>
            </div>
          </Card>
        )}

        {data && (
          <>
            {activeTab === "overview" && (
              <ConsolidatedRiskPanel
                consolidated={data.consolidated}
                parentName={data.parentEntity.name}
              />
            )}

            {activeTab === "grid" && (
              <EntityReadinessGrid entities={data.entities} />
            )}

            {activeTab === "anomalies" && (
              <CrossEntityAnomalyPanel
                anomalies={data.crossEntityAnomalies}
                overrides={data.overrideConcentration}
              />
            )}

            {activeTab === "ic" && (
              <ICIntelligencePanel
                intelligence={data.icIntelligence}
                settlements={data.icSettlement}
              />
            )}

            {activeTab === "narrative" && (
              <GroupNarrativePanel
                narrative={data.groupNarrative}
                criticalPath={data.enhancedCriticalPath}
              />
            )}

            {activeTab === "forecast" && (
              <GlobalForecastPanel
                forecast={data.groupForecast}
              />
            )}

            {activeTab === "longitudinal" && (
              <LongitudinalIntelligencePanel
                intelligence={data.longitudinalIntelligence}
              />
            )}
          </>
        )}

        {/* Footer provenance */}
        {data && (
          <p className="mt-4 text-[10px] text-muted-foreground">
            {data.parentEntity.code} · FY{data.fiscalYear} P{data.periodNumber}
            {" · "}{data.consolidated.entityCount} entities
            {" · "}computed {new Date(data.computedAt).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}
