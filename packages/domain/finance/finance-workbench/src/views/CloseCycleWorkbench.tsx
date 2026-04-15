"use client";

/**
 * CloseCycleWorkbench — /finance/close
 *
 * Two-panel period close workbench:
 *   Left  — close run list for the selected scope/period
 *   Right — phase tabs + task list with complete/reopen actions and phase sign-off
 *
 * URL state: ?scopeType=company&scopeId=ADT-001&fiscalYear=2026&period=3
 *            &runId=clr_abc123&phaseCode=posting
 *
 * runId is required for deep-link safety: multiple runs can exist for the same
 * period (reruns, reopened, concurrent drafts).
 */

import { useState, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  AlertTriangle, CheckCircle2, ChevronRight, Clock,
  Loader2, Play, RotateCcw, Shield, XCircle,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Button, Badge, Skeleton, Textarea } from "@athyper/ui/primitives";
import { PageFrame } from "@athyper/ui/layout";
import {
  usePeriodCloseRuns,
  usePeriodCloseTasks,
  type CycleRun,
  type CycleTask,
  type CyclePhase,
} from "../hooks/usePeriodClose";
import {
  useCompleteTask,
  useSignOffPhase,
  useStartCloseRun,
} from "../hooks/usePeriodCloseMutations";
import { scopeToParams } from "../lib/scope";
import type { FinanceScope } from "../lib/scope";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CloseCycleWorkbenchProps {
  scope:      FinanceScope;
  runId?:     string;
  phaseCode?: string;
}

// ── Blocker logic ─────────────────────────────────────────────────────────────

interface SignOffBlocker {
  type:  "incomplete_mandatory" | "failed_tasks" | "blocked_tasks";
  label: string;
  count: number;
}

function getSignOffBlockers(phase: CyclePhase): SignOffBlocker[] {
  const blockers: SignOffBlocker[] = [];
  const incomplete = phase.tasks.filter((t) => t.isMandatory && t.status !== "COMPLETED");
  if (incomplete.length > 0) {
    blockers.push({ type: "incomplete_mandatory", label: "Mandatory tasks incomplete", count: incomplete.length });
  }
  const failed = phase.tasks.filter((t) => t.status === "FAILED");
  if (failed.length > 0) {
    blockers.push({ type: "failed_tasks", label: "Failed tasks", count: failed.length });
  }
  const blocked = phase.tasks.filter((t) => t.status === "BLOCKED");
  if (blocked.length > 0) {
    blockers.push({ type: "blocked_tasks", label: "Blocked tasks", count: blocked.length });
  }
  return blockers;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

const RUN_STATUS_COLOR: Record<string, string> = {
  PLANNED:     "bg-muted text-muted-foreground",
  OPEN:        "bg-info/10 text-info",
  IN_PROGRESS: "bg-warning/10 text-warning",
  PHASE_GATE:  "bg-accent/10 text-accent-foreground",
  COMPLETED:   "bg-success/10 text-success",
  CERTIFIED:   "bg-success/20 text-success font-medium",
  CLOSED:      "bg-muted text-muted-foreground",
};

const TASK_ICON: Record<string, React.ElementType> = {
  COMPLETED:   CheckCircle2,
  IN_PROGRESS: Loader2,
  FAILED:      XCircle,
  BLOCKED:     AlertTriangle,
  PENDING:     Clock,
};

// ── Task row ──────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  runId,
  isActivePhase,
}: {
  task: CycleTask;
  runId: string;
  isActivePhase: boolean;
}) {
  const [remarks, setRemarks] = useState("");
  const [showRemarks, setShowRemarks] = useState(false);
  const mutation = useCompleteTask(runId);

  const Icon = TASK_ICON[task.status] ?? Clock;
  const canComplete = isActivePhase && (task.status === "PENDING" || task.status === "IN_PROGRESS" || task.status === "FAILED");
  const canReopen   = isActivePhase && task.status === "COMPLETED";

  async function handleAction(action: "complete" | "reopen") {
    await mutation.mutateAsync({ taskId: task.id, action, remarks: remarks || undefined });
    setRemarks("");
    setShowRemarks(false);
  }

  return (
    <div className="rounded-lg border p-3 space-y-2 hover:bg-muted/20 transition-colors">
      <div className="flex items-start gap-2">
        <Icon className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          task.status === "COMPLETED"   && "text-success",
          task.status === "IN_PROGRESS" && "text-warning animate-spin",
          task.status === "FAILED"      && "text-destructive",
          task.status === "BLOCKED"     && "text-warning/80",
          task.status === "PENDING"     && "text-muted-foreground",
        )} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium">{task.taskName}</span>
            {task.isMandatory && (
              <span className="text-[9px] text-destructive font-medium">required</span>
            )}
            <Badge variant="outline" className="text-[9px] px-1 py-0 capitalize">
              {task.categoryName}
            </Badge>
          </div>
          {task.description && (
            <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-1">{task.description}</p>
          )}
          <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
            {task.dueAt && <span>Due {fmtDate(task.dueAt)}</span>}
            {task.completedAt && <span>Completed {fmtDate(task.completedAt)}</span>}
            {task.assignedRole && <span>{task.assignedRole}</span>}
          </div>
          {task.failureReason && (
            <p className="mt-1 text-[10px] text-destructive">{task.failureReason}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {canComplete && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[10px] gap-1"
              onClick={() => setShowRemarks(!showRemarks)}
            >
              <CheckCircle2 className="h-3 w-3" /> Complete
            </Button>
          )}
          {canReopen && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] gap-1 text-muted-foreground"
              onClick={() => void handleAction("reopen")}
              disabled={mutation.isPending}
            >
              <RotateCcw className="h-3 w-3" /> Reopen
            </Button>
          )}
        </div>
      </div>

      {/* Remarks input for complete action */}
      {showRemarks && (
        <div className="flex gap-2 pl-6">
          <Textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Completion notes (optional)…"
            rows={2}
            className="text-xs flex-1"
          />
          <div className="flex flex-col gap-1">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => void handleAction("complete")}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Submit"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowRemarks(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mutation.isError && (
        <p className="pl-6 text-[10px] text-destructive">
          {mutation.error instanceof Error ? mutation.error.message : "Action failed"}
        </p>
      )}
    </div>
  );
}

// ── Phase panel ───────────────────────────────────────────────────────────────

function PhasePanel({
  phase,
  runId,
  isActive,
  runStatus,
}: {
  phase:     CyclePhase;
  runId:     string;
  isActive:  boolean;
  runStatus: string;
}) {
  const [showSignOff, setShowSignOff] = useState(false);
  const [remarks, setRemarks] = useState("");
  const signOff  = useSignOffPhase(runId);
  const blockers = getSignOffBlockers(phase);
  const canSignOff = blockers.length === 0 && isActive && !["COMPLETED", "CERTIFIED", "CLOSED"].includes(runStatus);

  const done    = phase.tasks.filter((t) => t.status === "COMPLETED").length;
  const total   = phase.tasks.length;
  const pct     = total > 0 ? Math.round((done / total) * 100) : 0;
  const hasIssue = phase.tasks.some((t) => t.status === "FAILED" || t.status === "BLOCKED");

  async function handleSignOff() {
    await signOff.mutateAsync({ phaseCode: phase.phaseCode, remarks: remarks || undefined });
    setShowSignOff(false);
    setRemarks("");
  }

  return (
    <div className="space-y-3">
      {/* Phase header */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{phase.phaseName}</span>
            <span className="text-[10px] text-muted-foreground">{done}/{total} tasks</span>
          </div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", hasIssue ? "bg-warning" : "bg-success")}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Sign-off button */}
        {isActive && (
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-7 gap-1.5 text-xs shrink-0",
              canSignOff
                ? "border-success/30 text-success hover:bg-success/10"
                : "cursor-not-allowed opacity-60",
            )}
            onClick={() => canSignOff && setShowSignOff(!showSignOff)}
            disabled={!canSignOff || signOff.isPending}
            title={blockers.length > 0 ? blockers.map((b) => `${b.label}: ${b.count}`).join(" · ") : undefined}
          >
            <Shield className="h-3 w-3" />
            Sign Off Phase
          </Button>
        )}
      </div>

      {/* Blockers */}
      {isActive && blockers.length > 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 space-y-0.5">
          <p className="text-[10px] font-medium text-warning">Sign-off blocked:</p>
          {blockers.map((b) => (
            <p key={b.type} className="text-[10px] text-warning/80">
              • {b.label} ({b.count})
            </p>
          ))}
        </div>
      )}

      {/* Sign-off form */}
      {showSignOff && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <p className="text-xs font-medium">Sign off "{phase.phaseName}"</p>
          <Textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Sign-off remarks (optional)…"
            rows={2}
            className="text-xs"
          />
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs gap-1 bg-success hover:bg-success/90 text-success-foreground"
              onClick={() => void handleSignOff()}
              disabled={signOff.isPending}
            >
              {signOff.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Shield className="h-3 w-3" /> Confirm Sign Off</>}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs"
              onClick={() => setShowSignOff(false)}
            >
              Cancel
            </Button>
          </div>
          {signOff.isError && (
            <p className="text-[10px] text-destructive">
              {signOff.error instanceof Error ? signOff.error.message : "Sign-off failed"}
            </p>
          )}
        </div>
      )}

      {/* Task list — mandatory tasks first */}
      <div className="space-y-1.5">
        {[...phase.tasks]
          .sort((a, b) => Number(b.isMandatory) - Number(a.isMandatory) || a.sortOrder - b.sortOrder)
          .map((task) => (
            <TaskRow key={task.id} task={task} runId={runId} isActivePhase={isActive} />
          ))
        }
      </div>
    </div>
  );
}

// ── Run sidebar ───────────────────────────────────────────────────────────────

function RunSidebar({
  runs,
  selectedId,
  onSelect,
  scope,
}: {
  runs:       CycleRun[];
  selectedId: string | null;
  onSelect:   (id: string) => void;
  scope:      FinanceScope;
}) {
  const startRun = useStartCloseRun(scope);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          {runs.length} run{runs.length !== 1 ? "s" : ""}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-[10px] gap-1"
          onClick={() => void startRun.mutate()}
          disabled={startRun.isPending}
        >
          {startRun.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Play className="h-3 w-3" /> New Run</>}
        </Button>
      </div>
      {runs.map((run) => {
        const ts = run.taskSummary;
        return (
          <button
            key={run.id}
            type="button"
            onClick={() => onSelect(run.id)}
            className={cn(
              "w-full text-left rounded-xl border p-3 space-y-2 transition-colors",
              selectedId === run.id ? "border-primary bg-primary/5" : "hover:bg-muted/40",
            )}
          >
            <div className="flex items-start justify-between gap-1.5">
              <div>
                <div className="text-xs font-medium">
                  FY{run.fiscalYear} P{String(run.periodNumber).padStart(2, "0")} · Run #{run.runNumber}
                </div>
                <div className="text-[10px] text-muted-foreground">{run.cycleTypeName}</div>
              </div>
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0", RUN_STATUS_COLOR[run.status] ?? "bg-muted")}>
                {run.status.replace("_", " ")}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn("h-full rounded-full", (ts.blocked > 0 || ts.failed > 0) ? "bg-warning" : "bg-success")}
                style={{ width: `${ts.completionPct}%` }}
              />
            </div>
            <div className="flex gap-2 text-[10px] text-muted-foreground">
              <span className="text-success">{ts.completed} done</span>
              {ts.inProgress > 0 && <span className="text-warning">{ts.inProgress} active</span>}
              {ts.blocked > 0  && <span className="text-warning/80">{ts.blocked} blocked</span>}
              {ts.failed > 0   && <span className="text-destructive">{ts.failed} failed</span>}
              <span className="ml-auto">{ts.completionPct}%</span>
            </div>
            {run.currentPhaseName && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <ChevronRight className="h-3 w-3" />
                {run.currentPhaseName}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Task detail panel ─────────────────────────────────────────────────────────

function TaskDetailPanel({
  runId,
  activePhaseCode,
  runStatus,
  onPhaseSelect,
}: {
  runId:           string;
  activePhaseCode: string | null;
  runStatus:       string;
  onPhaseSelect:   (code: string) => void;
}) {
  const { data, isLoading, isError } = usePeriodCloseTasks(runId);

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }
  if (isError) {
    return <div className="p-4 text-xs text-destructive">Failed to load tasks.</div>;
  }
  if (!data) return null;

  const currentPhase = data.phases.find((p) => p.phaseCode === activePhaseCode) ?? data.phases[0];

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      {/* Phase tabs */}
      <div className="flex gap-1 border-b pb-0 flex-wrap shrink-0">
        {data.phases.map((phase) => {
          const done  = phase.tasks.filter((t) => t.status === "COMPLETED").length;
          const total = phase.tasks.length;
          const isActive = phase.phaseCode === (activePhaseCode ?? data.phases[0]?.phaseCode);
          return (
            <button
              key={phase.phaseCode}
              onClick={() => onPhaseSelect(phase.phaseCode)}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {phase.phaseName}
              <span className="text-[10px] text-muted-foreground">({done}/{total})</span>
            </button>
          );
        })}
      </div>

      {/* Active phase content */}
      {currentPhase && (
        <div className="flex-1 min-h-0 overflow-auto">
          <PhasePanel
            phase={currentPhase}
            runId={runId}
            isActive={currentPhase.phaseCode === data.run.status || runStatus === "IN_PROGRESS"}
            runStatus={runStatus}
          />
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CloseCycleWorkbench({ scope, runId: initialRunId, phaseCode: initialPhaseCode }: CloseCycleWorkbenchProps) {
  const router      = useRouter();
  const pathname    = usePathname();
  const searchParams = useSearchParams();

  const { data: runs = [], isLoading, isError } = usePeriodCloseRuns(scope);

  // Derive selectedRunId from URL; default to most recent run
  const selectedRunId = initialRunId ?? runs[0]?.id ?? null;
  const selectedRun   = runs.find((r) => r.id === selectedRunId) ?? null;
  const [activePhaseCode, setActivePhaseCode] = useState<string | null>(initialPhaseCode ?? null);

  const pushState = useCallback((runId: string, phaseCode?: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("runId", runId);
    if (phaseCode) p.set("phaseCode", phaseCode);
    else p.delete("phaseCode");
    router.replace(`${pathname}?${p.toString()}`);
  }, [router, pathname, searchParams]);

  const handleRunSelect = (id: string) => {
    setActivePhaseCode(null);
    pushState(id);
  };

  const handlePhaseSelect = (code: string) => {
    setActivePhaseCode(code);
    if (selectedRunId) pushState(selectedRunId, code);
  };

  return (
    <PageFrame
      title="Period Close"
      description={
        scope.scopeId
          ? `${scope.scopeId} · FY${scope.fiscalYear}${scope.period != null ? ` P${String(scope.period).padStart(2, "0")}` : ""}`
          : "Select a scope from the context bar"
      }
    >
      {isLoading ? (
        <div className="grid grid-cols-[280px_1fr] gap-4 h-[calc(100vh-14rem)]">
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
          <Skeleton className="h-full w-full" />
        </div>
      ) : isError ? (
        <div className="flex items-center justify-center h-32 text-sm text-destructive">
          Failed to load close runs.
        </div>
      ) : runs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <Play className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">No close runs for this period</p>
          <p className="text-xs text-muted-foreground/70">Start a new close run to begin the period close process.</p>
        </div>
      ) : (
        <div className="grid grid-cols-[280px_1fr] gap-4 h-[calc(100vh-14rem)] min-h-0">
          {/* Left — Run list */}
          <div className="overflow-auto">
            <RunSidebar
              runs={runs}
              selectedId={selectedRunId}
              onSelect={handleRunSelect}
              scope={scope}
            />
          </div>

          {/* Right — Phase/task detail */}
          <div className="overflow-auto rounded-xl border p-4">
            {selectedRunId && selectedRun ? (
              <TaskDetailPanel
                runId={selectedRunId}
                activePhaseCode={activePhaseCode}
                runStatus={selectedRun.status}
                onPhaseSelect={handlePhaseSelect}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                Select a run to view task breakdown.
              </div>
            )}
          </div>
        </div>
      )}
    </PageFrame>
  );
}
