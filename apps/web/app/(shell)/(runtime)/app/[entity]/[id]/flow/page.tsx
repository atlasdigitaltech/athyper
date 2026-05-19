"use client";

/**
 * Runtime entity workflow flow — /app/[entity]/[id]/flow
 *
 * Approval workflow state for any entity type.
 * Generalised from document flow — uses `entity` and `id` params.
 *
 * [id] = canonical business key (NOT UUID).
 *
 * Examples:
 *   /app/purchase_invoice/INV-10045/flow
 *   /app/purchase_order/PO-2045/flow
 *   /app/journal_entry/JE-10045/flow
 */

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, CheckCircle2, Clock, Send, ThumbsDown, ThumbsUp, XCircle,
} from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { Badge, Button, Skeleton, Textarea } from "@athyper/ui/primitives";
import type { ApprovalContext, WorkflowStageDetail, WorkItem } from "@athyper/api-contracts/workflow";
import { useState } from "react";
import { bffFetch } from "@/lib/bff-fetch";
import { formatTitle } from "@/lib/format";
import { useSubrouteGuard, GuardSkeleton, FeatureUnavailablePage } from "@/lib/use-subroute-guard";
import { canonicalEntityCode } from "../../../_lib/entity-aliases";

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function requestStatusVariant(status: string) {
  switch (status) {
    case "approved":  return "success";
    case "rejected":  return "destructive";
    case "pending":   return "info";
    case "cancelled": return "muted";
    default:          return "secondary";
  }
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

interface WorkflowRequestSummary {
  id: string;
  status: string;
  workflow_type: string;
  submitted_at: string;
}

function useEntityWorkflowRequest(entityCode: string, entityId: string) {
  return useQuery<WorkflowRequestSummary | null>({
    queryKey: ["workflow-request", entityCode, entityId],
    queryFn: async () => {
      const params = new URLSearchParams({ entity_type: entityCode, entity_id: entityId });
      const res = await fetch(`/api/relay/workflow/requests?${params}`);
      if (!res.ok) return null;
      const body = await res.json() as { data?: WorkflowRequestSummary[] };
      const active = (body.data ?? []).find((r) =>
        r.status === "pending" || r.status === "approved" || r.status === "rejected",
      );
      return active ?? (body.data?.[0] ?? null);
    },
    staleTime: 15 * 1000,
  });
}

function useApprovalContext(requestId: string | null) {
  return useQuery<ApprovalContext>({
    queryKey: ["approval-context", requestId],
    queryFn: async () => {
      if (!requestId) throw new Error("No request ID");
      return bffFetch<ApprovalContext>(`/api/relay/workflow/requests/${encodeURIComponent(requestId)}/context`);
    },
    enabled: !!requestId,
    staleTime: 15 * 1000,
  });
}

function useSubmitForApproval(entityCode: string, entityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workflowType: string) =>
      bffFetch("/api/relay/workflow/requests", {
        method: "POST",
        body: { entity_type: entityCode, entity_id: entityId, workflow_type: workflowType },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflow-request", entityCode, entityId] });
    },
  });
}

function useWorkItemAction(requestId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workItemId, action, remarks }: {
      workItemId: string;
      action: "approve" | "reject";
      remarks?: string;
    }) =>
      bffFetch(`/api/relay/workflow/work-items/${encodeURIComponent(workItemId)}/action`, {
        method: "POST",
        body: { action, remarks },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approval-context", requestId] });
      queryClient.invalidateQueries({ queryKey: ["workflow-request"] });
    },
  });
}

// ── Work item row ─────────────────────────────────────────────────────────────

function WorkItemRow({ item }: { item: WorkItem }) {
  const statusColor: Record<string, string> = {
    approved:  "text-success",
    rejected:  "text-destructive",
    pending:   "text-warning",
    delegated: "text-primary",
    timed_out: "text-muted-foreground",
  };
  const StatusIcon = item.status === "approved"
    ? CheckCircle2 : item.status === "rejected"
    ? XCircle : Clock;

  return (
    <div className="flex items-center gap-2 text-sm">
      <StatusIcon className={`h-4 w-4 shrink-0 ${statusColor[item.status] ?? "text-muted-foreground"}`} />
      <span className="flex-1 capitalize text-muted-foreground">{item.assignee_type}</span>
      <Badge variant="outline" className="capitalize text-doc-support">{item.status}</Badge>
      {item.decision_at && (
        <span className="text-xs text-muted-foreground">{fmtDate(item.decision_at)}</span>
      )}
    </div>
  );
}

// ── Stage card ────────────────────────────────────────────────────────────────

function StageCard({ stage, isCurrent }: { stage: WorkflowStageDetail; isCurrent: boolean }) {
  const stageStatusColor: Record<string, string> = {
    active:    "border-primary/60 bg-primary/5",
    completed: "border-success/30 bg-success/5",
    rejected:  "border-destructive/30 bg-destructive/5",
    pending:   "border-border bg-background",
    skipped:   "border-border/40 bg-muted/20 opacity-60",
  };
  const qp = stage.quorum_progress;

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${stageStatusColor[stage.status] ?? ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums font-mono text-muted-foreground w-5">{stage.stage_order}</span>
          <span className="font-medium text-sm">{stage.stage_name}</span>
          <Badge variant="outline" className="capitalize text-doc-support">{stage.stage_mode.toLowerCase()}</Badge>
        </div>
        <div className="flex items-center gap-1.5">
          {isCurrent && <Badge variant="info" className="text-doc-support">Current</Badge>}
          <Badge
            variant={stage.status === "completed" ? "success" : stage.status === "rejected" ? "destructive" : "secondary"}
            className="capitalize text-doc-support"
          >
            {stage.status}
          </Badge>
        </div>
      </div>
      {qp && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="text-success font-medium">✓ {qp.approved_count} approved</span>
          {qp.rejected_count > 0 && <span className="text-destructive font-medium">✗ {qp.rejected_count} rejected</span>}
          <span>{qp.pending_count} pending</span>
          <span className="ml-auto">Quorum: {qp.is_met ? <span className="text-success">Met</span> : <span className="text-warning">Not met</span>}</span>
        </div>
      )}
      {stage.work_items.length > 0 && (
        <div className="space-y-1.5 border-t pt-3">
          {stage.work_items.map((item) => <WorkItemRow key={item.id} item={item} />)}
        </div>
      )}
    </div>
  );
}

// ── Action panel ──────────────────────────────────────────────────────────────

function ActionPanel({ context, requestId }: { context: ApprovalContext; requestId: string }) {
  const [remarks, setRemarks] = useState("");
  const [actionInFlight, setActionInFlight] = useState<"approve" | "reject" | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const mutation = useWorkItemAction(requestId);
  const currentStage = context.stages[context.current_stage_index ?? -1];
  const pendingItem  = currentStage?.work_items.find((i) => i.status === "pending");

  if (context.workflow_request.status !== "pending" || !pendingItem) return null;

  async function submit(action: "approve" | "reject") {
    if (!pendingItem) return;
    setActionInFlight(action);
    setSubmitError(null);
    try {
      await mutation.mutateAsync({ workItemId: pendingItem.id, action, remarks: remarks || undefined });
      setRemarks("");
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Action failed. Please try again.");
    } finally {
      setActionInFlight(null);
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <p className="text-sm font-medium">Your decision</p>
      <Textarea
        placeholder="Optional remarks…"
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
        rows={2}
        className="text-sm"
      />
      <div className="flex gap-2">
        <Button
          variant="outline" size="sm"
          className="gap-1.5 border-success/30 text-success hover:bg-success/10"
          onClick={() => submit("approve")}
          loading={actionInFlight === "approve"}
          disabled={!!actionInFlight}
        >
          <ThumbsUp className="h-3.5 w-3.5" /> Approve
        </Button>
        <Button
          variant="outline" size="sm"
          className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
          onClick={() => submit("reject")}
          loading={actionInFlight === "reject"}
          disabled={!!actionInFlight}
        >
          <ThumbsDown className="h-3.5 w-3.5" /> Reject
        </Button>
      </div>
      {submitError && (
        <p className="text-xs text-destructive">{submitError}</p>
      )}
    </div>
  );
}

// ── Submit panel ──────────────────────────────────────────────────────────────

function SubmitPanel({ entityCode, entityId }: { entityCode: string; entityId: string }) {
  const mutation = useSubmitForApproval(entityCode, entityId);
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <Send className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm font-medium">No active approval workflow</p>
      <p className="mt-1 text-xs text-muted-foreground">Submit this record to start the approval process.</p>
      <Button className="mt-4" size="sm" onClick={() => mutation.mutate("standard")} loading={mutation.isPending}>
        <Send className="mr-1.5 h-3.5 w-3.5" /> Submit for Approval
      </Button>
      {mutation.isError && (
        <p className="mt-2 text-xs text-destructive">
          {mutation.error instanceof Error ? mutation.error.message : "Submission failed"}
        </p>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AppEntityFlowPage() {
  const params = useParams();
  const router = useRouter();

  const entity = params["entity"] as string;
  const entityCode = canonicalEntityCode(entity);
  const id     = params["id"]     as string;

  const { data: request, isLoading: requestLoading } = useEntityWorkflowRequest(entityCode, id);
  const { data: context, isLoading: contextLoading } = useApprovalContext(request?.id ?? null);
  const isLoading = requestLoading || (!!request && contextLoading);

  // Guard — all hooks above; safe to return early from here
  const { guardLoading, denied } = useSubrouteGuard(entityCode, "hasFlow");
  if (guardLoading) return <GuardSkeleton />;
  if (denied) return <FeatureUnavailablePage entityCode={entityCode} entityId={id} />;

  return (
    <PageFrame
      title="Approval Flow"
      description={`${formatTitle(entity)} — workflow state`}
      width="narrow"
      actions={
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
        </Button>
      }
    >
      <div className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : !request ? (
          <SubmitPanel entityCode={entityCode} entityId={id} />
        ) : (
          <>
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Workflow type</p>
                  <p className="font-medium">{request.workflow_type}</p>
                </div>
                <Badge variant={requestStatusVariant(request.status)} className="capitalize">{request.status}</Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Submitted {fmtDate(request.submitted_at)}</p>
            </div>
            {context && (
              <div className="space-y-2">
                {context.stages.map((stage, idx) => (
                  <StageCard key={stage.id} stage={stage} isCurrent={context.current_stage_index === idx} />
                ))}
              </div>
            )}
            {context && <ActionPanel context={context} requestId={request.id} />}
          </>
        )}
      </div>
    </PageFrame>
  );
}
