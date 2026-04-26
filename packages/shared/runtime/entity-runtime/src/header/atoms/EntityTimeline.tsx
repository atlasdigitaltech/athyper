"use client";

import { cn } from "@athyper/theme/utils";
import { resolveSemanticColors } from "@athyper/theme/semantic-colors";
import type { HeaderProgress, HeaderProgressStage, SlaStatus } from "../types";

const SLA_LABEL: Record<SlaStatus, string> = {
  on_track:       "On track",
  at_risk:        "At risk",
  breached:       "Breached",
  completed_ok:   "Within SLA",
  completed_late: "Late",
};

const SLA_INTENT: Record<SlaStatus, "success" | "warning" | "error"> = {
  on_track:       "success",
  at_risk:        "warning",
  breached:       "error",
  completed_ok:   "success",
  completed_late: "error",
};

function SlaBadge({ stage }: { stage: HeaderProgressStage }) {
  if (!stage.slaStatus) return null;
  const { subtleBadge } = resolveSemanticColors(SLA_INTENT[stage.slaStatus]);
  return (
    <span className={cn(
      "inline-flex items-center rounded border px-1 py-px text-[9px] font-semibold leading-none",
      subtleBadge,
    )}>
      {SLA_LABEL[stage.slaStatus]}
    </span>
  );
}

export interface EntityTimelineProps {
  progress: HeaderProgress;
  className?: string;
}

export function EntityTimeline({ progress, className }: EntityTimelineProps) {
  const activeIdx = Math.max(
    0,
    progress.stages.findIndex(s => s.key === progress.currentKey),
  );

  return (
    <div
      className={cn("overflow-x-auto pb-0.5", className)}
      style={{ display: "grid", gridTemplateColumns: `repeat(${progress.stages.length}, minmax(112px, 1fr))` }}
    >
      {progress.stages.map((stage, i) => {
        const isActive = i === activeIdx;
        const isPast   = i < activeIdx;

        return (
          <div key={stage.key} className="min-w-0 pr-2">
            {/* Node + connector */}
            <div className="flex items-center">
              <div className="relative flex-none flex items-center justify-center w-[17px] h-[17px]">
                {isActive && (
                  <span
                    className="absolute inset-0 rounded-full animate-ping bg-foreground/12"
                    style={{ animationDuration: "2.4s" }}
                  />
                )}
                <div className={cn(
                  "w-[11px] h-[11px] rounded-full relative z-[1]",
                  isActive ? "bg-card border-2 border-foreground shadow-[0_0_0_3px_hsl(var(--foreground)/0.07)]"
                  : isPast  ? "bg-foreground border-[1.5px] border-foreground"
                  :            "bg-card border-[1.5px] border-border",
                )}>
                  {isActive && (
                    <span className="absolute inset-[2.5px] rounded-full bg-foreground" />
                  )}
                </div>
              </div>
              {i < progress.stages.length - 1 && (
                <div className={cn("flex-1 h-px ml-1 min-w-[16px]", isPast ? "bg-foreground" : "bg-border")} />
              )}
            </div>

            {/* Labels */}
            <div className="mt-2 space-y-0.5">
              <div className={cn(
                "text-xs leading-tight",
                isActive || isPast ? "font-semibold text-foreground" : "font-medium text-muted-foreground",
              )}>
                {stage.label}
              </div>
              {stage.reachedAt ? (
                <div className="text-xs text-muted-foreground tabular-nums">
                  {stage.reachedAt}{stage.actor ? ` · ${stage.actor}` : ""}
                </div>
              ) : stage.targetAt ? (
                <div className="text-xs text-muted-foreground/50">target {stage.targetAt}</div>
              ) : (
                <div className="text-xs text-muted-foreground/40">—</div>
              )}
              {(stage.durationLabel || stage.slaStatus) && (
                <div className="flex items-center gap-1 pt-0.5 flex-wrap">
                  {stage.durationLabel && (
                    <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
                      {isActive ? "⏱ " : ""}{stage.durationLabel}
                    </span>
                  )}
                  <SlaBadge stage={stage} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
