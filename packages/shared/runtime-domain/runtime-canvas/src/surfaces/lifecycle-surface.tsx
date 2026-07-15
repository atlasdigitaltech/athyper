"use client";

import { Fragment, useState } from "react";
import { Clock, ChevronDown, ChevronUp } from "lucide-react";
import { WorkPanel } from "@athyper/surface-kit";
import { cn } from "@athyper/theme/utils";
import { resolveLifecycleRuntime } from "@athyper/runtime-contracts";
import type { LifecycleStep } from "@athyper/runtime-contracts";
import type { RuntimeSurfaceRendererProps } from "./types";

export function LifecycleSurfaceRenderer({
  contract,
  record,
  processState,
}: RuntimeSurfaceRendererProps) {
  const lifecycle = contract.lifecycle;
  const [metaOpen, setMetaOpen] = useState(false);

  if (!lifecycle?.enabled) {
    return (
      <WorkPanel title="Lifecycle">
        <p className="text-sm text-muted-foreground">Lifecycle is not enabled for this entity.</p>
      </WorkPanel>
    );
  }

  const runtime = resolveLifecycleRuntime({ descriptor: contract, record, processState });
  const currentState = runtime.currentState;
  const lifecyclePs = processState?.lifecycle;

  // Use server-computed steps if available; otherwise derive from canonical states list.
  const steps: LifecycleStep[] = lifecyclePs?.steps?.length
    ? lifecyclePs.steps
    : deriveSteps(lifecycle.states, currentState);

  const currentIdx = steps.findIndex((s) => s.status === "current");
  const stepLabel = steps.length > 0 && currentIdx >= 0
    ? ` · Step ${currentIdx + 1} / ${steps.length}`
    : steps.length > 0 ? ` · ${steps.length} steps` : "";

  return (
    <WorkPanel title={`Lifecycle${stepLabel}`}>
      <div className="flex flex-col gap-4">
        {steps.length > 0 ? (
          <LifecycleStepper steps={steps} />
        ) : (
          <p className="text-sm text-muted-foreground">No lifecycle states configured.</p>
        )}

        {/* Collapsible technical metadata */}
        <div>
          <button
            type="button"
            onClick={() => setMetaOpen((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {metaOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {metaOpen ? "Less" : "More"}
          </button>

          {metaOpen && (
            <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <SummaryField label="Transitions" value={String(lifecycle.transitions.length)} />
              <SummaryField label="Available Now" value={String(runtime.allowedTransitions.length)} />
              <SummaryField label="State Source" value={sourceLabel(runtime.source)} />
              {lifecycle.lifecycleCode ? (
                <SummaryField label="Lifecycle" value={lifecycle.lifecycleCode} />
              ) : null}
              {lifecyclePs?.currentStateEnteredAt ? (
                <SummaryField label="In State Since" value={fmtDate(lifecyclePs.currentStateEnteredAt)} />
              ) : null}
            </dl>
          )}
        </div>
      </div>
    </WorkPanel>
  );
}

// ── Dot-rail stepper ──────────────────────────────────────────────────────────

function LifecycleStepper({ steps }: { steps: LifecycleStep[] }) {
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="flex min-w-fit items-start">
        {steps.map((step, idx) => {
          const isLast = idx === steps.length - 1;
          const connectorFilled = step.status === "completed";
          return (
            <Fragment key={`${step.state}:${idx}`}>
              {/* Step column */}
              <div className="flex min-w-[88px] max-w-[132px] flex-col items-center px-1">
                <StepDot status={step.status} />
                <p
                  className={cn(
                    "mt-2 text-center text-xs font-semibold capitalize leading-tight",
                    step.status === "future"
                      ? "text-muted-foreground/60"
                      : "text-foreground",
                  )}
                >
                  {(step.label ?? step.state).replace(/_/g, " ")}
                </p>
                <p className="mt-0.5 text-center text-xs text-muted-foreground">
                  {step.enteredAt ? fmtDate(step.enteredAt) : "—"}
                </p>
                {step.status === "current" && step.enteredAt ? (
                  <div className="mt-0.5 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-2.5 w-2.5" />
                    <span className="tabular-nums">{fmtElapsed(step.enteredAt)}</span>
                  </div>
                ) : null}
              </div>

              {/* Connector */}
              {!isLast ? (
                <div className="mt-[5px] flex min-w-6 flex-1 items-center">
                  <div
                    className={cn(
                      "h-px w-full",
                      connectorFilled
                        ? "bg-foreground/25"
                        : "border-t border-dashed border-border/60",
                    )}
                  />
                </div>
              ) : null}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

function StepDot({ status }: { status: LifecycleStep["status"] }) {
  if (status === "completed") {
    return <div className="h-3 w-3 shrink-0 rounded-full bg-foreground" />;
  }
  if (status === "current") {
    return (
      <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-background">
        <div className="h-1.5 w-1.5 rounded-full bg-foreground" />
      </div>
    );
  }
  return <div className="h-3 w-3 shrink-0 rounded-full border border-border bg-background" />;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveSteps(states: string[], currentState: string | null): LifecycleStep[] {
  const currentIdx = currentState
    ? states.findIndex((s) => normalizeCode(s) === normalizeCode(currentState))
    : -1;

  return states.map((state, idx): LifecycleStep => ({
    state,
    status: currentIdx < 0
      ? "future"
      : idx < currentIdx
        ? "completed"
        : idx === currentIdx
          ? "current"
          : "future",
    enteredAt: null,
  }));
}

function normalizeCode(value: string): string {
  return value.trim().toLowerCase().replace(/[\s._-]+/g, "_");
}

function sourceLabel(source: string): string {
  if (source === "lifecycle_instance") return "Lifecycle instance";
  if (source === "record_status") return "Record status";
  return "None";
}

function fmtDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

function fmtElapsed(since: string): string {
  const ms = Date.now() - new Date(since).getTime();
  if (ms < 0) return "0m";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH > 0 ? `${days}d ${remH}h` : `${days}d`;
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}
