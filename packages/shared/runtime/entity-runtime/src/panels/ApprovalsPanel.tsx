"use client";

import { useQuery } from "@tanstack/react-query";
import { Fragment } from "react";
import { CheckCircle2, Clock, Circle, XCircle, ShieldCheck } from "lucide-react";
import { Skeleton } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import { resolveSemanticColors, type SemanticIntent } from "@athyper/theme/semantic-colors";

// ── API shape ─────────────────────────────────────────────────────────────────

interface ApiWorkItem {
  id: string;
  workflow_request_id: string;
  workflow_stage_id: string | null;
  assignee_id: string | null;
  order_index: number;
  status: "pending" | "assigned" | "in_progress" | "completed" | "skipped" | "escalated";
  decision: "approve" | "reject" | "escalate" | null;
  reason: string | null;
  assigned_at: string | null;
  completed_at: string | null;
  due_at: string | null;
  assignee_display_name: string | null;
  metadata: Record<string, unknown>;
}

// ── Intent resolver ───────────────────────────────────────────────────────────

function itemIntent(item: ApiWorkItem): SemanticIntent {
  if (item.decision === "approve") return "success";
  if (item.decision === "reject" || item.decision === "escalate") return "error";
  if (item.status === "completed") return "success";
  if (item.status === "escalated") return "error";
  if (item.status === "assigned" || item.status === "in_progress") return "warning";
  return "neutral"; // pending / queued
}

function itemLabel(item: ApiWorkItem): string {
  if (item.decision === "approve") return "Approved";
  if (item.decision === "reject")  return "Rejected";
  if (item.decision === "escalate") return "Escalated";
  if (item.status === "completed")  return "Approved";
  if (item.status === "assigned" || item.status === "in_progress") return "Awaiting";
  if (item.status === "skipped")    return "Skipped";
  return "Queued";
}

function overallIntent(items: ApiWorkItem[]): SemanticIntent {
  if (items.some((i) => i.decision === "reject"))  return "error";
  if (items.every((i) => i.decision === "approve" || i.status === "completed")) return "success";
  if (items.some((i) => i.status === "assigned" || i.status === "in_progress")) return "warning";
  return "neutral";
}

function overallLabel(items: ApiWorkItem[]): string {
  if (items.some((i) => i.decision === "reject"))  return "Rejected";
  if (items.every((i) => i.decision === "approve" || i.status === "completed")) return "Approved";
  return "Pending";
}

// ── Step icon ─────────────────────────────────────────────────────────────────

function StepIcon({ intent, cls }: { intent: SemanticIntent; cls?: string }) {
  const base = cn("h-3.5 w-3.5 shrink-0", cls);
  if (intent === "success") return <CheckCircle2 className={base} />;
  if (intent === "error")   return <XCircle      className={base} />;
  if (intent === "warning") return <Clock        className={base} />;
  return <Circle className={base} />;
}

// ── Endpoint node (Submitted / final status) ──────────────────────────────────

function EndpointNode({ label, intent }: { label: string; intent: SemanticIntent }) {
  const { subtleBadge } = resolveSemanticColors(intent);
  return (
    <div className={cn(
      "shrink-0 rounded border px-3 py-1.5 text-xs font-semibold",
      subtleBadge,
    )}>
      {label}
    </div>
  );
}

// ── Approver card ─────────────────────────────────────────────────────────────

function ApproverCard({ item }: { item: ApiWorkItem }) {
  const intent    = itemIntent(item);
  const label     = itemLabel(item);
  const colors    = resolveSemanticColors(intent);
  const name      = item.assignee_display_name ?? `Approver ${item.order_index}`;
  const isManual  = item.metadata?.["added_manually"] === true;

  return (
    <div className="shrink-0 w-44 overflow-hidden rounded-lg border bg-card shadow-sm">
      {/* Status header */}
      <div className={cn("px-3 py-1.5 text-center text-xs font-semibold", colors.badge)}>
        {label}
      </div>

      {/* Approver row */}
      <div className="flex items-center gap-1.5 px-3 py-2.5">
        <StepIcon intent={intent} cls={colors.text} />
        <span className={cn(
          "truncate text-sm font-medium leading-tight",
          intent === "neutral" && "text-muted-foreground",
        )}>
          {name}
        </span>
        {isManual && (
          <span className="ml-auto shrink-0 rounded bg-muted px-1 py-0.5 text-doc-field-label font-medium text-muted-foreground">
            +
          </span>
        )}
      </div>

      {/* Completed date */}
      {item.completed_at && (
        <div className="border-t px-3 pb-2 pt-1 text-doc-support text-muted-foreground">
          {new Date(item.completed_at).toLocaleDateString("en-GB", {
            day: "2-digit", month: "short",
          })}
        </div>
      )}
    </div>
  );
}

// ── Connector line ────────────────────────────────────────────────────────────

function Connector({ filled }: { filled?: boolean }) {
  return (
    <div className="shrink-0 flex-1 min-w-6 relative h-px">
      <div className={cn("absolute inset-0", filled ? "bg-success/40" : "bg-border")} />
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
      <ShieldCheck className="h-8 w-8 text-muted-foreground/30" />
      <p className="text-sm font-medium text-muted-foreground">No approval workflow active</p>
      <p className="text-xs text-muted-foreground/60">Submit this record to start the approval process.</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export interface ApprovalsPanelProps {
  entityCode: string;
  recordId: string;
}

export function ApprovalsPanel({ entityCode, recordId }: ApprovalsPanelProps) {
  const { data, isLoading } = useQuery<{ data: ApiWorkItem[] }>({
    queryKey: ["record-approvals", entityCode, recordId],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/approvals`,
        { signal },
      );
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: ApiWorkItem[] }>;
    },
    staleTime: 30 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 overflow-x-auto py-4">
        <Skeleton className="h-8 w-20 shrink-0 rounded" />
        {[...Array(3)].map((_, i) => (
          <Fragment key={i}>
            <Skeleton className="h-px flex-1" />
            <Skeleton className="h-16 w-44 shrink-0 rounded-lg" />
          </Fragment>
        ))}
        <Skeleton className="h-px flex-1" />
        <Skeleton className="h-8 w-20 shrink-0 rounded" />
      </div>
    );
  }

  const items = (data?.data ?? []).sort((a, b) => a.order_index - b.order_index);
  if (items.length === 0) return <EmptyState />;

  const finalIntent = overallIntent(items);
  const finalLabel  = overallLabel(items);

  // Track how far "done" the chain is to colour connectors after approved steps
  let lastDoneIdx = -1;
  items.forEach((item, idx) => {
    if (item.decision === "approve" || (item.status === "completed" && item.decision !== "reject")) {
      lastDoneIdx = idx;
    }
  });

  return (
    <div className="space-y-6">
      {/* Horizontal stepper — scrollable on small screens */}
      <div className="flex items-center overflow-x-auto py-2 gap-0">
        {/* Start node */}
        <EndpointNode label="Submitted" intent="neutral" />

        {items.map((item, idx) => (
          <Fragment key={item.id}>
            <Connector filled={idx <= lastDoneIdx} />
            <ApproverCard item={item} />
          </Fragment>
        ))}

        {/* Trailing connector → final node */}
        <Connector filled={lastDoneIdx === items.length - 1} />
        <EndpointNode label={finalLabel} intent={finalIntent} />
      </div>

      {/* Rejection reason (if any) */}
      {items.some((i) => i.decision === "reject" && i.reason) && (
        <div className={cn(
          "rounded-lg border px-4 py-3 text-sm",
          resolveSemanticColors("error").subtleBadge,
        )}>
          {items.find((i) => i.decision === "reject")!.reason}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3">
        {(["success", "warning", "neutral"] as SemanticIntent[]).map((intent) => {
          const { dot, text } = resolveSemanticColors(intent);
          const lbl = intent === "success" ? "Approved" : intent === "warning" ? "Awaiting" : "Queued";
          return (
            <div key={intent} className="flex items-center gap-1.5">
              <div className={cn("h-2 w-2 rounded-full", dot)} />
              <span className={cn("text-xs", text)}>{lbl}</span>
            </div>
          );
        })}
        <div className="flex items-center gap-1.5">
          <div className={cn("h-2 w-2 rounded-full", resolveSemanticColors("error").dot)} />
          <span className={cn("text-xs", resolveSemanticColors("error").text)}>Rejected</span>
        </div>
      </div>
    </div>
  );
}
