"use client";

import { cn } from "@athyper/theme/utils";
import { resolveSemanticColors } from "@athyper/theme/semantic-colors";
import type { HeaderStatusDimension } from "../types";

export interface EntityStatusStripProps {
  statuses: HeaderStatusDimension[];
  /** When true renders a compact single-line summary chip. */
  compact?: boolean;
  className?: string;
}

function StatusChip({ status }: { status: HeaderStatusDimension }) {
  const { subtleBadge } = resolveSemanticColors(status.intent);
  return (
    <span className={cn(
      "inline-flex items-center h-[18px] px-[6px] rounded-[4px] text-xs font-medium border leading-none whitespace-nowrap",
      subtleBadge,
    )}>
      {status.value}
    </span>
  );
}

export function EntityStatusStrip({ statuses, compact, className }: EntityStatusStripProps) {
  if (statuses.length === 0) return null;

  if (compact) {
    // Pinned mode: inline chips only, no labels.
    return (
      <div className={cn("flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
        {statuses.map(s => <StatusChip key={s.id} status={s} />)}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      {statuses.map(s => (
        <div key={s.id} className="inline-flex items-center gap-[7px] text-xs shrink-0">
          <span className="text-muted-foreground font-medium capitalize">{s.label}</span>
          <StatusChip status={s} />
        </div>
      ))}
    </div>
  );
}
