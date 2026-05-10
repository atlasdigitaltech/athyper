"use client";

import { cn } from "@athyper/theme/utils";
import { fmtCompact, fmtFull } from "./format";

interface AmountCellProps {
  value: number;
  compact?: boolean;
  className?: string;
  /** When true, negative values get text-destructive coloring. Default true. */
  colorize?: boolean;
  /** When true, zero renders as a muted dash. Default false. */
  dashZero?: boolean;
}

export function AmountCell({
  value,
  compact = true,
  className,
  colorize = true,
  dashZero = false,
}: AmountCellProps) {
  if (dashZero && value === 0) {
    return (
      <span className={cn("tabular-nums text-muted-foreground/40", className)}>
        —
      </span>
    );
  }

  const color = colorize
    ? value < 0
      ? "text-destructive"
      : value === 0
        ? "text-muted-foreground"
        : ""
    : "";

  return (
    <span className={cn("tabular-nums", color, className)}>
      {compact ? fmtCompact(value) : fmtFull(value)}
    </span>
  );
}
