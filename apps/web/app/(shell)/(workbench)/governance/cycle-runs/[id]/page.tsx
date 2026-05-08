"use client";

/**
 * Governance Cycle Run Detail — /governance/cycle-runs/[id]
 *
 * Tabs: Phases | Tasks | Deviations | Certifications
 * Phase rail shows gate status; task list shows completion state per phase.
 */

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, CheckCircle2, Circle, AlertCircle, Plus, RefreshCw, ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { PageFrame } from "@athyper/ui/layout";
import { RowCard } from "@athyper/ui/data";
import {
  Button, Badge, Skeleton, Tabs, TabsList, TabsTrigger, TabsContent,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Label, Textarea, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@athyper/ui/primitives";

// ── Types ─────────────────────────────────────────────────────────────────────

type RunStatus = "PLANNED" | "OPEN" | "IN_PROGRESS" | "PENDING_CERT" | "CERTIFIED" | "CLOSED";
type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETE" | "REOPENED" | "SKIPPED" | "BLOCKED";
type DevStatus  = "OPEN" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "RESOLVED";
type CertStatus = "PENDING" | "CERTIFIED" | "REJECTED";

interface CycleRun {
  id: string; runCode: string; runLabel: string; status: RunStatus;
  cycleTypeName?: string; periodStart: string; periodEnd: string;
  currentPhaseCode?: string | null;
}
interface RunPhase {
  id: string; phaseCode: string; phaseName: string; sortOrder: number;
  status: "PENDING" | "ACTIVE" | "COMPLETE" | "SKIPPED";
  isGateEnforced: boolean; readinessPct: number | null;
  startedAt: string | null; completedAt: string | null;
}
interface RunTask {
  id: string; taskCode: string; taskName: string; phaseCode: string;
  status: TaskStatus; isMandatory: boolean; slaHours: number | null;
  completedAt: string | null; completedBy: string | null;
}
interface Deviation {
  id: string; deviationCode: string; title: string;
  status: DevStatus; severity: string | null;
  requestedByUserId: string; createdAt: string;
}
interface Certification {
  id: string; certCode: string; signatoryUserId: string;
  status: CertStatus; certifiedAt: string | null; notes: string | null;
}

const RUN_STATUS_VARIANT: Record<RunStatus, "warning" | "muted" | "success" | "outline"> = {
  PLANNED: "outline", OPEN: "warning", IN_PROGRESS: "warning",
  PENDING_CERT: "muted", CERTIFIED: "success", CLOSED: "muted",
};
const TASK_STATUS_VARIANT: Record<TaskStatus, "warning" | "muted" | "success" | "destructive" | "outline"> = {
  PENDING: "outline", IN_PROGRESS: "warning", COMPLETE: "success",
  REOPENED: "warning", SKIPPED: "muted", BLOCKED: "destructive",
};

// ── Phase Rail ────────────────────────────────────────────────────────────────

function PhaseRail({ phases, currentPhaseCode }: { phases: RunPhase[]; currentPhaseCode?: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      {phases.map((p, i) => {
        const isActive = p.phaseCode === currentPhaseCode || p.status === "ACTIVE";
        const isDone   = p.status === "COMPLETE";
        return (
          <div key={p.id} className={`flex items-center gap-3 rounded-lg border p-3 ${isActive ? "border-primary/50 bg-primary/5" : ""}`}>
            <div className="shrink-0">
              {isDone ? <CheckCircle2 className="h-4 w-4 text-success" /> :
               isActive ? <AlertCircle className="h-4 w-4 text-warning" /> :
               <Circle className="h-4 w-4 text-muted-foreground/40" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground w-6 text-right">{p.sortOrder}.</span>
                <span className={`text-sm font-medium ${isActive ? "text-primary" : ""}`}>{p.phaseName}</span>
                <Badge variant="outline" className="text-doc-support font-mono">{p.phaseCode}</Badge>
              </div>
              <div className="ml-8 flex gap-3 mt-0.5 text-xs text-muted-foreground">
                <span className="capitalize">{p.status.toLowerCase()}</span>
                {p.isGateEnforced && <span>Gate enforced</span>}
                {p.readinessPct !== null && <span>{p.readinessPct}% ready</span>}
                {p.completedAt && <span>Closed {new Date(p.completedAt).toLocaleDateString()}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Tasks Tab ─────────────────────────────────────────────────────────────────

function TasksTab({ runId, phases }: { runId: string; phases: RunPhase[] }) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [activeTask, setActiveTask] = useState<RunTask | null>(null);
  const [taskAction, setTaskAction] = useState<"complete" | "reopen">("complete");

  const { data, isLoading } = useQuery<{ data: RunTask[] }>({
    queryKey: ["governance-run-tasks", runId],
    queryFn: async () => {
      const res = await fetch(`/api/governance/cycle-runs/${runId}/tasks`);
      return res.ok ? res.json() : { data: [] };
    },
    staleTime: 30_000,
  });
  const tasks = data?.data ?? [];

  const mutate = useMutation({
    mutationFn: async () => {
      if (!activeTask) return;
      const res = await fetch(`/api/governance/cycle-runs/${runId}/tasks/${activeTask.id}/${taskAction}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["governance-run-tasks", runId] });
      setActiveTask(null); setNote("");
    },
  });

  // Group by phase
  const byPhase = phases.map((ph) => ({
    phase: ph,
    tasks: tasks.filter((t) => t.phaseCode === ph.phaseCode),
  }));

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <>
      <div className="space-y-4">
        {byPhase.map(({ phase, tasks: phaseTasks }) => phaseTasks.length > 0 && (
          <div key={phase.id}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{phase.phaseName}</span>
              <Badge variant="outline" className="text-doc-support">{phaseTasks.length} tasks</Badge>
            </div>
            <div className="space-y-1.5">
              {phaseTasks.map((t) => (
                <RowCard
                  key={t.id}
                  badge={<>
                    <Badge variant={TASK_STATUS_VARIANT[t.status]} className="text-doc-support">{t.status}</Badge>
                    {t.isMandatory && <span className="text-doc-support text-warning font-medium">mandatory</span>}
                  </>}
                  title={t.taskName}
                  metadata={t.completedAt ? (
                    <span>Completed {new Date(t.completedAt).toLocaleString()}</span>
                  ) : undefined}
                  actions={<>
                    {(t.status === "PENDING" || t.status === "IN_PROGRESS" || t.status === "BLOCKED") && (
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => { setActiveTask(t); setTaskAction("complete"); }}>
                        Complete
                      </Button>
                    )}
                    {t.status === "COMPLETE" && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs"
                        onClick={() => { setActiveTask(t); setTaskAction("reopen"); }}>
                        Reopen
                      </Button>
                    )}
                  </>}
                />
              ))}
            </div>
          </div>
        ))}
        {tasks.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No tasks materialized. Open the run to materialize tasks.</p>
        )}
      </div>

      <Dialog open={!!activeTask} onOpenChange={(v) => !v && setActiveTask(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{taskAction === "complete" ? "Complete Task" : "Reopen Task"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">{activeTask?.taskName}</p>
            <div className="space-y-1">
              <Label className="text-xs">Note (optional)</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Completion note…" />
            </div>
            {mutate.error && <p className="text-xs text-destructive">{(mutate.error as Error).message}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActiveTask(null)}>Cancel</Button>
            <Button onClick={() => mutate.mutate()} disabled={mutate.isPending}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Deviations Tab ────────────────────────────────────────────────────────────

const DEV_VARIANT: Record<DevStatus, "warning" | "muted" | "success" | "destructive" | "outline"> = {
  OPEN: "warning", PENDING_APPROVAL: "warning", APPROVED: "success",
  REJECTED: "destructive", RESOLVED: "muted",
};

function DeviationsTab({ runId }: { runId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [justification, setJustification] = useState("");
  const [severity, setSeverity] = useState("MEDIUM");

  const { data, isLoading } = useQuery<{ data: Deviation[] }>({
    queryKey: ["governance-run-deviations", runId],
    queryFn: async () => {
      const res = await fetch(`/api/governance/cycle-runs/${runId}/deviations`);
      return res.ok ? res.json() : { data: [] };
    },
    staleTime: 30_000,
  });
  const devs = data?.data ?? [];

  const create = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/governance/cycle-runs/${runId}/deviations`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["governance-run-deviations", runId] });
      setOpen(false); setTitle(""); setDescription(""); setJustification("");
    },
  });

  if (isLoading) return <Skeleton className="h-24 w-full" />;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1.5 h-3.5 w-3.5" />Log Deviation</Button>
      </div>
      {devs.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No deviations logged.</p>
      ) : (
        <div className="space-y-2">
          {devs.map((d) => (
            <RowCard
              key={d.id}
              badge={<>
                <Badge variant={DEV_VARIANT[d.status]} className="text-doc-support">{d.status}</Badge>
                {d.severity && <Badge variant="outline" className="text-doc-support">{d.severity}</Badge>}
              </>}
              title={d.title}
              metadata={<span className="text-doc-support">{new Date(d.createdAt).toLocaleString()}</span>}
            />
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Log Deviation</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Title *</Label>
              <input className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short description" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Justification</Label>
              <Textarea value={justification} onChange={(e) => setJustification(e.target.value)} rows={2} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Severity</Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { if (!title) return; create.mutate({ title, description: description || null, justification: justification || null, severity }); }}>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Certifications Tab ────────────────────────────────────────────────────────

const CERT_VARIANT: Record<CertStatus, "warning" | "success" | "destructive"> = {
  PENDING: "warning", CERTIFIED: "success", REJECTED: "destructive",
};

function CertificationsTab({ runId }: { runId: string }) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ data: Certification[] }>({
    queryKey: ["governance-run-certs", runId],
    queryFn: async () => {
      const res = await fetch(`/api/governance/cycle-runs/${runId}/certifications`);
      return res.ok ? res.json() : { data: [] };
    },
    staleTime: 30_000,
  });
  const certs = data?.data ?? [];

  const certify = useMutation({
    mutationFn: async ({ certId, action }: { certId: string; action: "certify" | "reject" }) => {
      const res = await fetch(`/api/governance/cycle-runs/${runId}/certifications/${certId}/${action}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["governance-run-certs", runId] }),
  });

  if (isLoading) return <Skeleton className="h-24 w-full" />;

  return (
    <div className="space-y-2">
      {certs.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No certifications. Advance run to PENDING_CERT to trigger sign-off.</p>
      ) : (
        certs.map((c) => (
          <RowCard
            key={c.id}
            badge={<Badge variant={CERT_VARIANT[c.status]} className="text-doc-support">{c.status}</Badge>}
            title={<span className="font-mono">{c.certCode}</span>}
            metadata={<>
              {c.certifiedAt && (
                <span className="text-doc-support">
                  {c.status === "CERTIFIED" ? "Certified" : "Rejected"} {new Date(c.certifiedAt).toLocaleString()}
                </span>
              )}
              {c.notes && <p>{c.notes}</p>}
            </>}
            actions={c.status === "PENDING" ? (
              <>
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => certify.mutate({ certId: c.id, action: "certify" })}>
                  <ShieldCheck className="mr-1 h-3 w-3" />Certify
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive"
                  onClick={() => certify.mutate({ certId: c.id, action: "reject" })}>
                  Reject
                </Button>
              </>
            ) : undefined}
          />
        ))
      )}
    </div>
  );
}

// ── Run Actions ───────────────────────────────────────────────────────────────

function RunActions({ run, onRefresh }: { run: CycleRun; onRefresh: () => void }) {
  const qc = useQueryClient();

  const action = useMutation({
    mutationFn: async (act: string) => {
      const res = await fetch(`/api/governance/cycle-runs/${run.id}/${act}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["governance-run", run.id] });
      qc.invalidateQueries({ queryKey: ["governance-run-phases", run.id] });
      onRefresh();
    },
  });

  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" onClick={onRefresh}><RefreshCw className="h-4 w-4" /></Button>
      {run.status === "PLANNED" && (
        <Button size="sm" onClick={() => action.mutate("open")} disabled={action.isPending}>Open Run</Button>
      )}
      {run.status === "OPEN" && (
        <Button size="sm" onClick={() => action.mutate("advance-phase")} disabled={action.isPending}>Advance Phase</Button>
      )}
      {run.status === "IN_PROGRESS" && (
        <Button size="sm" onClick={() => action.mutate("advance-phase")} disabled={action.isPending}>Advance Phase</Button>
      )}
      {run.status === "PENDING_CERT" && (
        <Button size="sm" onClick={() => action.mutate("certify")} disabled={action.isPending}>Certify Run</Button>
      )}
      {run.status === "CERTIFIED" && (
        <Button size="sm" onClick={() => action.mutate("close")} disabled={action.isPending}>Close Run</Button>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CycleRunDetailPage() {
  const params = useParams<{ id: string }>();
  const runId = params.id;
  const qc = useQueryClient();

  const { data: runData } = useQuery<{ data: CycleRun }>({
    queryKey: ["governance-run", runId],
    queryFn: async () => {
      const res = await fetch(`/api/governance/cycle-runs/${runId}`);
      return res.ok ? res.json() : { data: null };
    },
    staleTime: 30_000,
  });
  const run = runData?.data;

  const { data: phasesData } = useQuery<{ data: RunPhase[] }>({
    queryKey: ["governance-run-phases", runId],
    queryFn: async () => {
      const res = await fetch(`/api/governance/cycle-runs/${runId}/phases`);
      return res.ok ? res.json() : { data: [] };
    },
    staleTime: 30_000,
  });
  const phases = phasesData?.data ?? [];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["governance-run", runId] });
    qc.invalidateQueries({ queryKey: ["governance-run-phases", runId] });
    qc.invalidateQueries({ queryKey: ["governance-run-tasks", runId] });
  };

  return (
    <PageFrame
      title={run?.runLabel || run?.runCode || "Cycle Run"}
      description={
        run
          ? `${run.cycleTypeName ?? ""} · ${new Date(run.periodStart).toLocaleDateString()} – ${new Date(run.periodEnd).toLocaleDateString()}`
          : ""
      }
      actions={
        <div className="flex items-center gap-2">
          {run && <Badge variant={RUN_STATUS_VARIANT[run.status]}>{run.status}</Badge>}
          {run && <RunActions run={run} onRefresh={refresh} />}
          <Link href="/governance/cycle-runs">
            <Button variant="ghost" size="sm"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" />Back</Button>
          </Link>
        </div>
      }
    >
      <Tabs defaultValue="phases">
        <TabsList className="mb-4">
          <TabsTrigger value="phases">Phases</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="deviations">Deviations</TabsTrigger>
          <TabsTrigger value="certifications">Certifications</TabsTrigger>
        </TabsList>
        <TabsContent value="phases" className="mt-4">
          {phases.length === 0
            ? <Skeleton className="h-40 w-full" />
            : <PhaseRail phases={phases} currentPhaseCode={run?.currentPhaseCode} />}
        </TabsContent>
        <TabsContent value="tasks" className="mt-4">
          <TasksTab runId={runId} phases={phases} />
        </TabsContent>
        <TabsContent value="deviations" className="mt-4">
          <DeviationsTab runId={runId} />
        </TabsContent>
        <TabsContent value="certifications" className="mt-4">
          <CertificationsTab runId={runId} />
        </TabsContent>
      </Tabs>
    </PageFrame>
  );
}
