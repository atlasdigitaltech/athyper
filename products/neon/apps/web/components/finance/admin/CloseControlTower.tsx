"use client";

// components/finance/admin/CloseControlTower.tsx
//
// Phase 9A: Close Control Tower — unified executive/controller view.
// Tabbed shell combining: Overview (executive summary + KPI strip),
// Orchestration (existing close graph), SLA Performance, Override Posture,
// Document Health + Remediation, and CFO Workspace.

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Activity,
  Award,
  BarChart3,
  Bot,
  Brain,
  Clock,
  FileCheck,
  Gauge,
  LayoutDashboard,
  MessageSquare,
  Loader2,
  RefreshCw,
  Shield,
  ShieldAlert,
  Target,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { EntityPeriodSelector } from "./EntityPeriodSelector";
import { SlaPerformancePanel } from "./SlaPerformancePanel";
import { OverridePosturePanel } from "./OverridePosturePanel";
import { CloseDocumentReadinessPanel } from "./CloseDocumentReadinessPanel";
import { DocumentHealthPanel } from "./DocumentHealthPanel";
import { RemediationControlPanel } from "./RemediationControlPanel";
import { CFOWorkspaceDashboard } from "./CFOWorkspaceDashboard";
import { CloseCertificationPack } from "./CloseCertificationPack";
import { PredictiveCloseDashboard } from "./PredictiveCloseDashboard";
import { AutonomousCloseAdvisor } from "./AutonomousCloseAdvisor";
import { CloseCopilot } from "./CloseCopilot";

import {
  useCloseExecutiveSummary,
  useOverridePosture,
  useSlaPerformanceTrend,
} from "@/lib/finance/use-close-control-tower";

import { buildNarrativeBrief } from "@/lib/finance/copilot-narrative-builder";
import { downloadSingleNarrative } from "@/lib/finance/export-narrative-pack";

import type { CopilotContext } from "@/lib/finance/copilot-answer-builder";
import type {
  CloseExecutiveSummaryDTO,
  CopilotDrillAction,
  CopilotDrillTarget,
  NarrativeAudience,
  SlaStatusDTO,
  HealthRatingDTO,
} from "@/lib/finance/types";

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "sla", label: "SLA Performance", icon: Clock },
  { id: "overrides", label: "Override Posture", icon: ShieldAlert },
  { id: "documents", label: "Document Health", icon: FileCheck },
  { id: "remediation", label: "Remediation", icon: Shield },
  { id: "predictive", label: "Predictive Intelligence", icon: Brain },
  { id: "advisor", label: "Close Advisor", icon: Bot },
  { id: "certification", label: "Certification Pack", icon: Award },
  { id: "copilot", label: "Copilot", icon: MessageSquare },
  { id: "executive", label: "CFO Workspace", icon: BarChart3 },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CloseControlTowerProps {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  entities?: string[];
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function CloseControlTower({
  entityCode: initialEntity,
  fiscalYear: initialYear,
  periodNumber: initialPeriod,
  entities,
}: CloseControlTowerProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [entityCode, setEntityCode] = useState(initialEntity);
  const [fiscalYear, setFiscalYear] = useState(initialYear);
  const [periodNumber, setPeriodNumber] = useState(initialPeriod);

  // Drill-through navigation state from Copilot
  const [drillSubTab, setDrillSubTab] = useState<string | undefined>();
  const [drillFocusId, setDrillFocusId] = useState<string | undefined>();
  const [drillAction, setDrillAction] = useState<CopilotDrillAction | undefined>();

  const params = useMemo(
    () => ({ entityCode, fiscalYear, periodNumber }),
    [entityCode, fiscalYear, periodNumber],
  );

  const {
    summary,
    loading: summaryLoading,
    error: summaryError,
    refresh: refreshSummary,
  } = useCloseExecutiveSummary(params);

  const handleDrillNavigate = useCallback((target: CopilotDrillTarget) => {
    // Handle narrative export action — generate and download inline
    if (target.action?.type === "trigger_narrative_export") {
      const narrativeCtx: CopilotContext = {
        entityCode,
        fiscalYear,
        periodNumber,
        role: "CONTROLLER",
        executiveSummary: summary,
      };
      const brief = buildNarrativeBrief(target.action.audience, narrativeCtx);
      downloadSingleNarrative(brief);
      return;
    }

    // Validate tab ID exists
    const validTab = TABS.find((t) => t.id === target.tab);
    if (!validTab) return;

    // Update entity if target specifies a different one
    if (target.entityCode && target.entityCode !== entityCode) {
      setEntityCode(target.entityCode);
    }

    // Set sub-tab, focusId, and action before switching tab so children read fresh values
    setDrillSubTab(target.subTab);
    setDrillFocusId(target.focusId);
    setDrillAction(target.action);
    setActiveTab(validTab.id);
  }, [entityCode, fiscalYear, periodNumber, summary]);

  // Listen for copilot:drill events from campaign suggestion cards
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as CopilotDrillTarget;
      if (detail) handleDrillNavigate(detail);
    };
    window.addEventListener("copilot:drill", handler);
    return () => window.removeEventListener("copilot:drill", handler);
  }, [handleDrillNavigate]);

  const {
    overrides,
    summary: overrideSummary,
    loading: overrideLoading,
    error: overrideError,
    refresh: refreshOverrides,
  } = useOverridePosture(params);

  const {
    periods: slaTrend,
    loading: trendLoading,
    refresh: refreshTrend,
  } = useSlaPerformanceTrend({ entityCode });

  const refreshAll = useCallback(() => {
    refreshSummary();
    refreshOverrides();
    refreshTrend();
  }, [refreshSummary, refreshOverrides, refreshTrend]);

  return (
    <div className="flex h-full flex-col">
      {/* Header bar: selector + refresh */}
      <div className="border-b bg-background/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold">Close Control Tower</h1>
            <EntityPeriodSelector
              entityCode={entityCode}
              fiscalYear={fiscalYear}
              periodNumber={periodNumber}
              onEntityChange={setEntityCode}
              onFiscalYearChange={setFiscalYear}
              onPeriodChange={setPeriodNumber}
              entities={entities}
            />
          </div>
          <div className="flex items-center gap-2">
            {summary && <RunStatusBadge status={summary.runStatus} />}
            <Button size="sm" variant="ghost" onClick={refreshAll}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 overflow-x-auto px-4 py-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setDrillSubTab(undefined);
                  setDrillFocusId(undefined);
                  setDrillAction(undefined);
                }}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {tab.label}
                {tab.id === "overrides" && overrideSummary && overrideSummary.activeOverrides > 0 && (
                  <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-medium text-white">
                    {overrideSummary.activeOverrides}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === "overview" && (
          <OverviewTab
            summary={summary}
            loading={summaryLoading}
            error={summaryError}
            overrideSummary={overrideSummary}
          />
        )}
        {activeTab === "sla" && (
          <SlaPerformancePanel
            summary={summary}
            trend={slaTrend}
            trendLoading={trendLoading}
          />
        )}
        {activeTab === "overrides" && (
          <OverridePosturePanel
            overrides={overrides}
            summary={overrideSummary}
            loading={overrideLoading}
            error={overrideError}
          />
        )}
        {activeTab === "documents" && (
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
        )}
        {activeTab === "remediation" && (
          <RemediationControlPanel
            entityCode={entityCode}
            fiscalYear={fiscalYear}
            periodNumber={periodNumber}
            drillAction={drillAction}
          />
        )}
        {activeTab === "predictive" && (
          <PredictiveCloseDashboard
            entityCode={entityCode}
            fiscalYear={fiscalYear}
            periodNumber={periodNumber}
            initialSubTab={drillSubTab}
            focusId={drillFocusId}
          />
        )}
        {activeTab === "advisor" && (
          <AutonomousCloseAdvisor
            entityCode={entityCode}
            fiscalYear={fiscalYear}
            periodNumber={periodNumber}
            initialSubTab={drillSubTab}
            focusId={drillFocusId}
            drillAction={drillAction}
          />
        )}
        {activeTab === "certification" && (
          <CloseCertificationPack
            entityCode={entityCode}
            fiscalYear={fiscalYear}
            periodNumber={periodNumber}
            initialSubTab={drillSubTab}
            focusId={drillFocusId}
            drillAction={drillAction}
          />
        )}
        {activeTab === "copilot" && (
          <CloseCopilot
            entityCode={entityCode}
            fiscalYear={fiscalYear}
            periodNumber={periodNumber}
            onDrillNavigate={handleDrillNavigate}
          />
        )}
        {activeTab === "executive" && (
          <CFOWorkspaceDashboard
            entityCode={entityCode}
            fiscalYear={fiscalYear}
            periodNumber={periodNumber}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview Tab — executive KPI strip
// ---------------------------------------------------------------------------

function OverviewTab({
  summary,
  loading,
  error,
  overrideSummary,
}: {
  summary: CloseExecutiveSummaryDTO | null;
  loading: boolean;
  error: string | null;
  overrideSummary: import("@/lib/finance/types").OverridePostureSummaryDTO | null;
}) {
  if (loading && !summary) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading executive summary…
      </div>
    );
  }

  if (error) {
    return <div className="py-8 text-center text-sm text-destructive">{error}</div>;
  }

  if (!summary) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No close run found for this period.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Strip — 6 cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Readiness */}
        <KPICard
          label="Readiness"
          value={summary.readinessScore != null ? `${summary.readinessScore}%` : "—"}
          icon={<Gauge className="h-4 w-4" />}
          color={
            summary.readinessScore != null
              ? summary.readinessScore >= 80 ? "text-green-600" : summary.readinessScore >= 50 ? "text-yellow-600" : "text-red-600"
              : undefined
          }
        />
        {/* SLA */}
        <KPICard
          label="SLA Status"
          value={summary.slaStatus ?? "N/A"}
          icon={<Clock className="h-4 w-4" />}
          badge={<SlaStatusBadge status={summary.slaStatus} />}
        />
        {/* Task Completion */}
        <KPICard
          label="Tasks"
          value={summary.completionPct != null ? `${summary.completionPct}%` : "—"}
          icon={<Target className="h-4 w-4" />}
          sub={summary.totalTasks != null ? `${summary.completedCount ?? 0}/${summary.totalTasks}` : undefined}
        />
        {/* Document Health */}
        <KPICard
          label="Doc Health"
          value={summary.docHealthScore != null ? `${summary.docHealthScore}` : "—"}
          icon={<FileCheck className="h-4 w-4" />}
          badge={summary.docHealthRating ? <HealthBadge rating={summary.docHealthRating} /> : undefined}
        />
        {/* Overrides */}
        <KPICard
          label="Overrides"
          value={String(summary.totalOverrides)}
          icon={<ShieldAlert className="h-4 w-4" />}
          warn={summary.pendingOverrides > 0}
          sub={summary.pendingOverrides > 0 ? `${summary.pendingOverrides} pending` : undefined}
        />
        {/* Exceptions */}
        <KPICard
          label="Exceptions"
          value={String(summary.openExceptions)}
          icon={<Activity className="h-4 w-4" />}
          warn={summary.criticalExceptions > 0}
          sub={summary.criticalExceptions > 0 ? `${summary.criticalExceptions} critical` : undefined}
        />
      </div>

      {/* Secondary info strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <InfoCard label="Run Status" value={summary.runStatus} />
        <InfoCard label="Close Type" value={summary.closeType ?? "—"} />
        <InfoCard
          label="Remediation"
          value={`${summary.remediationCompleted}/${summary.remediationTotal} done`}
          warn={summary.remediationFailed > 0}
          sub={summary.remediationFailed > 0 ? `${summary.remediationFailed} failed` : undefined}
        />
        <InfoCard
          label="Days Remaining"
          value={summary.daysRemaining != null ? `${summary.daysRemaining}d` : "—"}
          warn={summary.daysRemaining != null && summary.daysRemaining <= 1}
        />
      </div>

      {/* Close timeline bar */}
      {summary.softCloseTarget && summary.hardCloseTarget && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Close Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-xs">
              <TimelinePoint label="Start" date={summary.closeStartDate} done />
              <TimelineLine
                progress={summary.completionPct ?? 0}
                warn={summary.slaStatus === "AT_RISK" || summary.slaStatus === "BREACHED"}
              />
              <TimelinePoint
                label="Soft Close"
                date={summary.softCloseTarget}
                done={summary.softClosedAt != null}
                warn={!summary.softClosedAt && summary.slaStatus !== "ON_TRACK"}
              />
              <TimelineLine
                progress={
                  summary.softClosedAt
                    ? summary.hardClosedAt ? 100 : 50
                    : 0
                }
                warn={summary.slaStatus === "BREACHED"}
              />
              <TimelinePoint
                label="Hard Close"
                date={summary.hardCloseTarget}
                done={summary.hardClosedAt != null}
                warn={summary.slaStatus === "BREACHED"}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function KPICard({
  label,
  value,
  icon,
  badge,
  color,
  warn,
  sub,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  color?: string;
  warn?: boolean;
  sub?: string;
}) {
  return (
    <Card className={warn ? "border-orange-300 dark:border-orange-800" : ""}>
      <CardContent className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="mt-1">
          {badge ?? <span className={`text-lg font-semibold ${color ?? ""}`}>{value}</span>}
        </div>
        {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function InfoCard({
  label,
  value,
  warn,
  sub,
}: {
  label: string;
  value: string;
  warn?: boolean;
  sub?: string;
}) {
  return (
    <div className={`rounded border p-2 ${warn ? "border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30" : ""}`}>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
      {sub && <div className="text-[10px] text-orange-600">{sub}</div>}
    </div>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    OPEN: "bg-blue-100 text-blue-700",
    IN_PROGRESS: "bg-yellow-100 text-yellow-700",
    SOFT_CLOSED: "bg-green-100 text-green-700",
    HARD_CLOSED: "bg-emerald-100 text-emerald-800",
    REOPENED: "bg-orange-100 text-orange-700",
  };
  return (
    <Badge className={`text-[10px] ${colors[status] ?? ""}`}>
      {status.replace("_", " ")}
    </Badge>
  );
}

function SlaStatusBadge({ status }: { status: SlaStatusDTO | null }) {
  if (!status) return null;
  const colors: Record<string, string> = {
    ON_TRACK: "bg-green-100 text-green-700",
    MET: "bg-green-100 text-green-700",
    AT_RISK: "bg-yellow-100 text-yellow-700",
    BREACHED: "bg-red-100 text-red-700",
  };
  return (
    <span className={`rounded px-2 py-0.5 text-sm font-semibold ${colors[status] ?? ""}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function HealthBadge({ rating }: { rating: HealthRatingDTO }) {
  const colors: Record<string, string> = {
    GREEN: "bg-green-100 text-green-700",
    AMBER: "bg-yellow-100 text-yellow-700",
    RED: "bg-red-100 text-red-700",
    NOT_APPLICABLE: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`rounded px-2 py-0.5 text-sm font-semibold ${colors[rating] ?? ""}`}>
      {rating}
    </span>
  );
}

function TimelinePoint({
  label,
  date,
  done,
  warn,
}: {
  label: string;
  date: string | null;
  done?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          "h-3 w-3 rounded-full border-2",
          done ? "border-green-500 bg-green-500" : warn ? "border-orange-500 bg-orange-100" : "border-gray-300 bg-white",
        )}
      />
      <div className="mt-1 text-[10px] font-medium">{label}</div>
      {date && <div className="text-[9px] text-muted-foreground">{formatShortDate(date)}</div>}
    </div>
  );
}

function TimelineLine({ progress, warn }: { progress: number; warn?: boolean }) {
  return (
    <div className="relative h-0.5 flex-1 bg-gray-200">
      <div
        className={cn(
          "absolute inset-y-0 left-0",
          warn ? "bg-orange-400" : "bg-green-400",
        )}
        style={{ width: `${Math.min(progress, 100)}%` }}
      />
    </div>
  );
}

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  } catch {
    return iso;
  }
}
