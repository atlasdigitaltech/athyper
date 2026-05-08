"use client";

/**
 * Jobs Console — /setup/jobs
 *
 * Queue dashboard: real-time BullMQ counters, health, pause/resume controls.
 * Sub-nav links to DLQ, run history, and cron schedules.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Activity, AlertTriangle, Pause, Play, RefreshCw,
  Clock, Mail, Database, Shield,
} from "lucide-react";
import Link from "next/link";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState } from "@athyper/ui/composites";
import {
  Button, Badge, Card, CardContent, CardHeader, CardTitle, Skeleton,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@athyper/ui/primitives";
import { JobsSubNav } from "./_components/jobs-sub-nav";

// ── Types ─────────────────────────────────────────────────────────────────────

interface QueueCounts {
  active:    number;
  waiting:   number;
  delayed:   number;
  failed:    number;
  completed: number;
  paused:    number;
}

interface QueueStat {
  name:     string;
  counts:   QueueCounts;
  isPaused: boolean;
}

interface QueuesResponse {
  queues: QueueStat[];
  ts:     number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const QUEUE_ICONS: Record<string, React.ReactNode> = {
  "jobs:lifecycle-timers": <Clock className="h-4 w-4" />,
  "jobs:notifications":    <Mail className="h-4 w-4" />,
  "jobs:domain-outbox":    <Database className="h-4 w-4" />,
  "jobs:sla-check":        <Shield className="h-4 w-4" />,
};

const QUEUE_SHORT: Record<string, string> = {
  "jobs:lifecycle-timers": "lifecycle-timers",
  "jobs:notifications":    "notifications",
  "jobs:domain-outbox":    "domain-outbox",
  "jobs:sla-check":        "sla-check",
};

function queueHealth(q: QueueStat): "healthy" | "degraded" | "down" {
  if (q.isPaused) return "down";
  if (q.counts.failed > 50) return "degraded";
  if (q.counts.failed > 0)  return "degraded";
  return "healthy";
}

const HEALTH_BADGE: Record<string, "success" | "warning" | "destructive"> = {
  healthy:  "success",
  degraded: "warning",
  down:     "destructive",
};

// ── Pause confirm dialog ──────────────────────────────────────────────────────

function PauseDialog({
  queue, open, onOpenChange, onConfirm,
}: { queue: QueueStat; open: boolean; onOpenChange: (v: boolean) => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{queue.isPaused ? "Resume queue?" : "Pause queue?"}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          {queue.isPaused
            ? `Resume processing jobs in ${queue.name}?`
            : `Pause ${queue.name}? Jobs will accumulate until resumed. In-flight jobs will complete.`}
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant={queue.isPaused ? "primary" : "destructive"}
            onClick={() => { onConfirm(); onOpenChange(false); }}
          >
            {queue.isPaused ? "Resume" : "Pause"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Queue card ────────────────────────────────────────────────────────────────

function QueueCard({ queue }: { queue: QueueStat }) {
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const shortName = QUEUE_SHORT[queue.name] ?? queue.name.replace("jobs:", "");
  const health = queueHealth(queue);

  const toggle = useMutation({
    mutationFn: async () => {
      const action = queue.isPaused ? "resume" : "pause";
      const res = await fetch(`/api/jobs/${shortName}/${action}`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs-queues"] }),
  });

  const total = queue.counts.active + queue.counts.waiting + queue.counts.delayed;

  return (
    <>
      <Card className={queue.isPaused ? "opacity-70" : ""}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">
                {QUEUE_ICONS[queue.name] ?? <Activity className="h-4 w-4" />}
              </span>
              <CardTitle className="text-sm font-medium">{shortName}</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={HEALTH_BADGE[health]} className="text-doc-support">
                {health}
              </Badge>
              <Button
                size="sm" variant="ghost" className="h-7 w-7 p-0"
                onClick={() => setConfirmOpen(true)}
                title={queue.isPaused ? "Resume queue" : "Pause queue"}
              >
                {queue.isPaused
                  ? <Play className="h-3.5 w-3.5 text-success" />
                  : <Pause className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="space-y-0.5">
              <p className="text-doc-support text-muted-foreground uppercase tracking-wide">Active</p>
              <p className="text-lg font-semibold text-primary">
                {queue.counts.active}
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-doc-support text-muted-foreground uppercase tracking-wide">Waiting</p>
              <p className="text-lg font-semibold">{total}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-doc-support text-muted-foreground uppercase tracking-wide">Failed</p>
              <p className={`text-lg font-semibold ${queue.counts.failed > 0 ? "text-destructive" : ""}`}>
                {queue.counts.failed}
              </p>
            </div>
          </div>

          {queue.counts.failed > 0 && (
            <div className="mt-2 pt-2 border-t flex items-center justify-between">
              <span className="flex items-center gap-1 text-doc-support text-destructive">
                <AlertTriangle className="h-3 w-3" />
                {queue.counts.failed} failed job{queue.counts.failed !== 1 ? "s" : ""}
              </span>
              <Link href={`/setup/jobs/dlq?queue=${shortName}`}>
                <Button size="sm" variant="ghost" className="h-6 text-doc-support">
                  View DLQ
                </Button>
              </Link>
            </div>
          )}

          {queue.counts.delayed > 0 && (
            <div className="mt-1 flex items-center gap-1 text-doc-support text-muted-foreground">
              <Clock className="h-3 w-3" />
              {queue.counts.delayed} delayed
            </div>
          )}
        </CardContent>
      </Card>

      <PauseDialog
        queue={queue}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => toggle.mutate()}
      />
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function JobsConsolePage() {
  const qc = useQueryClient();

  const { data, isLoading, dataUpdatedAt } = useQuery<QueuesResponse>({
    queryKey: ["jobs-queues"],
    queryFn: async () => {
      const res = await fetch("/api/jobs");
      return res.ok ? res.json() : { queues: [], ts: Date.now() };
    },
    refetchInterval: 10_000, // auto-refresh every 10 s
    staleTime:        5_000,
  });

  const queues = data?.queues ?? [];
  const totalFailed = queues.reduce((s, q) => s + q.counts.failed, 0);
  const anyPaused   = queues.some((q) => q.isPaused);

  const refreshedAt = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : null;

  return (
    <PageFrame
      title="Automation Console"
      description="BullMQ queue health, DLQ management, job history, and cron schedules"
      actions={
        <div className="flex items-center gap-2">
          {refreshedAt && (
            <span className="text-doc-support text-muted-foreground hidden sm:block">
              Updated {refreshedAt}
            </span>
          )}
          <Button
            variant="ghost" size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["jobs-queues"] })}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      }
    >
      <JobsSubNav active="/setup/jobs" />

      {/* Summary bar */}
      {!isLoading && queues.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {totalFailed > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {totalFailed} failed jobs across queues
            </Badge>
          )}
          {anyPaused && (
            <Badge variant="warning" className="gap-1">
              <Pause className="h-3 w-3" />
              One or more queues paused
            </Badge>
          )}
          {totalFailed === 0 && !anyPaused && (
            <Badge variant="success" className="gap-1">
              <Activity className="h-3 w-3" />
              All queues healthy
            </Badge>
          )}
        </div>
      )}

      {/* Queue cards */}
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : queues.length === 0 ? (
        <EmptyState
          icon={<Activity className="h-10 w-10 text-muted-foreground/30" />}
          title="No queues found."
          description="Start the jobs service to see queue status."
          className="py-20"
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {queues.map((q) => (
            <QueueCard key={q.name} queue={q} />
          ))}
        </div>
      )}
    </PageFrame>
  );
}
