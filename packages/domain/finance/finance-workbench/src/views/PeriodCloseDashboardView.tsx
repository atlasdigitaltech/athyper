"use client";

import { useState } from "react";
import { cn } from "@athyper/theme/utils";
import type { FinanceScope } from "../lib/scope";
import {
  usePeriodCloseRuns,
  usePeriodCloseTasks,
  type CycleRun,
  type CyclePhase,
} from "../hooks/usePeriodClose";

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

const TASK_STATUS_COLOR: Record<string, string> = {
  PENDING:     "bg-muted text-muted-foreground",
  IN_PROGRESS: "bg-warning/10 text-warning",
  COMPLETED:   "bg-success/10 text-success",
  BLOCKED:     "bg-warning/20 text-warning",
  FAILED:      "bg-destructive/10 text-destructive",
  DEVIATED:    "bg-accent/10 text-accent-foreground",
};

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ pct, blocked, failed }: { pct: number; blocked: number; failed: number }) {
  const hasIssues = blocked > 0 || failed > 0;
  return (
    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
      <div
        className={cn("h-full rounded-full transition-all", hasIssues ? "bg-warning" : "bg-success")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Run card ──────────────────────────────────────────────────────────────────

function RunCard({ run, selected, onClick }: { run: CycleRun; selected: boolean; onClick: () => void }) {
  const { taskSummary: ts } = run;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left p-3 rounded-xl border transition-colors space-y-2",
        selected ? "border-primary bg-primary/5" : "hover:bg-muted/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-medium">{run.entityCode} — {run.cycleTypeName}</div>
          <div className="text-[10px] text-muted-foreground">
            FY{run.fiscalYear} P{String(run.periodNumber).padStart(2, "0")} · Run #{run.runNumber}
          </div>
        </div>
        <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", RUN_STATUS_COLOR[run.status] ?? "bg-muted text-muted-foreground")}>
          {run.status.replace("_", " ")}
        </span>
      </div>

      <ProgressBar pct={ts.completionPct} blocked={ts.blocked} failed={ts.failed} />

      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="text-success font-medium">{ts.completed} done</span>
        {ts.inProgress > 0 && <span className="text-warning">{ts.inProgress} in progress</span>}
        {ts.blocked > 0 && <span className="text-warning/80">{ts.blocked} blocked</span>}
        {ts.failed > 0 && <span className="text-destructive">{ts.failed} failed</span>}
        <span className="ml-auto">{ts.completionPct}%</span>
      </div>

      {run.currentPhaseName && (
        <div className="text-[10px] text-muted-foreground">
          Phase: <span className="text-foreground">{run.currentPhaseName}</span>
        </div>
      )}

      <div className="flex gap-3 text-[10px] text-muted-foreground">
        {run.cycleStartDate && <span>Started: {fmtDate(run.cycleStartDate)}</span>}
        {run.cycleTargetDate && <span>Target: {fmtDate(run.cycleTargetDate)}</span>}
        {run.completedAt && <span>Completed: {fmtDate(run.completedAt)}</span>}
      </div>
    </button>
  );
}

// ── Task phase panel ──────────────────────────────────────────────────────────

function PhasePanel({ phase }: { phase: CyclePhase }) {
  const done = phase.tasks.filter((t) => t.status === "COMPLETED").length;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 py-1.5">
        <div className="text-xs font-medium">{phase.phaseName}</div>
        <div className="flex-1 h-px bg-border" />
        <div className="text-[10px] text-muted-foreground">{done}/{phase.tasks.length}</div>
      </div>
      <div className="space-y-1">
        {phase.tasks.map((task) => (
          <div key={task.id} className="flex items-center gap-2 p-2 rounded-lg border hover:bg-muted/30">
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded shrink-0", TASK_STATUS_COLOR[task.status] ?? "bg-muted text-muted-foreground")}>
              {task.status.replace("_", " ")}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs truncate">{task.taskName}</div>
              {task.categoryName && (
                <div className="text-[10px] text-muted-foreground">{task.categoryName}</div>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground shrink-0 text-right">
              {task.isMandatory && <span className="text-destructive mr-1">*</span>}
              {task.dueAt ? fmtDate(task.dueAt) : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Task detail panel ─────────────────────────────────────────────────────────

function TaskDetailPanel({ runId }: { runId: string }) {
  const { data, isLoading, isError } = usePeriodCloseTasks(runId);

  if (isLoading) return <div className="text-xs text-muted-foreground animate-pulse p-4">Loading tasks…</div>;
  if (isError) return <div className="text-xs text-destructive p-4">Failed to load tasks.</div>;
  if (!data) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>{data.totalTasks} tasks</span>
        <span>·</span>
        <span>{data.run.entityCode} FY{data.run.fiscalYear} P{String(data.run.periodNumber).padStart(2, "0")}</span>
        <span className={cn("px-1.5 py-0.5 rounded", RUN_STATUS_COLOR[data.run.status] ?? "")}>
          {data.run.status}
        </span>
      </div>
      {data.phases.map((phase) => (
        <PhasePanel key={phase.phaseCode} phase={phase} />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface PeriodCloseDashboardViewProps {
  scope: FinanceScope;
}

export function PeriodCloseDashboardView({ scope }: PeriodCloseDashboardViewProps) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const { data: runs = [], isLoading, isError } = usePeriodCloseRuns(scope);

  if (!scope.scopeId) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
        Select a scope to view period close status.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-muted-foreground animate-pulse">
        Loading…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-destructive">
        Failed to load period close data.
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
        No cycle runs found for this scope and period.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[300px_1fr] gap-4 h-full min-h-0">
      {/* Run list */}
      <div className="space-y-2 overflow-auto">
        <div className="text-[9px] text-muted-foreground uppercase mb-1">
          {runs.length} run{runs.length !== 1 ? "s" : ""}
        </div>
        {runs.map((run) => (
          <RunCard
            key={run.id}
            run={run}
            selected={selectedRunId === run.id}
            onClick={() => setSelectedRunId(run.id === selectedRunId ? null : run.id)}
          />
        ))}
      </div>

      {/* Task detail */}
      <div className="overflow-auto border rounded-xl p-3">
        {selectedRunId
          ? <TaskDetailPanel runId={selectedRunId} />
          : (
            <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
              Select a run to view task breakdown.
            </div>
          )
        }
      </div>
    </div>
  );
}
