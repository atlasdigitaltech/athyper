"use client";

/**
 * DAG Run Inspector — /setup/jobs/orchestrations
 *
 * Lists orchestration runs with status/DAG filter.
 * Clicking a run expands a vertical node timeline with status, duration,
 * error details, and retry/cancel controls.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2, XCircle, Clock, SkipForward, Loader2,
  ChevronDown, ChevronRight, RefreshCw, Ban, RotateCcw,
  GitBranch,
} from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState } from "@athyper/ui/composites";
import {
  Button, Badge, Card, CardContent, CardHeader, CardTitle, Skeleton,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Input, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@athyper/ui/primitives";
import { JobsSubNav } from "../_components/jobs-sub-nav";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrchRun {
  id:              string;
  dag_id:          string;
  trigger_type:    string;
  trigger_ref:     string | null;
  status:          "running" | "completed" | "failed" | "canceled";
  total_nodes:     number;
  completed_nodes: number;
  failed_nodes:    number;
  skipped_nodes:   number;
  started_at:      string;
  completed_at:    string | null;
  correlation_id:  string | null;
}

interface OrchNode {
  id:           string;
  node_code:    string;
  node_type:    string;
  depends_on:   string[];
  status:       "pending" | "running" | "completed" | "failed" | "skipped" | "canceled";
  job_id:       string | null;
  error:        string | null;
  retry_count:  number;
  started_at:   string | null;
  completed_at: string | null;
  duration_ms:  number | null;
}

interface RunDetail {
  run:   OrchRun;
  nodes: OrchNode[];
}

interface RunsResponse {
  items: OrchRun[];
  total: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDuration(ms: number | null): string {
  if (ms == null || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function runDurationMs(run: OrchRun): number | null {
  if (!run.started_at) return null;
  const end = run.completed_at ? new Date(run.completed_at) : new Date();
  return end.getTime() - new Date(run.started_at).getTime();
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

const STATUS_BADGE: Record<string, "success" | "destructive" | "warning" | "secondary" | "outline"> = {
  completed: "success",
  failed:    "destructive",
  running:   "warning",
  canceled:  "secondary",
  pending:   "outline",
  skipped:   "secondary",
};

const NODE_STATUS_ICON: Record<string, React.ReactNode> = {
  completed: <CheckCircle2 className="h-4 w-4 text-success" />,
  failed:    <XCircle      className="h-4 w-4 text-destructive" />,
  running:   <Loader2      className="h-4 w-4 animate-spin text-primary" />,
  pending:   <Clock        className="h-4 w-4 text-muted-foreground" />,
  skipped:   <SkipForward  className="h-4 w-4 text-muted-foreground" />,
  canceled:  <Ban          className="h-4 w-4 text-muted-foreground" />,
};

// ── Cancel dialog ─────────────────────────────────────────────────────────────

function CancelDialog({
  runId, open, onOpenChange, onConfirm,
}: { runId: string; open: boolean; onOpenChange: (v: boolean) => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Cancel run?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          All pending and running nodes in run <span className="font-mono">{shortId(runId)}</span> will
          be marked as canceled. In-flight BullMQ jobs will complete but won't trigger the next step.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={() => { onConfirm(); onOpenChange(false); }}>
            Cancel Run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Node timeline ─────────────────────────────────────────────────────────────

function NodeTimeline({ runId, nodes, runStatus }: { runId: string; nodes: OrchNode[]; runStatus: string }) {
  const qc = useQueryClient();

  const retryNode = useMutation({
    mutationFn: async (nodeCode: string) => {
      const res = await fetch(`/api/jobs/admin/orchestrations/${runId}/nodes/${encodeURIComponent(nodeCode)}/retry`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? "Failed to retry node");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orch-run-detail", runId] });
      qc.invalidateQueries({ queryKey: ["orch-runs"] });
    },
  });

  if (nodes.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No nodes found for this run.</p>;
  }

  return (
    <div className="relative ml-2 space-y-0">
      {/* Vertical line */}
      <div className="absolute left-[7px] top-0 bottom-0 w-px bg-border" />

      {nodes.map((node, idx) => {
        const elapsed = node.started_at && node.completed_at
          ? new Date(node.completed_at).getTime() - new Date(node.started_at).getTime()
          : node.started_at
          ? Date.now() - new Date(node.started_at).getTime()
          : null;

        return (
          <div key={node.id} className="relative flex gap-3 pb-4">
            {/* Dot */}
            <div className="relative z-10 mt-0.5 flex-shrink-0">
              {NODE_STATUS_ICON[node.status] ?? <Clock className="h-4 w-4 text-muted-foreground" />}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-sm font-medium">{node.node_code}</p>
                  <p className="text-[11px] text-muted-foreground font-mono">{node.node_type}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant={STATUS_BADGE[node.status] ?? "outline"} className="text-[10px]">
                    {node.status}
                  </Badge>
                  {node.retry_count > 0 && (
                    <Badge variant="outline" className="text-[10px]">
                      retry ×{node.retry_count}
                    </Badge>
                  )}
                  {node.status === "failed" && (runStatus === "failed" || runStatus === "running") && (
                    <Button
                      size="sm" variant="ghost" className="h-6 text-[10px]"
                      disabled={retryNode.isPending}
                      onClick={() => retryNode.mutate(node.node_code)}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Retry
                    </Button>
                  )}
                </div>
              </div>

              {/* Timing */}
              <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                {node.started_at && (
                  <span>Started: {new Date(node.started_at).toLocaleTimeString()}</span>
                )}
                {elapsed != null && (
                  <span>Duration: {fmtDuration(elapsed)}</span>
                )}
                {node.job_id && (
                  <span className="font-mono">job: {node.job_id.slice(0, 20)}</span>
                )}
                {node.depends_on.length > 0 && (
                  <span>after: {node.depends_on.join(", ")}</span>
                )}
              </div>

              {/* Error */}
              {node.error && (
                <div className="mt-1.5 rounded bg-destructive/5 border border-destructive/20 px-2 py-1.5">
                  <p className="text-[11px] text-destructive font-mono whitespace-pre-wrap break-all line-clamp-4">
                    {node.error}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Run row ───────────────────────────────────────────────────────────────────

function RunRow({ run }: { run: OrchRun }) {
  const [expanded, setExpanded] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const qc = useQueryClient();

  const { data: detail, isLoading: detailLoading } = useQuery<RunDetail>({
    queryKey: ["orch-run-detail", run.id],
    queryFn: async () => {
      const res = await fetch(`/api/jobs/admin/orchestrations/${run.id}`);
      if (!res.ok) throw new Error("Failed to load run detail");
      return res.json() as Promise<RunDetail>;
    },
    enabled: expanded,
    staleTime: 5_000,
    refetchInterval: run.status === "running" ? 5_000 : false,
  });

  const cancelRun = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/jobs/admin/orchestrations/${run.id}/cancel`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to cancel run");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orch-runs"] });
      qc.invalidateQueries({ queryKey: ["orch-run-detail", run.id] });
    },
  });

  const progress = run.total_nodes > 0
    ? Math.round(((run.completed_nodes + run.skipped_nodes) / run.total_nodes) * 100)
    : 0;

  const durationMs = runDurationMs(run);

  return (
    <Card className={run.status === "failed" ? "border-destructive/40" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <button
            className="flex items-center gap-2 text-left flex-1 min-w-0"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded
              ? <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              : <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold">{run.dag_id}</span>
                <Badge variant={STATUS_BADGE[run.status] ?? "outline"} className="text-[10px]">
                  {run.status}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                <span className="font-mono">{shortId(run.id)}</span>
                {run.trigger_ref && <span> · {run.trigger_ref}</span>}
                {" · "}
                {new Date(run.started_at).toLocaleString()}
                {durationMs != null && <span> · {fmtDuration(durationMs)}</span>}
              </p>
            </div>
          </button>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Progress pills */}
            <div className="hidden sm:flex items-center gap-1 text-[11px]">
              {run.completed_nodes > 0 && (
                <span className="text-success">
                  {run.completed_nodes}✓
                </span>
              )}
              {run.failed_nodes > 0 && (
                <span className="text-destructive">{run.failed_nodes}✗</span>
              )}
              {run.skipped_nodes > 0 && (
                <span className="text-muted-foreground">{run.skipped_nodes}↷</span>
              )}
              <span className="text-muted-foreground">/{run.total_nodes}</span>
            </div>

            {run.status === "running" && (
              <Button
                size="sm" variant="ghost" className="h-7 text-[10px]"
                onClick={() => setCancelOpen(true)}
              >
                <Ban className="h-3 w-3 mr-1" />
                Cancel
              </Button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {run.total_nodes > 0 && (
          <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                run.status === "failed" ? "bg-destructive" :
                run.status === "completed" ? "bg-success" : "bg-primary"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </CardHeader>

      {/* Expanded node timeline */}
      {expanded && (
        <CardContent className="pt-0">
          <div className="border-t pt-3 mt-1">
            {detailLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : detail ? (
              <NodeTimeline
                runId={run.id}
                nodes={detail.nodes}
                runStatus={run.status}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Failed to load node detail.</p>
            )}
          </div>
        </CardContent>
      )}

      <CancelDialog
        runId={run.id}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onConfirm={() => cancelRun.mutate()}
      />
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "running",   label: "Running" },
  { value: "completed", label: "Completed" },
  { value: "failed",    label: "Failed" },
  { value: "canceled",  label: "Canceled" },
];

const PAGE_SIZE = 25;

export default function OrchestrationPage() {
  const qc = useQueryClient();
  const [dagFilter, setDagFilter]    = useState("");
  const [statusFilter, setStatus]    = useState("");
  const [page, setPage]              = useState(0);

  const { data, isLoading } = useQuery<RunsResponse>({
    queryKey: ["orch-runs", dagFilter, statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit:  String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (dagFilter)    params.set("dag_id", dagFilter);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/jobs/admin/orchestrations?${params}`);
      if (!res.ok) return { items: [], total: 0 };
      return res.json() as Promise<RunsResponse>;
    },
    refetchInterval: 15_000,
    staleTime:        5_000,
  });

  const runs  = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const runningCount = runs.filter((r) => r.status === "running").length;
  const failedCount  = runs.filter((r) => r.status === "failed").length;

  return (
    <PageFrame
      title="Orchestration Runs"
      description="DAG execution history — step-by-step node timeline with retry and cancel controls"
      actions={
        <div className="flex items-center gap-2">
          {runningCount > 0 && (
            <Badge variant="warning" className="gap-1 text-[10px]">
              <Loader2 className="h-3 w-3 animate-spin" />
              {runningCount} running
            </Badge>
          )}
          {failedCount > 0 && (
            <Badge variant="destructive" className="gap-1 text-[10px]">
              <XCircle className="h-3 w-3" />
              {failedCount} failed
            </Badge>
          )}
          <Button
            variant="ghost" size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["orch-runs"] })}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      }
    >
      <JobsSubNav active="/setup/jobs/orchestrations" />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          placeholder="Filter by DAG ID…"
          value={dagFilter}
          onChange={(e) => { setDagFilter(e.target.value); setPage(0); }}
          className="h-8 w-48 text-xs"
        />
        <Select
          value={statusFilter || "_all"}
          onValueChange={(v) => { setStatus(v === "_all" ? "" : v); setPage(0); }}
        >
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value || "_all"} value={o.value || "_all"} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Run list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : runs.length === 0 ? (
        <EmptyState
          icon={<GitBranch className="h-10 w-10 text-muted-foreground/30" />}
          title="No orchestration runs found."
          description="Runs appear here when DagOrchestrationService.startRun() is called."
          className="py-20"
        />
      ) : (
        <>
          <div className="space-y-3">
            {runs.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {total} run{total !== 1 ? "s" : ""} · page {page + 1} of {totalPages}
              </p>
              <div className="flex gap-1">
                <Button
                  size="sm" variant="ghost" className="h-7 text-xs"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  size="sm" variant="ghost" className="h-7 text-xs"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </PageFrame>
  );
}
