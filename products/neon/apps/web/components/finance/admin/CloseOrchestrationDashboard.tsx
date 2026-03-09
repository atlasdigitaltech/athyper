"use client";

// components/finance/admin/CloseOrchestrationDashboard.tsx
//
// Close Orchestration Dashboard — operator-grade control tower.
// Displays: Ready Now queue, Blockers panel, Critical Path chain,
// Close Forecast cards, and parallel swimlanes.
//
// NOT a graph visualization — actionable panels for operations.

import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowUpCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  Gauge,
  Loader2,
  Play,
  RefreshCw,
  Shield,
  ShieldAlert,
  Target,
  Zap,
} from "lucide-react";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCloseGraph, type CloseGraphParams } from "@/lib/finance/use-close-graph";
import { CloseDependencyGraph } from "./CloseDependencyGraph";
import { CloseProgressTrend } from "./CloseProgressTrend";
import { useRiskSummary, useRiskSignals, type RiskSignalParams } from "@/lib/finance/use-risk-signals";
import { useCloseSnapshotTrend } from "@/lib/finance/use-close-snapshot-trend";
import { useCloseRecommendations, useBottleneckPatterns } from "@/lib/finance/use-close-recommendations";
import { RecommendedActionsPanel } from "./RecommendedActionsPanel";
import { BottleneckInsightsPanel } from "./BottleneckInsightsPanel";
import { CFOWorkspaceDashboard } from "./CFOWorkspaceDashboard";
import { CloseDocumentReadinessPanel } from "./CloseDocumentReadinessPanel";
import { DocumentHealthPanel } from "./DocumentHealthPanel";
import { RemediationControlPanel } from "./RemediationControlPanel";
import type {
  CloseTaskNodeDTO,
  CloseRiskSignalDTO,
  ReadyTaskDTO,
  BlockerDTO,
  CriticalPathDTO,
  ClosePredictionDTO,
  RiskSignalSummaryDTO,
  TaskReadinessState,
  ChecklistTaskStatus,
  CloseTaskSeverity,
} from "@/lib/finance/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CloseOrchestrationDashboardProps {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  targetStatus?: "SOFT_CLOSE" | "HARD_CLOSE";
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function CloseOrchestrationDashboard({
  entityCode,
  fiscalYear,
  periodNumber,
  targetStatus = "SOFT_CLOSE",
}: CloseOrchestrationDashboardProps) {
  const { data, loading, error, refresh } = useCloseGraph({
    entityCode,
    fiscalYear,
    periodNumber,
    targetStatus,
  });

  const riskParams: RiskSignalParams = { entityCode, fiscalYear, periodNumber };
  const { summary: riskSummary } = useRiskSummary(riskParams);
  const { signals: activeSignals } = useRiskSignals(riskParams, "active");

  const { snapshots, loading: snapshotsLoading } = useCloseSnapshotTrend({
    entityCode, fiscalYear, periodNumber, targetStatus, limit: 50,
  });

  const {
    recommendations,
    loading: recsLoading,
    accept: acceptRec,
    dismiss: dismissRec,
    refresh: refreshRecs,
  } = useCloseRecommendations({ entityCode, fiscalYear, periodNumber });

  const { patterns: bottleneckPatterns, loading: bottlenecksLoading } = useBottleneckPatterns({ entityCode });

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Computing orchestration graph…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-destructive">
        <AlertCircle className="mr-2 h-5 w-5" />
        {error}
      </div>
    );
  }

  if (!data) return null;

  const { graph, ready, criticalPath, prediction, parallelOpportunities } = data as any;
  const hasCriticalSignals = (riskSummary?.criticalCount ?? 0) > 0;
  const hasActiveSignals = (riskSummary?.activeCount ?? 0) > 0;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header row: summary cards + refresh */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold">Close Control Tower</h3>
            {hasActiveSignals && (
              <RiskBadge summary={riskSummary!} />
            )}
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* At-risk banner */}
        {hasCriticalSignals && (
          <AtRiskBanner summary={riskSummary!} />
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <SummaryCard
            title="Satisfied"
            value={graph.satisfiedCount}
            total={graph.totalTasks}
            icon={CheckCircle2}
            color="text-emerald-600"
          />
          <SummaryCard
            title="Ready Now"
            value={graph.readyCount}
            total={graph.totalTasks}
            icon={Play}
            color="text-blue-600"
          />
          <SummaryCard
            title="Blocked"
            value={graph.blockedCount}
            total={graph.totalTasks}
            icon={AlertTriangle}
            color="text-amber-600"
          />
          <ForecastCard prediction={prediction} parallelOpportunities={parallelOpportunities} />
        </div>

        {/* Active Risk Signals Panel */}
        {hasActiveSignals && activeSignals && activeSignals.length > 0 && (
          <RiskSignalsPanel signals={activeSignals} />
        )}

        {/* Cycle warning */}
        {graph.hasCycle && (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mr-2 inline h-4 w-4" />
            Dependency cycle detected: {graph.cycleTaskCodes.join(" → ")}. Fix the task dependency configuration.
          </div>
        )}

        {/* Document Readiness + Health (Phase 8B/8C) */}
        <div className="grid gap-6 lg:grid-cols-2">
          <CloseDocumentReadinessPanel
            entityCode={entityCode}
            fiscalYear={fiscalYear}
            periodNumber={periodNumber}
          />
          <DocumentHealthPanel
            entityCode={entityCode}
            fiscalYear={fiscalYear}
            periodNumber={periodNumber}
          />
        </div>

        {/* Phase 8D: Remediation Control — campaigns, previews, audit export */}
        <RemediationControlPanel
          entityCode={entityCode}
          fiscalYear={fiscalYear}
          periodNumber={periodNumber}
        />

        {/* Main panels in 2-column layout */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Ready Now Panel */}
          <ReadyNowPanel tasks={ready} />

          {/* Critical Path Panel */}
          <CriticalPathPanel criticalPath={criticalPath} />
        </div>

        {/* Dependency Graph */}
        <CloseDependencyGraph nodes={graph.nodes} />

        {/* Swimlanes */}
        <SwimlanesPanel nodes={graph.nodes} />

        {/* Phase 9: Recommended Actions */}
        <RecommendedActionsPanel
          recommendations={recommendations}
          loading={recsLoading}
          onAccept={acceptRec}
          onDismiss={dismissRec}
          onRefresh={refreshRecs}
        />

        {/* Progress Trend (snapshot history chart) */}
        <CloseProgressTrend snapshots={snapshots} loading={snapshotsLoading} />

        {/* Parallel Optimization Insights */}
        {parallelOpportunities && parallelOpportunities.improvementMinutes > 0 && (
          <ParallelInsightsCard parallelOpportunities={parallelOpportunities} />
        )}

        {/* Phase 9: Recurring Bottleneck Patterns */}
        <BottleneckInsightsPanel patterns={bottleneckPatterns} loading={bottlenecksLoading} />

        {/* Phase 10: CFO Workspace — Pack Readiness & Release Pipeline */}
        <CFOWorkspaceDashboard
          entityCode={entityCode}
          fiscalYear={fiscalYear}
          periodNumber={periodNumber}
        />
      </div>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Risk Badge (header)
// ---------------------------------------------------------------------------

function RiskBadge({ summary }: { summary: RiskSignalSummaryDTO }) {
  if (summary.criticalCount > 0) {
    return (
      <Badge variant="destructive" className="gap-1">
        <ShieldAlert className="h-3 w-3" />
        {summary.activeCount} risk{summary.activeCount !== 1 ? "s" : ""}
        {summary.criticalCount > 0 && ` (${summary.criticalCount} critical)`}
      </Badge>
    );
  }
  if (summary.highCount > 0) {
    return (
      <Badge variant="default" className="gap-1 bg-orange-600">
        <AlertTriangle className="h-3 w-3" />
        {summary.activeCount} risk{summary.activeCount !== 1 ? "s" : ""}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <ShieldAlert className="h-3 w-3" />
      {summary.activeCount} risk{summary.activeCount !== 1 ? "s" : ""}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// At-Risk Banner
// ---------------------------------------------------------------------------

function AtRiskBanner({ summary }: { summary: RiskSignalSummaryDTO }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-red-600 flex-shrink-0" />
        <span className="font-medium">
          Close at risk — {summary.criticalCount} critical signal{summary.criticalCount !== 1 ? "s" : ""}
          {summary.unacknowledgedCount > 0 &&
            `, ${summary.unacknowledgedCount} unacknowledged`}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Risk Signals Panel (compact cards for top signals)
// ---------------------------------------------------------------------------

function RiskSignalsPanel({ signals }: { signals: CloseRiskSignalDTO[] }) {
  // Show up to 5 most critical signals
  const topSignals = signals.slice(0, 5);
  const remaining = signals.length - topSignals.length;

  const severityColor: Record<string, string> = {
    critical: "border-red-200 bg-red-50",
    high: "border-orange-200 bg-orange-50",
    medium: "border-yellow-200 bg-yellow-50",
    low: "border-gray-200 bg-gray-50",
  };

  const severityTextColor: Record<string, string> = {
    critical: "text-red-700",
    high: "text-orange-700",
    medium: "text-yellow-700",
    low: "text-gray-600",
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4 text-red-600" />
          Active Risk Signals
          <Badge variant="destructive" className="ml-auto">{signals.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {topSignals.map((signal) => (
            <div
              key={signal.id}
              className={`rounded-lg border p-3 ${severityColor[signal.severity] ?? ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold uppercase ${severityTextColor[signal.severity] ?? ""}`}>
                      {signal.severity}
                    </span>
                    {signal.escalationLevel > 0 && (
                      <Badge variant="destructive" className="gap-0.5 text-[10px]">
                        <ArrowUpCircle className="h-2.5 w-2.5" />
                        L{signal.escalationLevel}
                      </Badge>
                    )}
                    <span className={`text-xs ${
                      signal.signalState === "fired" ? "text-red-600" : "text-amber-600"
                    }`}>
                      {signal.signalState === "fired" ? "Unacknowledged" : "Acknowledged"}
                    </span>
                  </div>
                  <p className="text-sm font-medium mt-1">{signal.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                    {signal.message}
                  </p>
                </div>
                {signal.ageHours !== null && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                    <Clock className="h-3 w-3" />
                    {signal.ageHours < 1
                      ? `${Math.round(signal.ageHours * 60)}m`
                      : signal.ageHours < 24
                        ? `${Math.round(signal.ageHours)}h`
                        : `${Math.round(signal.ageHours / 24)}d`}
                  </div>
                )}
              </div>
            </div>
          ))}
          {remaining > 0 && (
            <p className="text-xs text-center text-muted-foreground pt-1">
              +{remaining} more signal{remaining !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Summary Card
// ---------------------------------------------------------------------------

function SummaryCard({
  title,
  value,
  total,
  icon: Icon,
  color,
}: {
  title: string;
  value: number;
  total: number;
  icon: typeof Check;
  color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-4 pb-4">
        <div className={`rounded-md bg-muted p-2 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">
            {title} ({pct}%)
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Forecast Card
// ---------------------------------------------------------------------------

function ForecastCard({ prediction, parallelOpportunities }: {
  prediction: ClosePredictionDTO;
  parallelOpportunities?: { improvementMinutes: number; improvementPercent: number; fullyParallelMinutes: number } | null;
}) {
  const confidenceColor = {
    high: "text-emerald-600",
    medium: "text-amber-600",
    low: "text-red-600",
  }[prediction.confidence];

  const confidenceBg = {
    high: "bg-emerald-50",
    medium: "bg-amber-50",
    low: "bg-red-50",
  }[prediction.confidence];

  const hasParallelSavings = parallelOpportunities && parallelOpportunities.improvementMinutes > 0;

  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-4 pb-4">
        <div className={`rounded-md p-2 ${confidenceBg} ${confidenceColor}`}>
          <Target className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">{prediction.targetStatus.replace("_", " ")}</p>
          {prediction.predictedReadyAt ? (
            <p className="text-xs text-muted-foreground">
              ~{formatDuration(prediction.criticalPathMinutes ?? 0)} remaining
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Blocked</p>
          )}
          <div className="flex items-center gap-1.5 mt-1">
            <Badge variant="outline" className={`text-[10px] ${confidenceColor}`}>
              {prediction.confidence} confidence
            </Badge>
            {hasParallelSavings && (
              <Badge variant="outline" className="text-[10px] text-blue-600">
                {parallelOpportunities.improvementPercent}% parallelizable
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Parallel Insights Card
// ---------------------------------------------------------------------------

function ParallelInsightsCard({ parallelOpportunities }: {
  parallelOpportunities: {
    currentCriticalPathMinutes: number;
    fullyParallelMinutes: number;
    improvementMinutes: number;
    improvementPercent: number;
    recommendations: string[];
    layers: Array<{
      layer: number;
      tasks: Array<{ taskCode: string; taskName: string }>;
      maxDurationMinutes: number;
      sumDurationMinutes: number;
    }>;
  };
}) {
  const parallelLayers = parallelOpportunities.layers.filter((l) => l.tasks.length > 1);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-4 w-4 text-blue-600" />
          Parallelization Opportunities
          <Badge variant="secondary" className="ml-auto">
            {formatDuration(parallelOpportunities.improvementMinutes)} savings
          </Badge>
        </CardTitle>
        <CardDescription>
          Critical path: {formatDuration(parallelOpportunities.currentCriticalPathMinutes)} →
          With full parallelization: {formatDuration(parallelOpportunities.fullyParallelMinutes)}
          ({parallelOpportunities.improvementPercent}% improvement)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {parallelLayers.slice(0, 5).map((layer) => {
            const savings = layer.sumDurationMinutes - layer.maxDurationMinutes;
            return (
              <div key={layer.layer} className="rounded-lg border p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">Layer {layer.layer}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {layer.tasks.length} tasks
                    </Badge>
                    {savings > 0 && (
                      <Badge variant="secondary" className="text-[10px] text-emerald-600">
                        {formatDuration(savings)} saved
                      </Badge>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {layer.tasks.map((t) => t.taskCode).join(", ")}
                </p>
              </div>
            );
          })}
          {parallelOpportunities.recommendations.length > 0 && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
              <ul className="space-y-1 text-xs text-blue-800">
                {parallelOpportunities.recommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Ready Now Panel
// ---------------------------------------------------------------------------

function ReadyNowPanel({ tasks }: { tasks: ReadyTaskDTO[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Play className="h-4 w-4 text-blue-600" />
          Ready Now
          <Badge variant="secondary" className="ml-auto">{tasks.length}</Badge>
        </CardTitle>
        <CardDescription>Tasks whose predecessors are all satisfied</CardDescription>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No tasks ready — resolve blockers first
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="text-right">Impact</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((t) => (
                <TableRow key={t.taskCode}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {t.autoStartWhenReady && (
                        <Tooltip>
                          <TooltipTrigger>
                            <Zap className="h-3.5 w-3.5 text-amber-500" />
                          </TooltipTrigger>
                          <TooltipContent>Auto-start when ready</TooltipContent>
                        </Tooltip>
                      )}
                      <div>
                        <p className="font-medium text-sm">{t.taskName}</p>
                        <p className="text-xs text-muted-foreground">{t.taskCode}</p>
                      </div>
                      <SeverityBadge severity={t.severity} />
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {t.assignedRole ?? "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {t.estimatedDurationMinutes
                      ? formatDuration(t.estimatedDurationMinutes)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Tooltip>
                      <TooltipTrigger>
                        <Badge variant={t.downstreamImpactCount > 2 ? "destructive" : "secondary"}>
                          {t.downstreamImpactCount}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t.downstreamImpactCount} downstream task(s) depend on this
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Critical Path Panel
// ---------------------------------------------------------------------------

function CriticalPathPanel({ criticalPath }: { criticalPath: CriticalPathDTO }) {
  if (criticalPath.path.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4 text-violet-600" />
            Critical Path
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-4 text-center text-sm text-muted-foreground">
            All tasks on this path are satisfied
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4 text-violet-600" />
          Critical Path
          <span className="ml-auto text-sm font-normal text-muted-foreground">
            {formatDuration(criticalPath.totalEstimatedMinutes)} total
          </span>
        </CardTitle>
        <CardDescription>
          Longest remaining dependency chain to{" "}
          {criticalPath.targetStatus?.replace("_", " ") ?? "close"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-1">
          {criticalPath.path.map((step, i) => (
            <div key={step.taskCode} className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger>
                  <div
                    className={`rounded px-2 py-1 text-xs font-medium border ${
                      step.readinessState === "BLOCKED" || step.status === "FAILED"
                        ? "border-red-200 bg-red-50 text-red-700"
                        : step.readinessState === "SATISFIED"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : step.readinessState === "READY"
                            ? "border-blue-200 bg-blue-50 text-blue-700"
                            : "border-gray-200 bg-gray-50 text-gray-700"
                    }`}
                  >
                    {step.taskCode}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium">{step.taskName}</p>
                  <p className="text-xs">
                    Status: {step.status} · Readiness: {step.readinessState}
                    {step.estimatedDurationMinutes
                      ? ` · ${step.estimatedDurationMinutes}min`
                      : ""}
                  </p>
                </TooltipContent>
              </Tooltip>
              {i < criticalPath.path.length - 1 && (
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
              )}
            </div>
          ))}
        </div>

        {criticalPath.dominantBlockerTaskCode && (
          <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
            Dominant blocker: <strong>{criticalPath.dominantBlockerTaskCode}</strong>
            — resolve this first for maximum impact
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Swimlanes Panel
// ---------------------------------------------------------------------------

const LANE_CONFIG: Record<string, { label: string; color: string }> = {
  SATISFIED: { label: "Satisfied", color: "border-emerald-200 bg-emerald-50/50" },
  READY: { label: "Ready Now", color: "border-blue-200 bg-blue-50/50" },
  IN_PROGRESS: { label: "In Progress", color: "border-violet-200 bg-violet-50/50" },
  NOT_READY: { label: "Waiting", color: "border-gray-200 bg-gray-50/50" },
  BLOCKED: { label: "Blocked", color: "border-red-200 bg-red-50/50" },
};

function SwimlanesPanel({ nodes }: { nodes: CloseTaskNodeDTO[] }) {
  const lanes = useMemo(() => {
    const grouped = new Map<string, CloseTaskNodeDTO[]>();
    for (const state of ["READY", "IN_PROGRESS", "NOT_READY", "BLOCKED", "SATISFIED"]) {
      grouped.set(state, []);
    }
    for (const node of nodes) {
      const lane = grouped.get(node.readinessState) ?? grouped.get("NOT_READY")!;
      lane.push(node);
    }
    return grouped;
  }, [nodes]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Task Swimlanes</CardTitle>
        <CardDescription>Tasks grouped by readiness state</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(["READY", "IN_PROGRESS", "NOT_READY", "BLOCKED", "SATISFIED"] as const).map(
            (state) => {
              const items = lanes.get(state) ?? [];
              const cfg = LANE_CONFIG[state];

              return (
                <div
                  key={state}
                  className={`rounded-lg border p-3 ${cfg.color}`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {cfg.label}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {items.length}
                    </Badge>
                  </div>
                  <div className="space-y-1.5">
                    {items.map((node) => (
                      <Tooltip key={node.taskCode}>
                        <TooltipTrigger asChild>
                          <div className="rounded border bg-white px-2 py-1.5 text-xs shadow-sm cursor-default">
                            <div className="flex items-center justify-between">
                              <span className="font-medium truncate max-w-[100px]">
                                {node.taskCode}
                              </span>
                              <span className="flex items-center gap-1">
                                {node.activeSignalCount > 0 && (
                                  <span className="text-[10px] text-red-600 font-medium">
                                    ⚠{node.activeSignalCount}
                                  </span>
                                )}
                                {node.downstreamImpactCount > 0 && (
                                  <span className="text-[10px] text-muted-foreground">
                                    ↓{node.downstreamImpactCount}
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <p className="font-medium">{node.taskName}</p>
                          <p className="text-xs text-muted-foreground">
                            {node.category} · {node.completionMode}
                            {node.estimatedDurationMinutes
                              ? ` · ${node.estimatedDurationMinutes}min`
                              : ""}
                          </p>
                          {node.blockedByTaskCodes.length > 0 && (
                            <p className="mt-1 text-xs text-red-500">
                              Blocked by: {node.blockedByTaskCodes.join(", ")}
                            </p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                    {items.length === 0 && (
                      <p className="py-2 text-center text-[10px] text-muted-foreground">
                        None
                      </p>
                    )}
                  </div>
                </div>
              );
            },
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SeverityBadge({ severity }: { severity: CloseTaskSeverity | null }) {
  if (!severity) return null;
  const config: Record<string, string> = {
    critical: "bg-red-100 text-red-700",
    high: "bg-orange-100 text-orange-700",
    medium: "bg-yellow-100 text-yellow-700",
    low: "bg-gray-100 text-gray-600",
  };
  return (
    <Badge variant="outline" className={`text-[10px] ${config[severity] ?? ""}`}>
      {severity}
    </Badge>
  );
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
