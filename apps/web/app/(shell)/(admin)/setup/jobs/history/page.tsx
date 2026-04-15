"use client";

/**
 * Job Run History — /setup/jobs/history
 *
 * Searchable, filterable view of log.job_log. Click-through to view
 * full step-level execution detail for any run.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, ChevronDown, ChevronRight, CheckCircle2, XCircle, Clock, SkipForward } from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState } from "@athyper/ui/feedback";
import { FilterPillBar } from "@athyper/ui/composites";
import { RowCard } from "@athyper/ui/data";
import {
  Button, Badge, Skeleton,
  Input, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@athyper/ui/primitives";
import { JobsSubNav } from "../_components/jobs-sub-nav";

// ── Types ─────────────────────────────────────────────────────────────────────

interface JobLogEntry {
  id:           string;
  job_type:     string;
  flow_id:      string;
  run_id:       string | null;
  step_index:   number;
  step_type:    string | null;
  status:       "success" | "failed" | "cancelled" | "timeout" | "skipped";
  duration_ms:  number | null;
  attempt_no:   number;
  started_at:   string | null;
  completed_at: string | null;
  error:        string | null;
  purge_after:  string | null;
}

interface HistoryResponse {
  items:  JobLogEntry[];
  total:  number;
  limit:  number;
  offset: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_ICON: Record<string, React.ReactNode> = {
  success:   <CheckCircle2 className="h-3.5 w-3.5 text-success" />,
  failed:    <XCircle      className="h-3.5 w-3.5 text-destructive" />,
  timeout:   <Clock        className="h-3.5 w-3.5 text-warning" />,
  cancelled: <XCircle      className="h-3.5 w-3.5 text-muted-foreground" />,
  skipped:   <SkipForward  className="h-3.5 w-3.5 text-muted-foreground" />,
};

const STATUS_VARIANT: Record<string, "success" | "destructive" | "warning" | "muted"> = {
  success:   "success",
  failed:    "destructive",
  timeout:   "warning",
  cancelled: "muted",
  skipped:   "muted",
};

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000)   return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

// ── Row ───────────────────────────────────────────────────────────────────────

function HistoryRow({ entry }: { entry: JobLogEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <RowCard className={entry.status === "failed" ? "border-destructive/30" : ""}>
      <div
        className="flex items-center gap-2 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="shrink-0">
          {STATUS_ICON[entry.status] ?? <CheckCircle2 className="h-3.5 w-3.5" />}
        </span>
        <span className="font-mono text-xs font-medium flex-1 min-w-0 truncate">
          {entry.job_type}
        </span>
        <Badge variant={STATUS_VARIANT[entry.status]} className="text-[10px] shrink-0">
          {entry.status}
        </Badge>
        <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:block">
          {formatDuration(entry.duration_ms)}
        </span>
        <span className="text-[10px] text-muted-foreground shrink-0 hidden md:block">
          {entry.started_at ? new Date(entry.started_at).toLocaleString() : "—"}
        </span>
        <Button size="sm" variant="ghost" className="h-5 w-5 p-0 shrink-0">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {expanded && (
        <div className="mt-2 pt-2 border-t grid gap-1.5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
            <div>
              <p className="text-muted-foreground uppercase">Flow ID</p>
              <p className="font-mono truncate">{entry.flow_id}</p>
            </div>
            {entry.run_id && (
              <div>
                <p className="text-muted-foreground uppercase">Run ID</p>
                <p className="font-mono truncate">{entry.run_id}</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground uppercase">Step</p>
              <p>{entry.step_index} {entry.step_type ? `(${entry.step_type})` : ""}</p>
            </div>
            <div>
              <p className="text-muted-foreground uppercase">Attempt</p>
              <p>#{entry.attempt_no}</p>
            </div>
            <div>
              <p className="text-muted-foreground uppercase">Duration</p>
              <p>{formatDuration(entry.duration_ms)}</p>
            </div>
            <div>
              <p className="text-muted-foreground uppercase">Started</p>
              <p>{entry.started_at ? new Date(entry.started_at).toLocaleString() : "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground uppercase">Completed</p>
              <p>{entry.completed_at ? new Date(entry.completed_at).toLocaleString() : "—"}</p>
            </div>
            {entry.purge_after && (
              <div>
                <p className="text-muted-foreground uppercase">Purge After</p>
                <p>{new Date(entry.purge_after).toLocaleDateString()}</p>
              </div>
            )}
          </div>
          {entry.error && (
            <div className="mt-1">
              <p className="text-[10px] text-muted-foreground uppercase mb-0.5">Error</p>
              <pre className="text-[10px] text-destructive bg-destructive/5 rounded p-2 whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                {entry.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </RowCard>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const STATUS_OPTIONS = ["", "success", "failed", "cancelled", "timeout", "skipped"];

export default function RunHistoryPage() {
  const [jobType,  setJobType]  = useState("");
  const [status,   setStatus]   = useState("");
  const [page,     setPage]     = useState(0);

  const offset = page * PAGE_SIZE;

  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
  if (jobType) params.set("job_type", jobType);
  if (status)  params.set("status", status);

  const { data, isLoading, refetch } = useQuery<HistoryResponse>({
    queryKey: ["jobs-history", jobType, status, page],
    queryFn: async () => {
      const res = await fetch(`/api/jobs/admin/history?${params}`);
      return res.ok ? res.json() : { items: [], total: 0, limit: PAGE_SIZE, offset };
    },
    staleTime: 30_000,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Collect unique job types from current page for quick filter
  const jobTypes = [...new Set(items.map((i) => i.job_type))].sort();

  return (
    <PageFrame
      title="Run History"
      description="Completed job execution records from log.job_log"
      actions={
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      }
    >
      <JobsSubNav active="/setup/jobs/history" />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          placeholder="Filter by job type…"
          value={jobType}
          onChange={(e) => { setJobType(e.target.value); setPage(0); }}
          className="h-7 text-xs w-48 font-mono"
        />
        <Select value={status || "_all"} onValueChange={(v) => { setStatus(v === "_all" ? "" : v); setPage(0); }}>
          <SelectTrigger className="h-7 text-xs w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All statuses</SelectItem>
            {STATUS_OPTIONS.filter(Boolean).map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {total > 0 && (
          <span className="text-xs text-muted-foreground self-center">
            {total.toLocaleString()} record{total !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {jobTypes.length > 1 && (
        <FilterPillBar
          items={jobTypes.map((jt) => ({ value: jt, label: jt }))}
          value={jobType}
          onChange={(v) => { setJobType(v); setPage(0); }}
          allItem={{ label: "All" }}
          compact
          className="mb-3"
        />
      )}

      {/* Content */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Clock className="h-10 w-10 text-muted-foreground/30" />}
          title="No run history found."
          className="py-20"
        />
      ) : (
        <>
          <div className="space-y-2 mb-4">
            {items.map((entry) => <HistoryRow key={entry.id} entry={entry} />)}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </PageFrame>
  );
}
