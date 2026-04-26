"use client";

/**
 * Dead Letter Queue Browser — /setup/jobs/dlq
 *
 * Unified triage surface across all DLQ tables (audit, notification, render)
 * and outbox dead_letter events. Supports retry, discard, and error inspection.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw, RotateCcw, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState } from "@athyper/ui/composites";
import { RowCard } from "@athyper/ui/data";
import {
  Button, Badge, Skeleton,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@athyper/ui/primitives";
import { JobsSubNav } from "../_components/jobs-sub-nav";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DlqItem {
  id:                string;
  tenant_id:         string;
  queue_name:        string;
  job_name:          string;
  payload:           string;
  error_message:     string;
  retry_count:       number;
  last_attempted_at: string;
  retried_at:        string | null;
  retried_job_id:    string | null;
  created_at:        string;
}

interface DlqSection {
  table: string;
  items: DlqItem[];
  total: number;
}

interface DlqResponse {
  dlq: DlqSection[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TABLE_LABEL: Record<string, string> = {
  "log.audit_dlq":        "Audit",
  "log.notification_dlq": "Notification",
  "log.render_dlq":       "Render",
};

function tableShort(table: string): string {
  return table.replace("log.", "").replace("_dlq", "");
}

function classifyError(msg: string): "transient" | "permanent" {
  const lower = msg.toLowerCase();
  if (/timeout|connection reset|econnreset|network|enotfound|socket/.test(lower)) return "transient";
  return "permanent";
}

// ── Item row ──────────────────────────────────────────────────────────────────

function DlqRow({
  item, table, onRetry, onDiscard,
}: {
  item: DlqItem;
  table: string;
  onRetry:   (id: string, table: string) => void;
  onDiscard: (id: string, table: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const errClass = classifyError(item.error_message);
  const alreadyRetried = !!item.retried_at;

  let parsedPayload: unknown = null;
  try { parsedPayload = JSON.parse(item.payload); } catch { /* keep null */ }

  return (
    <RowCard className={alreadyRetried ? "opacity-60" : ""}>
      <div className="space-y-1.5">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <Badge
              variant={errClass === "transient" ? "warning" : "destructive"}
              className="text-[10px] shrink-0"
            >
              {errClass}
            </Badge>
            <span className="font-mono text-xs font-medium">{item.job_name}</span>
            <span className="text-[10px] text-muted-foreground font-mono">{item.queue_name}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {alreadyRetried ? (
              <Badge variant="muted" className="text-[10px]">retried</Badge>
            ) : (
              <>
                <Button
                  size="sm" variant="ghost" className="h-6 w-6 p-0"
                  title="Retry this job"
                  onClick={() => onRetry(item.id, table)}
                >
                  <RotateCcw className="h-3.5 w-3.5 text-primary" />
                </Button>
                <Button
                  size="sm" variant="ghost" className="h-6 w-6 p-0"
                  title="Discard this record"
                  onClick={() => onDiscard(item.id, table)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setExpanded((v) => !v)}>
              {expanded
                ? <ChevronDown className="h-3.5 w-3.5" />
                : <ChevronRight className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        <p className="text-xs text-destructive line-clamp-1">{item.error_message}</p>

        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>Attempts: {item.retry_count}</span>
          <span>{new Date(item.created_at).toLocaleString()}</span>
        </div>

        {expanded && (
          <div className="mt-2 pt-2 border-t space-y-2">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase mb-1">Full Error</p>
              <pre className="text-[10px] bg-muted/50 rounded p-2 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                {item.error_message}
              </pre>
            </div>
            {parsedPayload !== null && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase mb-1">Job Payload</p>
                <pre className="text-[10px] bg-muted/50 rounded p-2 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                  {JSON.stringify(parsedPayload, null, 2)}
                </pre>
              </div>
            )}
            {alreadyRetried && item.retried_job_id && (
              <p className="text-[10px] text-muted-foreground">
                Retried at {new Date(item.retried_at!).toLocaleString()} → job <code>{item.retried_job_id}</code>
              </p>
            )}
          </div>
        )}
      </div>
    </RowCard>
  );
}

// ── Confirm discard dialog ────────────────────────────────────────────────────

function DiscardDialog({
  open, onOpenChange, onConfirm,
}: { open: boolean; onOpenChange: (v: boolean) => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Discard DLQ record?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          This record will be permanently removed. The job will not be retried.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={() => { onConfirm(); onOpenChange(false); }}>Discard</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DlqBrowserPage() {
  const qc = useQueryClient();
  const [tableFilter, setTableFilter] = useState("all");
  const [unretriedOnly, setUnretriedOnly] = useState(true);
  const [discardTarget, setDiscardTarget] = useState<{ id: string; table: string } | null>(null);

  const params = new URLSearchParams({ table: tableFilter, unretried: String(unretriedOnly) });

  const { data, isLoading } = useQuery<DlqResponse>({
    queryKey: ["jobs-dlq", tableFilter, unretriedOnly],
    queryFn: async () => {
      const res = await fetch(`/api/jobs/admin/dlq?${params}`);
      return res.ok ? res.json() : { dlq: [] };
    },
    staleTime: 30_000,
  });

  const sections = (data?.dlq ?? []).filter((s) => s.items.length > 0);
  const totalItems = sections.reduce((s, sec) => s + sec.items.length, 0);

  const retry = useMutation({
    mutationFn: async ({ id, table }: { id: string; table: string }) => {
      const short = tableShort(table);
      const res = await fetch(`/api/jobs/admin/dlq/${short}/${id}/retry`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs-dlq"] }),
  });

  const discard = useMutation({
    mutationFn: async ({ id, table }: { id: string; table: string }) => {
      const short = tableShort(table);
      const res = await fetch(`/api/jobs/admin/dlq/${short}/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs-dlq"] }),
  });

  return (
    <PageFrame
      title="Dead Letter Queue"
      description="Failed jobs requiring manual triage across all queues"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="ghost" size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["jobs-dlq"] })}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      }
    >
      <JobsSubNav active="/setup/jobs/dlq" />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={tableFilter} onValueChange={setTableFilter}>
          <SelectTrigger className="h-7 text-xs w-40">
            <SelectValue placeholder="Table" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tables</SelectItem>
            <SelectItem value="audit">Audit DLQ</SelectItem>
            <SelectItem value="notification">Notification DLQ</SelectItem>
            <SelectItem value="render">Render DLQ</SelectItem>
          </SelectContent>
        </Select>

        <Button
          size="sm"
          variant={unretriedOnly ? "primary" : "ghost"}
          className="h-7 text-xs"
          onClick={() => setUnretriedOnly((v) => !v)}
        >
          Unretried only
        </Button>

        {totalItems > 0 && (
          <Badge variant="destructive" className="gap-1 self-center">
            <AlertTriangle className="h-3 w-3" />
            {totalItems} item{totalItems !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : sections.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="h-10 w-10 text-muted-foreground/30" />}
          title="No dead-letter records found."
          action={unretriedOnly ? (
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setUnretriedOnly(false)}>
              Show all (including retried)
            </Button>
          ) : undefined}
          className="py-20"
        />
      ) : (
        <div className="space-y-6">
          {sections.map((sec) => (
            <div key={sec.table}>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-medium">{TABLE_LABEL[sec.table] ?? sec.table}</h3>
                <Badge variant="muted" className="text-[10px]">{sec.total} total</Badge>
              </div>
              <div className="space-y-2">
                {sec.items.map((item) => (
                  <DlqRow
                    key={item.id}
                    item={item}
                    table={sec.table}
                    onRetry={(id, table) => retry.mutate({ id, table })}
                    onDiscard={(id, table) => setDiscardTarget({ id, table })}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <DiscardDialog
        open={!!discardTarget}
        onOpenChange={(v) => { if (!v) setDiscardTarget(null); }}
        onConfirm={() => {
          if (discardTarget) discard.mutate(discardTarget);
          setDiscardTarget(null);
        }}
      />
    </PageFrame>
  );
}
