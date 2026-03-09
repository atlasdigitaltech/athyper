"use client";

// components/finance/admin/DocumentHealthPanel.tsx
//
// Phase 8C cockpit widget — Document Health Score, Posting Reconciliation,
// and Remediation Actions in the Close Command Center.
//
// 3 sections:
//   1. Health score gauge (0-100 with traffic light + penalty breakdown)
//   2. Posting reconciliation summary (finding counts by type)
//   3. Remediation action queue (suggested/approved/in-progress counts)

import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Loader2,
  RefreshCw,
  Shield,
  Wrench,
  XCircle,
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDocumentHealth } from "@/lib/finance/use-document-health";
import { useRemediationActions } from "@/lib/finance/use-document-health";
import type {
  DocumentHealthScoreDTO,
  HealthRating,
  PostingReconciliationSummaryDTO,
  RemediationSummaryDTO,
  RemediationActionDTO,
} from "@/lib/finance/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DocumentHealthPanelProps {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function DocumentHealthPanel({
  entityCode,
  fiscalYear,
  periodNumber,
}: DocumentHealthPanelProps) {
  const params = { entityCode, fiscalYear, periodNumber };

  const {
    healthScore,
    reconSummary,
    remediationSummary,
    loading: healthLoading,
    error: healthError,
    refresh: refreshHealth,
  } = useDocumentHealth(params);

  const {
    actions,
    loading: remLoading,
    approve,
    reject,
    refresh: refreshActions,
  } = useRemediationActions(params);

  const loading = healthLoading || remLoading;
  const error = healthError;

  const refresh = () => {
    refreshHealth();
    refreshActions();
  };

  if (loading && !healthScore) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Computing document health…
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8 text-destructive">
          <AlertCircle className="mr-2 h-4 w-4" />
          {error}
        </CardContent>
      </Card>
    );
  }

  if (!healthScore) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-violet-600" />
            Document Health
            <HealthBadge rating={healthScore.healthRating} score={healthScore.healthScore} />
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <CardDescription>
          Composite health score across {healthScore.totalDocuments} document{healthScore.totalDocuments !== 1 ? "s" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 1. Health Score Gauge */}
        <HealthScoreGauge score={healthScore} />

        {/* 2. Reconciliation Summary */}
        {reconSummary && reconSummary.totalFindings > 0 && (
          <ReconciliationSummarySection summary={reconSummary} />
        )}

        {/* 3. Remediation Queue */}
        {remediationSummary && remediationSummary.totalActions > 0 && (
          <RemediationQueueSection
            summary={remediationSummary}
            actions={actions}
            onApprove={approve}
            onReject={reject}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Health Badge
// ---------------------------------------------------------------------------

const RATING_CONFIG: Record<HealthRating, { color: string; bg: string; label: string }> = {
  GREEN: { color: "text-emerald-700", bg: "bg-emerald-600", label: "Healthy" },
  AMBER: { color: "text-amber-700", bg: "bg-amber-500", label: "At Risk" },
  RED: { color: "text-red-700", bg: "bg-red-600", label: "Critical" },
  NOT_APPLICABLE: { color: "text-gray-500", bg: "bg-gray-400", label: "N/A" },
};

function HealthBadge({ rating, score }: { rating: HealthRating; score: number }) {
  const cfg = RATING_CONFIG[rating];
  return (
    <Badge variant="default" className={`ml-1 ${cfg.bg}`}>
      {score}/100 — {cfg.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// 1. Health Score Gauge
// ---------------------------------------------------------------------------

function HealthScoreGauge({ score }: { score: DocumentHealthScoreDTO }) {
  const cfg = RATING_CONFIG[score.healthRating];

  const penalties = [
    { label: "Readiness", value: score.readinessPenalty, max: 40 },
    { label: "Severity", value: score.severityPenalty, max: 25 },
    { label: "Aging", value: score.agingPenalty, max: 15 },
    { label: "Reconciliation", value: score.reconPenalty, max: 10 },
    { label: "Approval", value: score.approvalPenalty, max: 10 },
  ];

  return (
    <div className="space-y-2">
      {/* Score bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="flex h-4 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={`${cfg.bg} transition-all duration-500`}
              style={{ width: `${score.healthScore}%` }}
            />
          </div>
        </div>
        <span className={`text-lg font-bold ${cfg.color}`}>{score.healthScore}</span>
      </div>

      {/* Penalty breakdown */}
      <div className="flex flex-wrap gap-2">
        {penalties
          .filter((p) => p.value > 0)
          .map((p) => (
            <Tooltip key={p.label}>
              <TooltipTrigger>
                <div className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
                  <span className="text-muted-foreground">{p.label}:</span>
                  <span className="font-medium text-red-600">-{p.value}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {p.label} penalty: -{p.value} of max {p.max} points
              </TooltipContent>
            </Tooltip>
          ))}
        {penalties.every((p) => p.value === 0) && (
          <div className="flex items-center gap-1 text-xs text-emerald-600">
            <CheckCircle2 className="h-3 w-3" />
            No penalties — perfect health
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Reconciliation Summary
// ---------------------------------------------------------------------------

function ReconciliationSummarySection({ summary }: { summary: PostingReconciliationSummaryDTO }) {
  const items = [
    { label: "POSTED without JE", count: summary.postedNoJeCount, severity: "high" as const },
    { label: "JE reversed, doc still active", count: summary.jeReversedDocNotCount, severity: "high" as const },
    { label: "Amount mismatches", count: summary.amountMismatchCount, severity: "medium" as const },
    { label: "Incomplete multi-book", count: summary.incompleteMultibookCount, severity: "medium" as const },
  ].filter((i) => i.count > 0);

  const severityColor = {
    high: "text-red-600",
    medium: "text-amber-600",
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Shield className="h-3.5 w-3.5 text-violet-600" />
        <p className="text-xs font-medium text-muted-foreground">
          Posting Reconciliation
        </p>
        <Badge variant="outline" className="ml-auto text-[10px]">
          {summary.totalFindings} finding{summary.totalFindings !== 1 ? "s" : ""}
        </Badge>
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-xs">
            <AlertTriangle className={`h-3 w-3 flex-shrink-0 ${severityColor[item.severity]}`} />
            <span className="text-muted-foreground">{item.label}</span>
            <Badge variant="outline" className={`ml-auto text-[10px] ${severityColor[item.severity]}`}>
              {item.count}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Remediation Queue
// ---------------------------------------------------------------------------

function RemediationQueueSection({
  summary,
  actions,
  onApprove,
  onReject,
}: {
  summary: RemediationSummaryDTO;
  actions: RemediationActionDTO[] | null;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
}) {
  const pendingActions = useMemo(
    () => (actions ?? []).filter((a) => a.status === "SUGGESTED").slice(0, 5),
    [actions],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Wrench className="h-3.5 w-3.5 text-indigo-600" />
        <p className="text-xs font-medium text-muted-foreground">
          Remediation Actions
        </p>
      </div>

      {/* Status summary chips */}
      <div className="flex flex-wrap gap-1.5">
        {summary.suggestedCount > 0 && (
          <Badge variant="outline" className="text-[10px] text-amber-600">
            {summary.suggestedCount} awaiting review
          </Badge>
        )}
        {summary.approvedCount > 0 && (
          <Badge variant="outline" className="text-[10px] text-blue-600">
            {summary.approvedCount} approved
          </Badge>
        )}
        {summary.executingCount > 0 && (
          <Badge variant="outline" className="text-[10px] text-violet-600">
            {summary.executingCount} executing
          </Badge>
        )}
        {summary.completedCount > 0 && (
          <Badge variant="outline" className="text-[10px] text-emerald-600">
            {summary.completedCount} completed
          </Badge>
        )}
        {summary.failedCount > 0 && (
          <Badge variant="destructive" className="text-[10px]">
            {summary.failedCount} failed
          </Badge>
        )}
      </div>

      {/* Top pending actions for quick approval */}
      {pendingActions.length > 0 && (
        <div className="space-y-1">
          {pendingActions.map((action) => (
            <div
              key={action.id}
              className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs"
            >
              <div className="min-w-0 flex-1">
                <span className="font-medium">{formatActionType(action.actionType)}</span>
                {action.docNo && (
                  <span className="ml-1 text-muted-foreground">· {action.docNo}</span>
                )}
              </div>
              <PriorityDot priority={action.priority} />
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-emerald-600 hover:text-emerald-700"
                onClick={() => onApprove(action.id)}
              >
                <CheckCircle2 className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-red-500 hover:text-red-600"
                onClick={() => onReject(action.id, "Rejected from cockpit")}
              >
                <XCircle className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function PriorityDot({ priority }: { priority: string }) {
  const color = {
    CRITICAL: "bg-red-500",
    HIGH: "bg-orange-500",
    MEDIUM: "bg-amber-400",
    LOW: "bg-gray-300",
  }[priority] ?? "bg-gray-300";

  return (
    <Tooltip>
      <TooltipTrigger>
        <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      </TooltipTrigger>
      <TooltipContent>{priority}</TooltipContent>
    </Tooltip>
  );
}

function formatActionType(type: string): string {
  return type
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
