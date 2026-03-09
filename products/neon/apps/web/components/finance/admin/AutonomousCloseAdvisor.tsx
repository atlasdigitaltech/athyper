"use client";

// components/finance/admin/AutonomousCloseAdvisor.tsx
//
// Phase 10: Autonomous Close Advisor dashboard.
// Sub-tabs: Completion Forecast, Defect Queue, Remediation Campaigns,
// Override Posture, Entity Heatmap, Controller Alerts.

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flame,
  Loader2,
  Map,
  Minus,
  PackageCheck,
  Shield,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  X,
  XCircle,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";
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
  useAdvisorCompletionForecast,
  useAdvisorDefectQueue,
  useAdvisorRemediation,
  useAdvisorOverridePosture,
  useAdvisorEntityHeatmap,
  useAdvisorControllerAlerts,
} from "@/lib/finance/use-close-advisor";

import { suggestCampaigns } from "@/lib/finance/copilot-campaign-suggester";

import type {
  AdvisorRemediationCampaignDTO,
  AdvisorDefectQueueItemDTO,
  AdvisorCompletionForecastDTO,
  AdvisorOverridePostureDTO,
  AdvisorEntityHeatmapDTO,
  AdvisorControllerAlertDTO,
  CampaignSuggestion,
  CopilotDrillAction,
  RiskTierDTO,
  RiskColorDTO,
  PostureAssessmentDTO,
  ForecastAssessmentDTO,
  PredictionTrendDTO,
} from "@/lib/finance/types";

// ---------------------------------------------------------------------------
// Sub-tabs
// ---------------------------------------------------------------------------

const ADVISOR_TABS = [
  { id: "forecast", label: "Completion Forecast", icon: Calendar },
  { id: "defects", label: "Defect Queue", icon: Flame },
  { id: "campaigns", label: "Remediation", icon: PackageCheck },
  { id: "overrides", label: "Override Posture", icon: Shield },
  { id: "heatmap", label: "Entity Heatmap", icon: Map },
  { id: "alerts", label: "Controller Alerts", icon: Bell },
] as const;

type AdvisorTabId = (typeof ADVISOR_TABS)[number]["id"];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AutonomousCloseAdvisorProps {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  /** Set by copilot drill-through to open a specific sub-tab */
  initialSubTab?: string;
  /** Set by copilot drill-through to highlight a specific item */
  focusId?: string;
  /** Action to perform on arrival (e.g. accept defect, filter view) */
  drillAction?: CopilotDrillAction;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function AutonomousCloseAdvisor({
  entityCode,
  fiscalYear,
  periodNumber,
  initialSubTab,
  focusId,
  drillAction,
}: AutonomousCloseAdvisorProps) {
  const [activeTab, setActiveTab] = useState<AdvisorTabId>("forecast");

  // Respond to drill-through navigation from copilot
  useEffect(() => {
    if (initialSubTab && ADVISOR_TABS.some((t) => t.id === initialSubTab)) {
      setActiveTab(initialSubTab as AdvisorTabId);
    }
  }, [initialSubTab]);

  const periodParams = useMemo(
    () => ({ entityCode, fiscalYear, periodNumber }),
    [entityCode, fiscalYear, periodNumber],
  );

  const entityParams = useMemo(() => ({ entityCode }), [entityCode]);

  return (
    <div className="space-y-4">
      {/* Sub-tab bar */}
      <div className="flex items-center gap-1 overflow-x-auto">
        {ADVISOR_TABS.map((tab) => {
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

      {activeTab === "forecast" && <CompletionForecastTab params={periodParams} />}
      {activeTab === "defects" && <DefectQueueTab params={periodParams} focusId={focusId} drillAction={drillAction} />}
      {activeTab === "campaigns" && <RemediationCampaignsTab params={periodParams} focusId={focusId} />}
      {activeTab === "overrides" && <OverridePostureTab params={periodParams} />}
      {activeTab === "heatmap" && <EntityHeatmapTab params={entityParams} />}
      {activeTab === "alerts" && <ControllerAlertsTab params={entityParams} focusId={focusId} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function LoadingCard({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {message}
      </CardContent>
    </Card>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-destructive">
        <XCircle className="size-4" />
        {message}
      </CardContent>
    </Card>
  );
}

function KpiCard({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2",
        warn && "border-destructive/40 bg-destructive/5",
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold", warn && "text-destructive")}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function riskTierBadge(tier: RiskTierDTO) {
  const variant = tier === "CRITICAL" || tier === "HIGH" ? "destructive" : "secondary";
  return <Badge variant={variant}>{tier}</Badge>;
}

function riskColorBadge(color: RiskColorDTO) {
  const cls =
    color === "RED"
      ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
      : color === "AMBER"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200";
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", cls)}>{color}</span>;
}

function severityBadge(severity: string) {
  const variant =
    severity === "critical" ? "destructive" : severity === "high" ? "destructive" : "secondary";
  return <Badge variant={variant}>{severity}</Badge>;
}

function assessmentBadge(assessment: ForecastAssessmentDTO) {
  const map: Record<ForecastAssessmentDTO, { cls: string }> = {
    WILL_BREACH: { cls: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
    CRITICAL: { cls: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
    TIGHT: { cls: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
    ADEQUATE: { cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" },
    COMFORTABLE: { cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" },
    NO_PREDICTION: { cls: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200" },
  };
  const cfg = map[assessment] ?? map.NO_PREDICTION;
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", cfg.cls)}>{assessment.replace(/_/g, " ")}</span>;
}

function trendIcon(trend: PredictionTrendDTO) {
  if (trend === "SLIPPING") return <TrendingDown className="size-3.5 text-destructive" />;
  if (trend === "IMPROVING") return <TrendingUp className="size-3.5 text-emerald-600" />;
  if (trend === "STABLE") return <Minus className="size-3.5 text-muted-foreground" />;
  return null;
}

function postureBadge(assessment: PostureAssessmentDTO) {
  const cls =
    assessment === "ELEVATED"
      ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
      : assessment === "WATCH"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200";
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", cls)}>{assessment}</span>;
}

function alertTypeBadge(type: string) {
  const cls =
    type === "RISK_SIGNAL"
      ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
      : type === "ANOMALY"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
        : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", cls)}>{type.replace(/_/g, " ")}</span>;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtHours(hours: number | null) {
  if (hours == null) return "—";
  if (hours < 0) return `${Math.abs(hours).toFixed(1)}h behind`;
  return `${hours.toFixed(1)}h buffer`;
}

// ---------------------------------------------------------------------------
// Campaign Suggestion Card (Phase 12C)
// ---------------------------------------------------------------------------

function CampaignSuggestionCard({
  suggestion,
  onDismiss,
  onLaunch,
}: {
  suggestion: CampaignSuggestion;
  onDismiss: () => void;
  onLaunch: () => void;
}) {
  const hasCritical = suggestion.criticalCount > 0;
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3 py-2.5",
        hasCritical
          ? "border-destructive/30 bg-destructive/5"
          : "border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20",
      )}
    >
      <Sparkles className={cn("mt-0.5 size-4 shrink-0", hasCritical ? "text-destructive" : "text-amber-500")} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{suggestion.campaignName}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{suggestion.rationale}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            {suggestion.itemCount} items
          </Badge>
          {suggestion.criticalCount > 0 && (
            <Badge variant="destructive" className="text-[10px]">
              {suggestion.criticalCount} critical
            </Badge>
          )}
          {suggestion.highCount > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {suggestion.highCount} high
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground">
            Urgency: {suggestion.urgencyScore}
          </span>
          {suggestion.avgHoursPending > 24 && (
            <span className="text-[10px] text-destructive">
              Avg {suggestion.avgHoursPending}h pending
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onDismiss}>
          Dismiss
        </Button>
        <Button size="sm" className="h-7 gap-1 px-2.5 text-xs" onClick={onLaunch}>
          Review & Launch
          <ChevronRight className="size-3" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Completion Forecast Tab
// ---------------------------------------------------------------------------

function CompletionForecastTab({ params }: { params: { entityCode: string; fiscalYear: number; periodNumber: number } }) {
  const { forecast, loading, error } = useAdvisorCompletionForecast(params);

  if (loading && !forecast) return <LoadingCard message="Loading completion forecast..." />;
  if (error) return <ErrorCard message={error} />;
  if (!forecast) return <ErrorCard message="No active close run found" />;

  const f = forecast;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar className="h-4 w-4" />
          Close Completion Forecast
        </CardTitle>
        <CardDescription>
          Predicted close date vs calendar targets with trend analysis
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Assessment + Trend strip */}
        <div className="flex flex-wrap items-center gap-3">
          {assessmentBadge(f.forecastAssessment)}
          {riskTierBadge(f.riskTier)}
          <span className="flex items-center gap-1 text-sm">
            {trendIcon(f.predictionTrend)}
            <span className="text-muted-foreground">{f.predictionTrend.replace(/_/g, " ")}</span>
            {f.trendShiftHours != null && (
              <span className="text-xs text-muted-foreground">
                ({f.trendShiftHours > 0 ? "+" : ""}{f.trendShiftHours.toFixed(1)}h)
              </span>
            )}
          </span>
          <Badge variant="outline">{f.runStatus}</Badge>
          {f.closeType && <Badge variant="outline">{f.closeType}</Badge>}
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          <KpiCard
            label="Hard Close Target"
            value={f.hardCloseTarget ? new Date(f.hardCloseTarget).toLocaleDateString() : "—"}
          />
          <KpiCard
            label="Predicted Ready"
            value={f.hardPredictedAt ? new Date(f.hardPredictedAt).toLocaleDateString() : "—"}
            sub={f.hardConfidence ? `Confidence: ${f.hardConfidence}` : undefined}
          />
          <KpiCard
            label="Hard Buffer"
            value={fmtHours(f.hardBufferHours)}
            warn={f.hardBufferHours != null && f.hardBufferHours < 0}
          />
          <KpiCard
            label="Completion"
            value={`${f.completionPct}%`}
            sub={`${f.satisfiedCount ?? 0}/${f.totalTasks ?? 0} tasks`}
          />
          <KpiCard
            label="Breach Probability"
            value={`${f.hardBreachPct}%`}
            warn={f.hardBreachPct >= 50}
          />
          <KpiCard
            label="Slippage Count"
            value={String(f.slippageCount)}
            warn={f.slippageCount > 2}
          />
        </div>

        {/* Soft close comparison */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <KpiCard
            label="Soft Close Target"
            value={f.softCloseTarget ? new Date(f.softCloseTarget).toLocaleDateString() : "—"}
          />
          <KpiCard
            label="Soft Predicted"
            value={f.softPredictedAt ? new Date(f.softPredictedAt).toLocaleDateString() : "—"}
          />
          <KpiCard
            label="Soft Buffer"
            value={fmtHours(f.softBufferHours)}
            warn={f.softBufferHours != null && f.softBufferHours < 0}
          />
        </div>

        {/* Blockers strip */}
        {(f.blockedCount ?? 0) > 0 || (f.failedCount ?? 0) > 0 ? (
          <div className="flex items-center gap-4 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm">
            <AlertTriangle className="size-4 text-destructive" />
            <span className="text-destructive">{f.blockedCount} blocked, {f.failedCount} failed tasks</span>
            {f.criticalPathMinutes != null && (
              <span className="text-muted-foreground">
                Critical path: {Math.round(f.criticalPathMinutes / 60)}h
              </span>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 2. Defect Queue Tab
// ---------------------------------------------------------------------------

function DefectQueueTab({
  params,
  focusId,
  drillAction,
}: {
  params: { entityCode: string; fiscalYear: number; periodNumber: number };
  focusId?: string;
  drillAction?: CopilotDrillAction;
}) {
  const { items, loading, error, accept, dismiss } = useAdvisorDefectQueue(params);
  const focusRef = useRef<HTMLTableRowElement>(null);
  const actionExecutedRef = useRef<string | null>(null);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());

  // Auto-campaign suggestions
  const campaignSuggestions = useMemo(() => {
    if (!items || items.length === 0) return [];
    return suggestCampaigns(
      items,
      params.entityCode,
      params.fiscalYear,
      params.periodNumber,
    ).filter((s) => !dismissedSuggestions.has(s.key));
  }, [items, params.entityCode, params.fiscalYear, params.periodNumber, dismissedSuggestions]);

  const handleDismissSuggestion = useCallback((key: string) => {
    setDismissedSuggestions((prev) => new Set([...prev, key]));
  }, []);

  // Filter state from drill action
  const [severityFilter, setSeverityFilter] = useState<string | undefined>(
    drillAction?.type === "filter_view" ? drillAction.severity : undefined,
  );

  // Scroll to focused item
  useEffect(() => {
    if (focusId && focusRef.current) {
      focusRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusId, items]);

  // Execute accept_defect action once when items load
  useEffect(() => {
    if (
      drillAction?.type === "accept_defect" &&
      items &&
      items.some((i) => i.actionId === drillAction.actionId) &&
      actionExecutedRef.current !== drillAction.actionId
    ) {
      // Don't auto-execute — just highlight and scroll. User confirms manually.
      actionExecutedRef.current = drillAction.actionId;
    }
  }, [drillAction, items]);

  // Update filter when drill action changes
  useEffect(() => {
    if (drillAction?.type === "filter_view" && drillAction.severity) {
      setSeverityFilter(drillAction.severity);
    }
  }, [drillAction]);

  if (loading && !items) return <LoadingCard message="Loading defect queue..." />;
  if (error) return <ErrorCard message={error} />;

  const allItems = items ?? [];
  const queue = severityFilter
    ? allItems.filter((q) => q.severity === severityFilter)
    : allItems;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Flame className="h-4 w-4" />
          Auto-Prioritized Defect Queue
        </CardTitle>
        <CardDescription className="flex items-center gap-2">
          Pending recommendations ranked by severity, SLA urgency, and bottleneck recurrence
          {severityFilter && (
            <Badge variant="outline" className="ml-2 gap-1">
              Filter: {severityFilter}
              <button onClick={() => setSeverityFilter(undefined)} className="ml-0.5 hover:text-destructive">
                <X className="size-2.5" />
              </button>
            </Badge>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {queue.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4" />
            No pending defects in queue
          </div>
        ) : (
          <>
            {/* Summary strip */}
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <KpiCard
                label="Total Pending"
                value={String(queue.length)}
              />
              <KpiCard
                label="Critical"
                value={String(queue.filter((q) => q.severity === "critical").length)}
                warn={queue.some((q) => q.severity === "critical")}
              />
              <KpiCard
                label="High"
                value={String(queue.filter((q) => q.severity === "high").length)}
                warn={queue.some((q) => q.severity === "high")}
              />
              <KpiCard
                label="Avg Hours Pending"
                value={
                  queue.length > 0
                    ? (queue.reduce((s, q) => s + q.hoursPending, 0) / queue.length).toFixed(1)
                    : "0"
                }
              />
            </div>

            {/* Auto-campaign suggestions banner */}
            {campaignSuggestions.length > 0 && (
              <div className="mb-4 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Sparkles className="size-3.5 text-amber-500" />
                  {campaignSuggestions.length} campaign suggestion{campaignSuggestions.length > 1 ? "s" : ""} detected
                </div>
                {campaignSuggestions.map((sg) => (
                  <CampaignSuggestionCard
                    key={sg.key}
                    suggestion={sg}
                    onDismiss={() => handleDismissSuggestion(sg.key)}
                    onLaunch={() => {
                      // Navigate to RemediationControlPanel with prefill
                      if (typeof window !== "undefined") {
                        window.dispatchEvent(
                          new CustomEvent("copilot:drill", {
                            detail: {
                              tab: "remediation",
                              action: {
                                type: "prefill_campaign",
                                actionIds: sg.actionIds,
                                campaignName: sg.campaignName,
                              },
                            },
                          }),
                        );
                      }
                    }}
                  />
                ))}
              </div>
            )}

            <div className="max-h-[400px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Score</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Policy</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>SLA Risk</TableHead>
                    <TableHead>Hours Pending</TableHead>
                    <TableHead>Bottleneck</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queue.map((item) => (
                    <TableRow
                      key={item.actionId}
                      ref={item.actionId === focusId ? focusRef : undefined}
                      className={cn(
                        item.actionId === focusId && "ring-2 ring-primary/50 bg-primary/5",
                      )}
                    >
                      <TableCell>
                        <Badge
                          variant={item.queuePriorityScore >= 60 ? "destructive" : "secondary"}
                        >
                          {item.queuePriorityScore}
                        </Badge>
                      </TableCell>
                      <TableCell>{severityBadge(item.severity)}</TableCell>
                      <TableCell className="max-w-[150px] truncate text-sm">
                        {item.policyName}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {item.triggerType.replace(/_/g, " ")}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {item.actionType.replace(/_/g, " ")}
                      </TableCell>
                      <TableCell>{riskTierBadge(item.slaRiskTier)}</TableCell>
                      <TableCell
                        className={cn(
                          "text-sm",
                          item.hoursPending > 24 && "text-destructive",
                        )}
                      >
                        {item.hoursPending.toFixed(1)}h
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {item.bottleneckPattern ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() => accept(item.actionId)}
                          >
                            <Check className="size-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() => dismiss(item.actionId)}
                          >
                            <X className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3. Remediation Campaigns Tab
// ---------------------------------------------------------------------------

function RemediationCampaignsTab({ params, focusId }: { params: { entityCode: string; fiscalYear: number; periodNumber: number }; focusId?: string }) {
  const { campaigns, loading, error } = useAdvisorRemediation(params);
  const focusRef = useRef<HTMLTableRowElement>(null);

  // Scroll to focused campaign
  useEffect(() => {
    if (focusId && focusRef.current) {
      focusRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusId, campaigns]);

  if (loading && !campaigns) return <LoadingCard message="Loading remediation campaigns..." />;
  if (error) return <ErrorCard message={error} />;

  const sorted = campaigns ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <PackageCheck className="h-4 w-4" />
          Remediation Campaign Advisor
        </CardTitle>
        <CardDescription>
          Active campaigns ranked by urgency — combines SLA proximity, failures, and completion probability
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4" />
            No active remediation campaigns
          </div>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <KpiCard
                label="Active Campaigns"
                value={String(sorted.length)}
              />
              <KpiCard
                label="With Failures"
                value={String(sorted.filter((c) => c.liveFailed > 0).length)}
                warn={sorted.some((c) => c.liveFailed > 0)}
              />
              <KpiCard
                label="At Risk"
                value={String(sorted.filter((c) => c.forecastStatus === "AT_RISK").length)}
                warn={sorted.some((c) => c.forecastStatus === "AT_RISK")}
              />
              <KpiCard
                label="Avg Urgency"
                value={
                  sorted.length > 0
                    ? Math.round(sorted.reduce((s, c) => s + c.urgencyScore, 0) / sorted.length).toString()
                    : "0"
                }
              />
            </div>

            <div className="max-h-[400px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Urgency</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Completion %</TableHead>
                    <TableHead>Failures</TableHead>
                    <TableHead>SLA Risk</TableHead>
                    <TableHead>Forecast</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((c) => (
                    <TableRow
                      key={c.campaignId}
                      ref={c.campaignId === focusId ? focusRef : undefined}
                      className={cn(c.campaignId === focusId && "ring-2 ring-primary/50 bg-primary/5")}
                    >
                      <TableCell>
                        <Badge variant={c.urgencyScore >= 50 ? "destructive" : "secondary"}>
                          {c.urgencyScore}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-sm font-medium">
                        {c.campaignName}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.actionType.replace(/_/g, " ")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{c.campaignStatus}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.liveCompleted}/{c.totalActions}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-16 rounded-full bg-muted">
                            <div
                              className={cn(
                                "h-2 rounded-full",
                                c.completionPct >= 80 ? "bg-emerald-500" : c.completionPct >= 50 ? "bg-amber-500" : "bg-red-500",
                              )}
                              style={{ width: `${Math.min(100, c.completionPct)}%` }}
                            />
                          </div>
                          <span className="text-xs">{c.completionPct}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {c.liveFailed > 0 ? (
                          <span className="text-sm text-destructive">{c.liveFailed}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell>{riskTierBadge(c.slaRiskTier)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            c.forecastStatus === "AT_RISK" ? "destructive" : "secondary"
                          }
                        >
                          {c.forecastStatus}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 4. Override Posture Tab
// ---------------------------------------------------------------------------

function OverridePostureTab({ params }: { params: { entityCode: string; fiscalYear: number; periodNumber: number } }) {
  const { posture, loading, error } = useAdvisorOverridePosture(params);

  if (loading && !posture) return <LoadingCard message="Loading override posture..." />;
  if (error) return <ErrorCard message={error} />;
  if (!posture) return <ErrorCard message="No override data available" />;

  const p = posture;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-4 w-4" />
          Override Risk Posture
        </CardTitle>
        <CardDescription>
          Current overrides vs historical baselines with suggested limits
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Assessment header */}
        <div className="flex items-center gap-3">
          {postureBadge(p.postureAssessment)}
          {p.aboveMaxLimit && (
            <span className="text-sm text-destructive">Above maximum limit</span>
          )}
          {p.aboveSuggestedLimit && !p.aboveMaxLimit && (
            <span className="text-sm text-amber-600">Above suggested limit</span>
          )}
          {p.spikeSeverity && (
            <Badge variant="destructive">Spike: {p.spikeSeverity}</Badge>
          )}
          {p.overrideSpikeZ != null && (
            <span className="text-xs text-muted-foreground">
              z-score: {p.overrideSpikeZ.toFixed(2)}
            </span>
          )}
        </div>

        {/* Current vs limits comparison */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <KpiCard
            label="Current Overrides"
            value={String(p.totalOverrides)}
            warn={p.aboveSuggestedLimit}
          />
          <KpiCard
            label="Suggested Limit (P75)"
            value={String(p.suggestedOverrideLimit)}
          />
          <KpiCard
            label="Max Limit (P90)"
            value={String(p.suggestedOverrideMax)}
          />
          <KpiCard
            label="Gate Overrides"
            value={String(p.gateOverrides)}
            warn={p.gateOverrides > 0}
          />
        </div>

        {/* Impact comparison */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <KpiCard
            label="Current Impact"
            value={p.overrideImpactTotal}
          />
          <KpiCard
            label="Suggested Impact Limit"
            value={p.suggestedImpactLimit}
          />
          <KpiCard
            label="Avg Historical"
            value={p.avgImpactHistorical}
            sub={`${p.historicalPeriodCount} periods`}
          />
          <KpiCard
            label="Pending Approval"
            value={String(p.pendingOverrides)}
            warn={p.pendingOverrides > 0}
          />
        </div>

        {/* Historical context */}
        <div className="rounded-md border px-4 py-3">
          <p className="mb-2 text-sm font-medium">Historical Override Distribution</p>
          <div className="flex flex-wrap gap-6 text-sm">
            <span>
              <span className="text-muted-foreground">Avg per period:</span>{" "}
              {p.avgOverridesHistorical}
            </span>
            <span>
              <span className="text-muted-foreground">P75:</span>{" "}
              {p.p75OverridesHistorical}
            </span>
            <span>
              <span className="text-muted-foreground">P90:</span>{" "}
              {p.p90OverridesHistorical}
            </span>
            <span>
              <span className="text-muted-foreground">Periods analyzed:</span>{" "}
              {p.historicalPeriodCount}
            </span>
          </div>
        </div>

        {/* Visual comparison bar */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Override count vs limits</p>
          <div className="relative h-6 w-full rounded-full bg-muted">
            {/* P90 marker */}
            <div
              className="absolute top-0 h-6 w-0.5 bg-red-400"
              style={{ left: `${Math.min(100, (p.suggestedOverrideMax / Math.max(p.totalOverrides, p.suggestedOverrideMax, 1)) * 100)}%` }}
              title={`P90: ${p.suggestedOverrideMax}`}
            />
            {/* P75 marker */}
            <div
              className="absolute top-0 h-6 w-0.5 bg-amber-400"
              style={{ left: `${Math.min(100, (p.suggestedOverrideLimit / Math.max(p.totalOverrides, p.suggestedOverrideMax, 1)) * 100)}%` }}
              title={`P75: ${p.suggestedOverrideLimit}`}
            />
            {/* Current bar */}
            <div
              className={cn(
                "h-6 rounded-full",
                p.aboveMaxLimit ? "bg-red-500" : p.aboveSuggestedLimit ? "bg-amber-500" : "bg-emerald-500",
              )}
              style={{ width: `${Math.min(100, (p.totalOverrides / Math.max(p.totalOverrides, p.suggestedOverrideMax, 1)) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0</span>
            <span>{Math.max(p.totalOverrides, p.suggestedOverrideMax)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 5. Entity Heatmap Tab
// ---------------------------------------------------------------------------

function EntityHeatmapTab({ params }: { params: { entityCode?: string } }) {
  const { entities, loading, error } = useAdvisorEntityHeatmap(params);

  if (loading && !entities) return <LoadingCard message="Loading entity heatmap..." />;
  if (error) return <ErrorCard message={error} />;

  const sorted = entities
    ? [...entities].sort((a, b) => b.compositeRiskScore - a.compositeRiskScore)
    : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Map className="h-4 w-4" />
          Entity Close Risk Heatmap
        </CardTitle>
        <CardDescription>
          Cross-entity risk grid with color tiers — RED/AMBER/GREEN based on composite risk
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4" />
            No active close runs
          </div>
        ) : (
          <>
            {/* Color summary */}
            <div className="mb-4 grid grid-cols-3 gap-2">
              <KpiCard
                label="RED (High Risk)"
                value={String(sorted.filter((e) => e.riskColor === "RED").length)}
                warn={sorted.some((e) => e.riskColor === "RED")}
              />
              <KpiCard
                label="AMBER (Watch)"
                value={String(sorted.filter((e) => e.riskColor === "AMBER").length)}
              />
              <KpiCard
                label="GREEN (On Track)"
                value={String(sorted.filter((e) => e.riskColor === "GREEN").length)}
              />
            </div>

            {/* Heatmap grid (card-style for each entity) */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sorted.map((e) => (
                <div
                  key={`${e.entityCode}-${e.fiscalYear}-${e.periodNumber}`}
                  className={cn(
                    "rounded-lg border p-3",
                    e.riskColor === "RED" && "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950",
                    e.riskColor === "AMBER" && "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950",
                    e.riskColor === "GREEN" && "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950",
                  )}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-semibold text-sm">{e.entityCode}</span>
                    <div className="flex items-center gap-1.5">
                      {riskColorBadge(e.riskColor)}
                      <span className="text-xs text-muted-foreground">#{e.riskRank}</span>
                    </div>
                  </div>
                  <div className="mb-2 text-xs text-muted-foreground">
                    FY{e.fiscalYear} P{e.periodNumber} · {e.closeType ?? "—"} · {e.slaStatus ?? "—"}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span>Risk Score: <b>{e.compositeRiskScore}</b></span>
                    <span>Breach: <b>{e.breachProbability}%</b></span>
                    <span>Completion: <b>{e.completionPct ?? 0}%</b></span>
                    <span>Days Left: <b>{e.daysRemaining ?? "—"}</b></span>
                    <span>Overrides: <b>{e.totalOverrides}</b></span>
                    <span>Signals: <b>{e.activeSignalCount}</b></span>
                    <span>Exceptions: <b>{e.openExceptions}</b></span>
                    <span>Doc Health: <b>{e.docHealthRating ?? "—"}</b></span>
                  </div>
                  {e.topBottleneckTask && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Top bottleneck: <span className="font-medium">{e.topBottleneckTask}</span>
                      {e.bottleneckPattern && (
                        <span className="ml-1">({e.bottleneckPattern})</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 6. Controller Alerts Tab
// ---------------------------------------------------------------------------

function ControllerAlertsTab({ params, focusId }: { params: { entityCode?: string }; focusId?: string }) {
  const { alerts, loading, error } = useAdvisorControllerAlerts(params);
  const focusRef = useRef<HTMLDivElement>(null);

  // Scroll to focused alert
  useEffect(() => {
    if (focusId && focusRef.current) {
      focusRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusId, alerts]);

  if (loading && !alerts) return <LoadingCard message="Loading controller alerts..." />;
  if (error) return <ErrorCard message={error} />;

  const sorted = alerts ?? [];
  const criticalCount = sorted.filter((a) => a.alertSeverity === "critical").length;
  const highCount = sorted.filter((a) => a.alertSeverity === "high").length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4" />
          Controller Assistant Alerts
          {criticalCount > 0 && (
            <Badge variant="destructive">{criticalCount} critical</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Unified inbox of critical risk signals, pending recommendations, and Atlas anomalies
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4" />
            No active alerts
          </div>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <KpiCard
                label="Total Alerts"
                value={String(sorted.length)}
              />
              <KpiCard
                label="Critical"
                value={String(criticalCount)}
                warn={criticalCount > 0}
              />
              <KpiCard
                label="High"
                value={String(highCount)}
                warn={highCount > 0}
              />
              <KpiCard
                label="Alert Types"
                value={String(new Set(sorted.map((a) => a.alertType)).size)}
              />
            </div>

            <div className="max-h-[400px] space-y-2 overflow-auto">
              {sorted.map((alert) => (
                <div
                  key={alert.alertId}
                  ref={alert.alertId === focusId ? focusRef : undefined}
                  className={cn(
                    "flex items-start gap-3 rounded-md border px-4 py-3",
                    alert.alertSeverity === "critical" && "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950",
                    alert.alertSeverity === "high" && "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950",
                    alert.alertId === focusId && "ring-2 ring-primary/50",
                  )}
                >
                  <div className="mt-0.5 shrink-0">
                    {alert.alertSeverity === "critical" ? (
                      <AlertTriangle className="size-4 text-red-600" />
                    ) : alert.alertSeverity === "high" ? (
                      <AlertTriangle className="size-4 text-amber-600" />
                    ) : (
                      <Bell className="size-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{alert.alertTitle}</span>
                      {alertTypeBadge(alert.alertType)}
                      {severityBadge(alert.alertSeverity)}
                      {alert.escalationLevel > 0 && (
                        <Badge variant="outline">Escalation L{alert.escalationLevel}</Badge>
                      )}
                    </div>
                    {alert.alertDetail && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        {alert.alertDetail}
                      </p>
                    )}
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{alert.entityCode}</span>
                      <span>FY{alert.fiscalYear} P{alert.periodNumber}</span>
                      <span>{fmtDate(alert.alertAt)}</span>
                      <Badge variant="outline" className="text-xs">{alert.alertState}</Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
