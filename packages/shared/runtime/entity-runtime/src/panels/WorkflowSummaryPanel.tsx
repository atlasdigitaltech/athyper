"use client";

import { useQuery } from "@tanstack/react-query";
import { GitBranch, Loader2, Circle, CheckCircle2, XCircle, User, Clock } from "lucide-react";
import { Skeleton } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import { resolveSemanticColors, type SemanticIntent } from "@athyper/theme/semantic-colors";
import { fmtDateTime } from "@athyper/runtime-shared/core";

// ── API shapes ────────────────────────────────────────────────────────────────

type SlaStatus = "on_track" | "at_risk" | "breached" | "completed_ok" | "completed_late";

interface ApiWorkflowStage {
  id: string;
  stage_no: number;
  name: string;
  mode: "serial" | "parallel";
  status: "pending" | "active" | "completed" | "skipped" | "canceled";
  outcome: string | null;
  started_at: string | null;
  completed_at: string | null;
  sla_code: string | null;
  sla_name: string | null;
  sla_target_hours: number | undefined;
  sla_deadline: string | null;
  time_elapsed_hours: number | undefined;
  sla_status: SlaStatus | undefined;
}

interface ApiWorkflowRequest {
  id: string;
  workflow_type: string;
  status: "pending" | "approved" | "rejected" | "escalated" | "canceled";
  decision: string | null;
  reason: string | null;
  requested_by: string;
  requested_at: string;
  metadata: Record<string, unknown>;
  stages: ApiWorkflowStage[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtElapsed(hours: number | undefined): string | undefined {
  if (hours === undefined) return undefined;
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
  }
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function requestIntent(status: string): SemanticIntent {
  if (status === "approved")  return "success";
  if (status === "rejected")  return "error";
  if (status === "escalated") return "error";
  if (status === "canceled")  return "neutral";
  return "warning"; // pending
}

function stageIntent(status: string): SemanticIntent {
  if (status === "completed") return "success";
  if (status === "active")    return "primary";
  if (status === "canceled")  return "neutral";
  if (status === "skipped")   return "neutral";
  return "neutral"; // pending
}

const SLA_INTENT: Record<SlaStatus, SemanticIntent> = {
  on_track:       "success",
  at_risk:        "warning",
  breached:       "error",
  completed_ok:   "success",
  completed_late: "error",
};

const SLA_LABEL: Record<SlaStatus, string> = {
  on_track:       "On track",
  at_risk:        "At risk",
  breached:       "Breached",
  completed_ok:   "Met",
  completed_late: "Late",
};

// ── Stage icon ────────────────────────────────────────────────────────────────

function StageIcon({ status }: { status: string }) {
  if (status === "active")    return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  if (status === "completed") return <CheckCircle2 className="h-4 w-4 text-success" />;
  if (status === "canceled")  return <XCircle className="h-4 w-4 text-muted-foreground" />;
  return <Circle className="h-4 w-4 text-muted-foreground/50" />;
}

// ── SLA badge ─────────────────────────────────────────────────────────────────

function SlaBadge({ status, targetHours }: { status: SlaStatus; targetHours?: number }) {
  const { subtleBadge } = resolveSemanticColors(SLA_INTENT[status]);
  const label = SLA_LABEL[status];
  const target = targetHours !== undefined ? ` · ${targetHours}h SLA` : "";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded border px-2 py-0.5 text-doc-support font-semibold leading-none", subtleBadge)}>
      <Clock className="h-2.5 w-2.5" />
      {label}{target}
    </span>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
      <GitBranch className="h-8 w-8 text-muted-foreground/30" />
      <p className="text-sm font-medium text-muted-foreground">No active workflow for this record</p>
    </div>
  );
}

// ── Stage card ────────────────────────────────────────────────────────────────

function StageCard({ stage, isLast }: { stage: ApiWorkflowStage; isLast: boolean }) {
  const intent = stageIntent(stage.status);
  const { subtleBadge, dot } = resolveSemanticColors(intent);
  const elapsedLabel = fmtElapsed(stage.time_elapsed_hours);
  const deadlineStr  = fmtDateTime(stage.sla_deadline);

  return (
    <div className="flex gap-3">
      {/* Rail */}
      <div className="flex flex-col items-center">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background shadow-sm">
          <StageIcon status={stage.status} />
        </div>
        {!isLast && <div className={cn("mt-1 w-0.5 flex-1 min-h-8", dot)} />}
      </div>

      {/* Card */}
      <div className={cn("flex-1 rounded-lg border bg-card px-4 py-3", !isLast && "mb-3")}>
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{stage.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground capitalize">
              Stage {stage.stage_no} · {stage.mode} mode
              {stage.started_at && <> · Started {fmtDateTime(stage.started_at)}</>}
              {stage.completed_at && <> · Completed {fmtDateTime(stage.completed_at)}</>}
            </p>
          </div>
          <span className={cn("shrink-0 rounded-full border px-2.5 py-0.5 text-doc-subtitle font-semibold capitalize", subtleBadge)}>
            {stage.status}
          </span>
        </div>

        {/* SLA row */}
        {(stage.sla_status || elapsedLabel || deadlineStr) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t pt-2">
            {elapsedLabel && (
              <span className="flex items-center gap-1 text-doc-subtitle text-muted-foreground">
                <Clock className="h-3 w-3" />
                {stage.status === "active" ? "Elapsed: " : "Took: "}
                <span className="font-medium tabular-nums">{elapsedLabel}</span>
              </span>
            )}
            {stage.sla_status && (
              <SlaBadge status={stage.sla_status} targetHours={stage.sla_target_hours} />
            )}
            {deadlineStr && stage.status === "active" && (
              <span className="text-doc-subtitle text-muted-foreground">
                Due: <span className="font-medium">{deadlineStr}</span>
              </span>
            )}
          </div>
        )}

        {/* Outcome chip */}
        {stage.outcome && (
          <div className={cn(
            "mt-2 rounded border px-2.5 py-1 text-xs font-medium capitalize",
            resolveSemanticColors(stage.outcome === "approved" ? "success" : "error").subtleBadge,
          )}>
            Outcome: {stage.outcome}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export interface WorkflowSummaryPanelProps {
  entityCode: string;
  recordId: string;
}

export function WorkflowSummaryPanel({ entityCode, recordId }: WorkflowSummaryPanelProps) {
  const { data, isLoading } = useQuery<{ data: ApiWorkflowRequest[] }>({
    queryKey: ["record-workflow", entityCode, recordId],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/workflow`,
        { signal },
      );
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: ApiWorkflowRequest[] }>;
    },
    staleTime: 30 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <Skeleton className="h-24 flex-1 rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  const requests = data?.data ?? [];
  if (requests.length === 0) return <EmptyState />;

  const req    = requests[0]!;
  const intent = requestIntent(req.status);
  const { subtleBadge } = resolveSemanticColors(intent);

  return (
    <div className="space-y-5">
      {/* Envelope header */}
      <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold capitalize">{req.workflow_type} Workflow</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="h-3 w-3" />
            <span>Submitted {fmtDateTime(req.requested_at)}</span>
          </div>
        </div>
        <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold capitalize", subtleBadge)}>
          {req.status}
        </span>
      </div>

      {/* Stage timeline */}
      {req.stages.length > 0 ? (
        <div>
          {req.stages.map((stage, idx) => (
            <StageCard key={stage.id} stage={stage} isLast={idx === req.stages.length - 1} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No stages found for this workflow.</p>
      )}

      {/* Rejection reason */}
      {req.reason && (
        <div className={cn("rounded-lg border px-4 py-3 text-sm", resolveSemanticColors("error").subtleBadge)}>
          <span className="font-medium">Rejection reason: </span>{req.reason}
        </div>
      )}

      {req.status === "pending" && (
        <p className="text-center text-xs text-muted-foreground">
          See the <strong>Approvals</strong> tab for individual approver status.
        </p>
      )}
    </div>
  );
}
