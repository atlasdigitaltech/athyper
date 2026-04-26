"use client";

import type { ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import type { HeaderProgress, HeaderProgressStage, HeaderStatusDimension } from "../types";
import { EntityStatusStrip } from "./EntityStatusStrip";
import { EntityTimeline } from "./EntityTimeline";

export interface EntityProgressRowProps {
  progress?: HeaderProgress;
  statuses?: HeaderStatusDimension[];
  railExpanded: boolean;
  onToggleRail: () => void;
  className?: string;
}

// ── Wizard stepper (kind === "wizard") ────────────────────────────────────────
// Compact horizontal node graph — no dates, no SLA badges, no duration labels.
// Target expanded height: 40–48px.

function WizardNode({ stage, state }: {
  stage: HeaderProgressStage;
  state: "past" | "current" | "future";
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 shrink-0">
      <div className={cn(
        "w-[11px] h-[11px] rounded-full border-[1.5px] relative",
        state === "past"    && "bg-foreground border-foreground",
        state === "current" && "bg-card border-foreground",
        state === "future"  && "bg-card border-muted-foreground/35",
      )}>
        {state === "current" && (
          <span className="absolute inset-[2px] rounded-full bg-foreground" />
        )}
      </div>
      <span className={cn(
        "text-xs leading-tight whitespace-nowrap",
        state === "current" ? "font-semibold text-foreground"
        : state === "past"  ? "font-medium text-foreground"
        :                     "font-medium text-muted-foreground/60",
      )}>
        {stage.label}
      </span>
    </div>
  );
}

function WizardStepRail({ stages, currentKey }: {
  stages: HeaderProgressStage[];
  currentKey: string;
}) {
  const activeIdx = Math.max(0, stages.findIndex(s => s.key === currentKey));

  // Flat interleave: [node, connector, node, connector, node]
  // Nodes are flex-none; connectors are flex-1 — correct equal distribution.
  const items: ReactNode[] = [];
  stages.forEach((stage, i) => {
    const state: "past" | "current" | "future" =
      i < activeIdx ? "past" : i === activeIdx ? "current" : "future";
    items.push(<WizardNode key={stage.key} stage={stage} state={state} />);
    if (i < stages.length - 1) {
      items.push(
        <div
          key={`c-${i}`}
          className={cn(
            "flex-1 h-[1.5px] mt-[4.75px] mx-1.5",
            i < activeIdx ? "bg-foreground" : "bg-border",
          )}
        />,
      );
    }
  });

  return <div className="flex items-start">{items}</div>;
}

// ── Main row ──────────────────────────────────────────────────────────────────

export function EntityProgressRow({
  progress,
  statuses,
  railExpanded,
  onToggleRail,
  className,
}: EntityProgressRowProps) {
  if (!progress && (!statuses || statuses.length === 0)) return null;

  const stages    = progress?.stages ?? [];
  const activeIdx = progress
    ? Math.max(0, stages.findIndex(s => s.key === progress.currentKey))
    : 0;
  const activeStage = stages[activeIdx];
  const isWizard  = progress?.kind === "wizard";

  return (
    <div className={cn("border-t border-border px-4 py-2 sm:px-5 lg:px-[22px]", className)}>
      {/* Inline summary row */}
      <div className="flex items-center gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

        {/* Pulsing dot + stage label + step counter */}
        {progress && (
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative flex-none flex items-center justify-center w-[14px] h-[14px]">
              <span
                className="absolute inset-0 rounded-full animate-ping bg-foreground/12"
                style={{ animationDuration: "2.4s" }}
              />
              <div className="w-[8px] h-[8px] rounded-full bg-card border-2 border-foreground relative z-[1]">
                <span className="absolute inset-[1.5px] rounded-full bg-foreground" />
              </div>
            </div>
            <span className="text-xs font-semibold text-foreground">{activeStage?.label ?? "—"}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              · Step {activeIdx + 1} / {stages.length}
            </span>
          </div>
        )}

        {/* Separator before status dimensions */}
        {progress && statuses && statuses.length > 0 && (
          <span className="w-px h-3.5 bg-border shrink-0" />
        )}

        {/* P3 status dimensions inline */}
        {statuses && statuses.length > 0 && (
          <EntityStatusStrip statuses={statuses} className="flex-1 min-w-0" />
        )}

        {/* Steps/Timeline toggle — label reflects progress kind */}
        {progress && (
          <button
            type="button"
            onClick={onToggleRail}
            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <span className="font-medium">
              {railExpanded ? "Less" : isWizard ? "Steps" : "Timeline"}
            </span>
            {railExpanded
              ? <ChevronUp   className="h-3 w-3" />
              : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
      </div>

      {/* Expanded content — wizard uses compact stepper; lifecycle uses full timeline */}
      {railExpanded && progress && (
        <div className="mt-3 pt-3 border-t border-dashed border-border">
          {isWizard
            ? <WizardStepRail stages={progress.stages} currentKey={progress.currentKey} />
            : <EntityTimeline progress={progress} />
          }
        </div>
      )}
    </div>
  );
}
