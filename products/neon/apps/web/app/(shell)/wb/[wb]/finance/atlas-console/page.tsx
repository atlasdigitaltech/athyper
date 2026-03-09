"use client";

// Atlas Intelligence Console
//
// Unified workspace for all Atlas Intelligence Layer capabilities:
// anomalies, predictions, narratives, insight graph, and feedback/calibration.

import { useState } from "react";
import {
  Brain,
  AlertTriangle,
  TrendingUp,
  Network,
  MessageSquare,
  FileText,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { AtlasInsightsPanel } from "@/components/finance/AtlasInsightsPanel";
import { AnomalyExplorer } from "@/components/finance/atlas/AnomalyExplorer";
import { PredictionsPanel } from "@/components/finance/atlas/PredictionsPanel";
import { InsightGraphExplorer } from "@/components/finance/atlas/InsightGraphExplorer";
import { FeedbackCalibrationPanel } from "@/components/finance/atlas/FeedbackCalibrationPanel";
import { NarrativesPanel } from "@/components/finance/atlas/NarrativesPanel";
import { useAtlasDashboard } from "@/lib/finance/use-atlas-dashboard";

// ---------------------------------------------------------------------------
// Tab configuration
// ---------------------------------------------------------------------------

const ATLAS_TABS = [
  { id: "overview", label: "Overview", icon: Brain },
  { id: "anomalies", label: "Anomalies", icon: AlertTriangle },
  { id: "predictions", label: "Predictions", icon: TrendingUp },
  { id: "narratives", label: "Narratives", icon: FileText },
  { id: "graph", label: "Insight Graph", icon: Network },
  { id: "feedback", label: "Feedback & Calibration", icon: MessageSquare },
] as const;

type TabId = (typeof ATLAS_TABS)[number]["id"];

// ---------------------------------------------------------------------------
// Entity / period selector state (shared across tabs)
// ---------------------------------------------------------------------------

interface AtlasContext {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

const DEFAULT_CONTEXT: AtlasContext = {
  entityCode: "ACME",
  fiscalYear: 2026,
  periodNumber: 3,
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AtlasConsolePage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [ctx, setCtx] = useState<AtlasContext>(DEFAULT_CONTEXT);

  // Dashboard data (used by overview + predictions + narratives tabs)
  const dashboard = useAtlasDashboard({
    entityCode: ctx.entityCode,
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
              <Brain className="h-4 w-4 text-indigo-600" />
              <h1 className="text-lg font-semibold">Atlas Intelligence Console</h1>
            </div>
            <p className="text-xs text-muted-foreground">
              Financial intelligence, anomaly detection, and adaptive learning
            </p>
          </div>

          {/* Entity / Period selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Entity</label>
            <input
              type="text"
              value={ctx.entityCode}
              onChange={(e) => setCtx({ ...ctx, entityCode: e.target.value })}
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
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-1 overflow-x-auto px-4 py-1">
          {ATLAS_TABS.map((tab) => {
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

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === "overview" && (
          <AtlasInsightsPanel
            data={dashboard.data}
            loading={dashboard.loading}
            error={dashboard.error}
            onRefresh={dashboard.refresh}
          />
        )}

        {activeTab === "anomalies" && (
          <AnomalyExplorer
            entityCode={ctx.entityCode}
            fiscalYear={ctx.fiscalYear}
            periodNumber={ctx.periodNumber}
          />
        )}

        {activeTab === "predictions" && (
          <PredictionsPanel
            data={dashboard.data}
            loading={dashboard.loading}
          />
        )}

        {activeTab === "narratives" && (
          <NarrativesPanel
            data={dashboard.data}
            loading={dashboard.loading}
          />
        )}

        {activeTab === "graph" && (
          <InsightGraphExplorer
            entityCode={ctx.entityCode}
            fiscalYear={ctx.fiscalYear}
            periodNumber={ctx.periodNumber}
          />
        )}

        {activeTab === "feedback" && (
          <FeedbackCalibrationPanel
            entityCode={ctx.entityCode}
            fiscalYear={ctx.fiscalYear}
            periodNumber={ctx.periodNumber}
          />
        )}
      </div>
    </div>
  );
}
