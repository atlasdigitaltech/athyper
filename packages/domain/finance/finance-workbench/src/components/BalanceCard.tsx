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
    variant === "positive" || isBalanced ? "bg-emerald-50" :
    variant === "negative" || (variant === "check" && !isBalanced) ? "bg-destructive/5" :
    "bg-muted/50";

  const textColor =
    variant === "positive" || isBalanced ? "text-emerald-700" :
    variant === "negative" || (variant === "check" && !isBalanced) ? "text-destructive" :
    "text-foreground";

  const displayValue = variant === "check"
    ? (isBalanced ? "Balanced" : fmtCompact(value) + " difference")
    : (compact ? fmtCompact(value) : fmtFull(value));

  return (
    <div className={cn("rounded-md px-2.5 py-2", bg)}>
      <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground mb-0.5">
        {label}
      </div>
      <span className={cn("text-base font-semibold font-mono", textColor)}>
        {displayValue}
      </span>
    </div>
  );
}
