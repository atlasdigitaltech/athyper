"use client";

// components/finance/admin/ControlObjectivesPanel.tsx
//
// Phase 17: Control Objectives Dashboard.
// Shows target vs actual vs variance with traffic lights, trend arrows,
// and adaptive policy recommendations.

import { useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Lightbulb,
  Loader2,
  Minus,
  RefreshCw,
  Settings,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type {
  BenchmarkDTO,
  PolicyRecommendationDTO,
  ControlTargetDTO,
} from "@/lib/finance/use-control-benchmarking";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ControlObjectivesPanelProps {
  benchmarks: BenchmarkDTO[];
  recommendations: PolicyRecommendationDTO[];
  targets: ControlTargetDTO[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onSeedDefaults: () => void;
  seedLoading: boolean;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TRAFFIC_COLORS: Record<string, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

const TRAFFIC_TEXT: Record<string, string> = {
  green: "text-emerald-600",
  amber: "text-amber-600",
  red: "text-red-600",
};

const TREND_ICONS: Record<string, typeof ArrowUp> = {
  improving: ArrowUp,
  declining: ArrowDown,
  stable: Minus,
  baseline: ArrowRight,
};

const TREND_COLORS: Record<string, string> = {
  improving: "text-emerald-500",
  declining: "text-red-500",
  stable: "text-muted-foreground",
  baseline: "text-blue-500",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
};

const POLICY_AREA_LABELS: Record<string, string> = {
  override_governance: "Override Governance",
  evidence_governance: "Evidence Governance",
  attestation_governance: "Attestation Governance",
  distribution_governance: "Distribution Governance",
  close_governance: "Close Governance",
  task_governance: "Task Governance",
};

const GROUP_LABELS: Record<string, string> = {
  control: "Close Control",
  evidence: "Evidence & PBC",
  attestation: "Attestation",
  distribution: "Distribution",
  composite: "Composite",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ControlObjectivesPanel({
  benchmarks,
  recommendations,
  targets,
  loading,
  error,
  onRefresh,
  onSeedDefaults,
  seedLoading,
}: ControlObjectivesPanelProps) {
  const [showRecommendations, setShowRecommendations] = useState(true);
  const [expandedRec, setExpandedRec] = useState<string | null>(null);

  // Get latest period benchmarks (deduplicate by metric for most recent period)
  const latestPeriod = benchmarks.length > 0
    ? { fy: benchmarks[0].fiscalYear, p: benchmarks[0].periodNumber }
    : null;

  const latestBenchmarks = latestPeriod
    ? benchmarks.filter(
        (b) => b.fiscalYear === latestPeriod.fy && b.periodNumber === latestPeriod.p,
      )
    : [];

  // Group benchmarks by metric_group
  const grouped = latestBenchmarks.reduce<Record<string, BenchmarkDTO[]>>((acc, b) => {
    const group = b.metricGroup;
    if (!acc[group]) acc[group] = [];
    acc[group].push(b);
    return acc;
  }, {});

  // Summary stats
  const greenCount = latestBenchmarks.filter((b) => b.trafficLight === "green").length;
  const amberCount = latestBenchmarks.filter((b) => b.trafficLight === "amber").length;
  const redCount = latestBenchmarks.filter((b) => b.trafficLight === "red").length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Crosshair className="h-4 w-4" />
            Control Objectives
            {latestBenchmarks.length > 0 && (
              <div className="flex items-center gap-1 ml-2">
                {greenCount > 0 && (
                  <Badge className="text-[8px] bg-emerald-100 text-emerald-700">{greenCount}</Badge>
                )}
                {amberCount > 0 && (
                  <Badge className="text-[8px] bg-amber-100 text-amber-700">{amberCount}</Badge>
                )}
                {redCount > 0 && (
                  <Badge className="text-[8px] bg-red-100 text-red-700">{redCount}</Badge>
                )}
              </div>
            )}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Loading / Error */}
        {loading && latestBenchmarks.length === 0 && targets.length === 0 && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}

        {/* No targets — offer to seed defaults */}
        {!loading && targets.length === 0 && !error && (
          <div className="text-center py-4 space-y-2">
            <Settings className="h-6 w-6 text-muted-foreground mx-auto" />
            <p className="text-xs text-muted-foreground">
              No control targets configured for this entity.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={onSeedDefaults}
              disabled={seedLoading}
            >
              {seedLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <Zap className="h-3.5 w-3.5 mr-1" />
              )}
              Seed Default Targets
            </Button>
          </div>
        )}

        {/* Benchmark table by group */}
        {Object.entries(grouped).map(([group, metrics]) => (
          <div key={group}>
            <p className="text-[10px] font-medium text-muted-foreground mb-1.5">
              {GROUP_LABELS[group] ?? group}
            </p>
            <div className="space-y-1">
              {metrics.map((b) => {
                const TrendIcon = TREND_ICONS[b.trend] ?? Minus;
                const trendColor = TREND_COLORS[b.trend] ?? "";
                const varianceNum = b.variance ? Number(b.variance) : 0;

                return (
                  <div
                    key={b.metricCode}
                    className="flex items-center gap-2 text-xs border rounded-md px-2.5 py-1.5"
                  >
                    {/* Traffic light dot */}
                    <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${TRAFFIC_COLORS[b.trafficLight] ?? "bg-gray-300"}`} />

                    {/* Metric label */}
                    <div className="flex-1 min-w-0">
                      <span className="truncate">{b.metricLabel}</span>
                    </div>

                    {/* Actual */}
                    <div className="text-right w-14 shrink-0">
                      <span className={`font-semibold ${TRAFFIC_TEXT[b.trafficLight] ?? ""}`}>
                        {b.actualValue ?? "—"}
                      </span>
                    </div>

                    {/* Target */}
                    <div className="text-right w-12 shrink-0 text-muted-foreground">
                      {b.targetValue}
                    </div>

                    {/* Variance */}
                    <div className={`text-right w-14 shrink-0 font-medium ${varianceNum >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {varianceNum > 0 ? "+" : ""}{b.variance ?? "—"}
                    </div>

                    {/* Trend */}
                    <TrendIcon className={`h-3 w-3 shrink-0 ${trendColor}`} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Column headers (only if we have data) */}
        {latestBenchmarks.length > 0 && (
          <div className="flex items-center gap-2 text-[9px] text-muted-foreground px-2.5 -mt-1">
            <div className="w-2.5" />
            <div className="flex-1">Metric</div>
            <div className="w-14 text-right">Actual</div>
            <div className="w-12 text-right">Target</div>
            <div className="w-14 text-right">Variance</div>
            <div className="w-3">Trend</div>
          </div>
        )}

        {/* Policy Recommendations */}
        {recommendations.length > 0 && (
          <div>
            <button
              className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground mb-1.5"
              onClick={() => setShowRecommendations(!showRecommendations)}
            >
              <Lightbulb className="h-3 w-3 text-amber-500" />
              Policy Recommendations ({recommendations.length})
              {showRecommendations ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {showRecommendations && (
              <div className="space-y-1.5">
                {recommendations.map((rec) => {
                  const isExpanded = expandedRec === rec.recommendationType + rec.title;
                  return (
                    <div
                      key={rec.recommendationType + rec.title}
                      className="border rounded-md"
                    >
                      <button
                        className="w-full flex items-start gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-muted/50"
                        onClick={() => setExpandedRec(isExpanded ? null : rec.recommendationType + rec.title)}
                      >
                        <Badge className={`text-[7px] shrink-0 mt-0.5 ${PRIORITY_COLORS[rec.priority] ?? ""}`}>
                          {rec.priority}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{rec.title}</p>
                          <Badge variant="outline" className="text-[7px] mt-0.5">
                            {POLICY_AREA_LABELS[rec.policyArea] ?? rec.policyArea}
                          </Badge>
                        </div>
                        {isExpanded ? <ChevronUp className="h-3 w-3 mt-1" /> : <ChevronDown className="h-3 w-3 mt-1" />}
                      </button>
                      {isExpanded && (
                        <div className="px-2.5 pb-2">
                          <p className="text-[10px] text-muted-foreground whitespace-pre-line">
                            {rec.detail}
                          </p>
                          {rec.recommendationData && (
                            <div className="mt-1.5 flex gap-1 flex-wrap">
                              {rec.recommendationData.suggested_action && (
                                <Badge variant="secondary" className="text-[7px]">
                                  <AlertTriangle className="h-2 w-2 mr-0.5" />
                                  {rec.recommendationData.suggested_action.replace(/_/g, " ")}
                                </Badge>
                              )}
                              {rec.recommendationData.suggested_actions &&
                                (rec.recommendationData.suggested_actions as string[]).map((a: string) => (
                                  <Badge key={a} variant="secondary" className="text-[7px]">
                                    {a.replace(/_/g, " ")}
                                  </Badge>
                                ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
