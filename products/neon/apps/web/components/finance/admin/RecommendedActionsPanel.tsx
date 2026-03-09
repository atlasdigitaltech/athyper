"use client";

// components/finance/admin/RecommendedActionsPanel.tsx
//
// Displays recommended close actions with accept/dismiss controls.
// Integrates into CloseOrchestrationDashboard.

import {
  AlertTriangle,
  Check,
  ChevronRight,
  Lightbulb,
  Play,
  RefreshCw,
  Shield,
  X,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { CloseRecommendationDTO } from "@/lib/finance/use-close-recommendations";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RecommendedActionsPanelProps {
  recommendations: CloseRecommendationDTO[];
  loading?: boolean;
  onAccept: (actionId: string) => Promise<void>;
  onDismiss: (actionId: string, reason?: string) => Promise<void>;
  onRefresh: () => void;
}

// ---------------------------------------------------------------------------
// Action type display config
// ---------------------------------------------------------------------------

const ACTION_TYPE_CONFIG: Record<string, { icon: typeof Lightbulb; label: string; color: string }> = {
  notify_owner: { icon: AlertTriangle, label: "Notify Owner", color: "text-amber-600" },
  notify_escalation: { icon: Shield, label: "Escalate", color: "text-red-600" },
  start_ready_tasks: { icon: Play, label: "Start Ready Tasks", color: "text-blue-600" },
  rerun_handler: { icon: RefreshCw, label: "Rerun Handler", color: "text-purple-600" },
  refresh_snapshot: { icon: RefreshCw, label: "Refresh Snapshot", color: "text-gray-600" },
  reevaluate_signals: { icon: Shield, label: "Re-evaluate Signals", color: "text-orange-600" },
  escalate_signal: { icon: Shield, label: "Force Escalate", color: "text-red-600" },
  recommend_parallel: { icon: Zap, label: "Parallelize", color: "text-blue-600" },
  recommend_reassignment: { icon: ChevronRight, label: "Reassign", color: "text-indigo-600" },
  recommend_waiver: { icon: Check, label: "Suggest Waiver", color: "text-emerald-600" },
  publish_readiness: { icon: Lightbulb, label: "Publish Summary", color: "text-gray-600" },
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "border-red-200 bg-red-50",
  high: "border-orange-200 bg-orange-50",
  medium: "border-yellow-100 bg-yellow-50",
  low: "border-gray-200 bg-gray-50",
  info: "border-blue-100 bg-blue-50",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecommendedActionsPanel({
  recommendations,
  loading,
  onAccept,
  onDismiss,
  onRefresh,
}: RecommendedActionsPanelProps) {
  const proposed = recommendations.filter((r) => r.status === "proposed");
  const accepted = recommendations.filter((r) => r.status === "accepted");
  const executed = recommendations.filter((r) => r.status === "executed");

  if (recommendations.length === 0 && !loading) {
    return null; // Don't show panel if no recommendations
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              Recommended Actions
              {proposed.length > 0 && (
                <Badge variant="default" className="ml-1">{proposed.length} new</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Policy-driven recommendations for the current close
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {proposed.map((rec) => (
            <RecommendationCard
              key={rec.id}
              recommendation={rec}
              onAccept={onAccept}
              onDismiss={onDismiss}
            />
          ))}

          {accepted.length > 0 && (
            <div className="pt-2">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                Accepted ({accepted.length})
              </p>
              {accepted.map((rec) => (
                <CompactActionRow key={rec.id} recommendation={rec} status="accepted" />
              ))}
            </div>
          )}

          {executed.length > 0 && (
            <div className="pt-2">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                Executed ({executed.length})
              </p>
              {executed.slice(0, 5).map((rec) => (
                <CompactActionRow key={rec.id} recommendation={rec} status="executed" />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Recommendation Card (proposed — with action buttons)
// ---------------------------------------------------------------------------

function RecommendationCard({
  recommendation: rec,
  onAccept,
  onDismiss,
}: {
  recommendation: CloseRecommendationDTO;
  onAccept: (id: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
}) {
  const config = ACTION_TYPE_CONFIG[rec.action_type] ?? {
    icon: Lightbulb,
    label: rec.action_type,
    color: "text-gray-600",
  };
  const Icon = config.icon;
  const severity = rec.severity ?? "medium";
  const borderStyle = SEVERITY_STYLES[severity] ?? "";

  return (
    <div className={`rounded-lg border p-3 ${borderStyle}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${config.color}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium">{config.label}</span>
              <Badge variant="outline" className="text-[10px]">
                {rec.trigger_type?.replace(/_/g, " ")}
              </Badge>
            </div>
            {rec.rationale && (
              <p className="text-xs text-muted-foreground mt-0.5">{rec.rationale}</p>
            )}
            {!rec.rationale && rec.trigger_context && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatTriggerContext(rec.trigger_context)}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
            onClick={() => onAccept(rec.id)}
          >
            <Check className="h-3 w-3 mr-1" />
            Accept
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-red-600 hover:bg-red-50"
            onClick={() => onDismiss(rec.id)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact row (accepted / executed)
// ---------------------------------------------------------------------------

function CompactActionRow({
  recommendation: rec,
  status,
}: {
  recommendation: CloseRecommendationDTO;
  status: "accepted" | "executed";
}) {
  const config = ACTION_TYPE_CONFIG[rec.action_type] ?? {
    icon: Lightbulb,
    label: rec.action_type,
    color: "text-gray-400",
  };
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
      <Icon className="h-3 w-3 flex-shrink-0" />
      <span className="truncate">{config.label}</span>
      <Badge
        variant={status === "executed" ? "default" : "secondary"}
        className="text-[10px] ml-auto"
      >
        {status}
      </Badge>
      {rec.was_effective !== null && (
        <Badge
          variant={rec.was_effective ? "default" : "destructive"}
          className="text-[10px]"
        >
          {rec.was_effective ? "effective" : "ineffective"}
        </Badge>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTriggerContext(ctx: Record<string, unknown>): string {
  const parts: string[] = [];

  if (ctx.failedTaskCodes && Array.isArray(ctx.failedTaskCodes)) {
    parts.push(`Failed: ${(ctx.failedTaskCodes as string[]).join(", ")}`);
  }
  if (ctx.blockedTaskCodes && Array.isArray(ctx.blockedTaskCodes)) {
    parts.push(`Blocked: ${(ctx.blockedTaskCodes as string[]).join(", ")}`);
  }
  if (ctx.atRiskTaskCodes && Array.isArray(ctx.atRiskTaskCodes)) {
    parts.push(`SLA at risk: ${(ctx.atRiskTaskCodes as string[]).join(", ")}`);
  }
  if (ctx.criticalCount != null) {
    parts.push(`${ctx.criticalCount} critical, ${ctx.highCount ?? 0} high signal(s)`);
  }

  return parts.length > 0 ? parts.join(" | ") : JSON.stringify(ctx).slice(0, 120);
}
