"use client";

// components/finance/AtlasInsightsPanel.tsx
//
// Atlas Intelligence Insights panel — surfaces dashboard summary,
// CFO brief, narrative provenance, anomaly summary, predictions,
// and recommended actions from the Atlas dashboard API.
//
// Designed to embed in ReleaseDetail, CloseOrchestrationDashboard,
// or any page that provides entityCode + fiscalYear + periodNumber.

import { useState } from "react";
import {
  Badge,
  Card,
} from "@neon/ui";
import {
  Brain,
  AlertTriangle,
  CheckCircle2,
  Shield,
  Clock,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Loader2,
  ArrowRight,
  Info,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  AtlasDashboardData,
  AtlasRecommendation,
} from "@/lib/finance/use-atlas-dashboard";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AtlasInsightsPanelProps {
  data: AtlasDashboardData | null;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  /** Compact mode: only show summary + top recommendations */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Priority / risk styling
// ---------------------------------------------------------------------------

const RISK_BADGE: Record<string, { color: string; label: string }> = {
  HIGH: { color: "bg-red-100 text-red-700", label: "High Risk" },
  MEDIUM: { color: "bg-amber-100 text-amber-700", label: "Medium Risk" },
  LOW: { color: "bg-blue-100 text-blue-700", label: "Low Risk" },
  NONE: { color: "bg-emerald-100 text-emerald-700", label: "Healthy" },
};

const PRIORITY_BADGE: Record<string, { color: string; icon: typeof AlertTriangle }> = {
  CRITICAL: { color: "bg-red-100 text-red-700", icon: AlertTriangle },
  HIGH: { color: "bg-amber-100 text-amber-700", icon: AlertTriangle },
  MEDIUM: { color: "bg-blue-100 text-blue-700", icon: Info },
  LOW: { color: "bg-gray-100 text-gray-500", icon: Info },
};

const TYPE_LABEL: Record<string, string> = {
  ANOMALY_RESPONSE: "Anomaly",
  RELEASE_GATE: "Gate Blocker",
  RECON_FOLLOWUP: "Reconciliation",
  CLOSE_DURATION: "Close Timeline",
  RISK_MITIGATION: "Risk",
};

const ROLE_LABEL: Record<string, string> = {
  CONTROLLER: "Controller",
  ACCOUNTANT: "Accountant",
  CLOSE_MANAGER: "Close Manager",
  CFO: "CFO",
  RECONCILIATION_ANALYST: "Recon Analyst",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AtlasInsightsPanel({
  data,
  loading,
  error,
  onRefresh,
  compact = false,
}: AtlasInsightsPanelProps) {
  const [expandedCfo, setExpandedCfo] = useState(false);
  const [expandedRecs, setExpandedRecs] = useState(!compact);

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading Atlas insights...
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4" />
          {error}
          {onRefresh && (
            <button onClick={onRefresh} className="ml-auto text-xs underline">Retry</button>
          )}
        </div>
      </Card>
    );
  }

  if (!data) return null;

  const risk = RISK_BADGE[data.riskScore] ?? RISK_BADGE.NONE;
  const criticalRecs = data.recommendations.items.filter(r => r.priority === "CRITICAL");
  const otherRecs = data.recommendations.items.filter(r => r.priority !== "CRITICAL");
  const displayRecs = compact ? data.recommendations.items.slice(0, 3) : data.recommendations.items;

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-indigo-600" />
          <span className="text-sm font-semibold">Atlas Insights</span>
          <Badge className={cn("text-xs", risk.color)}>{risk.label}</Badge>
          {data.narratives.provenance && (
            <span className="text-[10px] text-muted-foreground">
              {data.narratives.provenance.deterministic ? "deterministic" : "llm-polished"}
              {" · "}
              {data.narratives.provenance.completeness}
            </span>
          )}
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="rounded p-1 text-muted-foreground hover:bg-accent"
            title="Refresh insights"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Composite Risk Score */}
      {data.compositeRisk && (
        <div className="border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className={cn(
                "text-2xl font-bold tabular-nums",
                data.compositeRisk.score >= 70 ? "text-red-600" :
                data.compositeRisk.score >= 40 ? "text-amber-600" :
                data.compositeRisk.score > 0 ? "text-blue-600" : "text-emerald-600",
              )}>
                {data.compositeRisk.score}
              </span>
              <div>
                <p className="text-xs font-medium">Atlas Risk Score</p>
                <p className="text-[10px] text-muted-foreground">of {data.compositeRisk.maxPossible}</p>
              </div>
            </div>
            {!compact && data.compositeRisk.drivers.length > 0 && (
              <div className="ml-4 flex-1 space-y-0.5">
                {data.compositeRisk.drivers.slice(0, 3).map((d, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="font-medium tabular-nums text-foreground">{d.points}pt</span>
                    <span>{d.count} {d.label.toLowerCase()}</span>
                  </div>
                ))}
                {data.compositeRisk.drivers.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{data.compositeRisk.drivers.length - 3} more drivers
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dashboard Summary */}
      <div className="border-b px-4 py-3">
        <p className="text-sm leading-relaxed text-foreground">
          {data.narratives.dashboardSummary}
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-px border-b bg-border sm:grid-cols-4">
        <KpiCell
          icon={<AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
          label="Active Anomalies"
          value={data.summary.activeCount}
          detail={data.summary.criticalCount > 0 ? `${data.summary.criticalCount} critical` : undefined}
        />
        <KpiCell
          icon={<TrendingUp className="h-3.5 w-3.5 text-blue-500" />}
          label="Release Readiness"
          value={data.predictions.releaseReadiness
            ? `${Math.round(data.predictions.releaseReadiness.probability * 100)}%`
            : "—"}
        />
        <KpiCell
          icon={<Clock className="h-3.5 w-3.5 text-amber-500" />}
          label="Expected Close"
          value={data.predictions.closeDuration
            ? `${data.predictions.closeDuration.expectedCloseDays}d`
            : "—"}
          detail={data.predictions.closeDuration
            ? `${data.predictions.closeDuration.confidencePercent}% conf`
            : undefined}
        />
        <KpiCell
          icon={<Shield className="h-3.5 w-3.5 text-purple-500" />}
          label="Risk Signals"
          value={data.atlasSignals.length}
        />
      </div>

      {/* Recommended Actions */}
      {displayRecs.length > 0 && (
        <div className="border-b">
          <button
            className="flex w-full items-center justify-between px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent/50"
            onClick={() => setExpandedRecs(!expandedRecs)}
          >
            <span>
              Recommended Actions ({data.recommendations.items.length})
              {criticalRecs.length > 0 && (
                <Badge className="ml-1.5 bg-red-100 text-red-700 text-[10px]">
                  {criticalRecs.length} critical
                </Badge>
              )}
              {data.recommendations.provenance && (
                <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                  {data.recommendations.provenance.deterministic ? "deterministic" : "adaptive"}
                  {" · "}
                  {data.recommendations.provenance.evidenceCount} evidence items
                  {" · engine v"}
                  {data.recommendations.provenance.generatorVersion}
                </span>
              )}
            </span>
            {expandedRecs ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {expandedRecs && (
            <div className="space-y-0 divide-y">
              {displayRecs.map((rec) => (
                <RecommendationRow key={rec.key} rec={rec} />
              ))}
              {compact && data.recommendations.items.length > 3 && (
                <div className="px-4 py-2 text-center text-xs text-muted-foreground">
                  +{data.recommendations.items.length - 3} more recommendations
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CFO Brief (expandable) */}
      {!compact && (
        <div>
          <button
            className="flex w-full items-center justify-between px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent/50"
            onClick={() => setExpandedCfo(!expandedCfo)}
          >
            <span>CFO Brief</span>
            {expandedCfo ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {expandedCfo && (
            <div className="px-4 pb-3">
              <pre className="whitespace-pre-wrap text-sm leading-relaxed text-foreground font-sans">
                {data.narratives.cfoBrief}
              </pre>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Generated {new Date(data.narratives.generatedAt).toLocaleString()}
                {" · "}provider: {data.narratives.provider}
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCell({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  detail?: string;
}) {
  return (
    <div className="bg-background px-4 py-2.5">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="text-lg font-semibold tabular-nums">{value}</span>
        {detail && <span className="text-[10px] text-muted-foreground">{detail}</span>}
      </div>
    </div>
  );
}

function RecommendationRow({ rec }: { rec: AtlasRecommendation }) {
  const [expanded, setExpanded] = useState(false);
  const pConfig = PRIORITY_BADGE[rec.priority] ?? PRIORITY_BADGE.LOW;
  const PIcon = pConfig.icon;

  return (
    <div className="px-4 py-2.5">
      <button
        className="flex w-full items-start gap-2 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <PIcon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", rec.priority === "CRITICAL" ? "text-red-500" : rec.priority === "HIGH" ? "text-amber-500" : "text-blue-500")} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium leading-tight">{rec.title}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <Badge className={cn("text-[10px]", pConfig.color)}>{rec.priority}</Badge>
            <span className="text-[10px] text-muted-foreground">{TYPE_LABEL[rec.type] ?? rec.type}</span>
            <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">{ROLE_LABEL[rec.suggestedOwnerRole] ?? rec.suggestedOwnerRole}</span>
          </div>
        </div>
        {expanded ? <ChevronUp className="mt-1 h-3 w-3 text-muted-foreground" /> : <ChevronDown className="mt-1 h-3 w-3 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="ml-5.5 mt-2 space-y-1.5 pl-1 text-xs">
          <p className="text-muted-foreground">{rec.rationale}</p>
          {rec.estimatedImpact && (
            <p className="font-medium text-foreground">
              Impact: {rec.estimatedImpact}
            </p>
          )}
          {rec.linkedEvidence.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {rec.linkedEvidence.map((e, i) => (
                <Badge key={i} variant="outline" className="text-[10px]">
                  {e.label}
                  {e.detail && <span className="ml-1 text-muted-foreground">({e.detail})</span>}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
