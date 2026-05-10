"use client";

import { cn } from "@athyper/theme/utils";
import { fmtCompact, fmtFull } from "./format";

interface BalanceCardProps {
  label: string;
  value: number;
  variant?: "neutral" | "positive" | "negative" | "check";
  compact?: boolean;
}

export function BalanceCard({ label, value, variant = "neutral", compact = false }: BalanceCardProps) {
  const isBalanced = variant === "check" && value === 0;
  const bg =
    variant === "positive" || isBalanced ? "bg-success/10" :
    variant === "negative" || (variant === "check" && !isBalanced) ? "bg-destructive/5" :
    "bg-muted/50";

  const textColor =
    variant === "positive" || isBalanced ? "text-success" :
    variant === "negative" || (variant === "check" && !isBalanced) ? "text-destructive" :
    "text-foreground";

  const displayValue = variant === "check"
    ? (isBalanced ? "Balanced" : fmtCompact(value) + " difference")
    : (compact ? fmtCompact(value) : fmtFull(value));

  return (
    <div className={cn("rounded-lg px-3 py-2.5", bg)}>
      <div className="mb-1 text-xs font-medium text-muted-foreground">
        {label}
      </div>
      <span className={cn("text-sm font-semibold tabular-nums", textColor)}>
        {displayValue}
      </span>
    </div>
  );
}
