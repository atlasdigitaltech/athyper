"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import type { HeaderProgress, HeaderStatusDimension } from "../types";
import { EntityStatusStrip } from "./EntityStatusStrip";
import { EntityTimeline } from "./EntityTimeline";

export interface EntityProgressRowProps {
  progress?: HeaderProgress;
  statuses?: HeaderStatusDimension[];
  railExpanded: boolean;
  onToggleRail: () => void;
  className?: string;
}

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

        {/* Steps/Timeline toggle — pushed to far right; label reflects progress kind */}
        {progress && (
          <button
            type="button"
            onClick={onToggleRail}
            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <span className="font-medium">
              {railExpanded ? "Less" : progress.kind === "wizard" ? "Steps" : "Timeline"}
            </span>
            {railExpanded
              ? <ChevronUp   className="h-3 w-3" />
              : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
      </div>

      {/* Expanded timeline grid */}
      {railExpanded && progress && (
        <div className="mt-3 pt-3 border-t border-dashed border-border">
          <EntityTimeline progress={progress} />
        </div>
      )}
    </div>
  );
}
