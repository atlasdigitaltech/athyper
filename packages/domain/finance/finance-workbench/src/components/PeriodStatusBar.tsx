"use client";

import { cn } from "@athyper/theme/utils";
import { periodLabel, periodStatusColor, periodStatusLabel, type FiscalPeriodStatus } from "../lib/period";

interface PeriodStatusBarProps {
  fiscalYear: number;
  period: number | null;
  status: FiscalPeriodStatus | null;
  companyCode?: string;
  className?: string;
  displayLabel?: string;
}

export function PeriodStatusBar({
  fiscalYear,
  period,
  status,
  companyCode,
  className,
  displayLabel,
}: PeriodStatusBarProps) {
  const label = displayLabel ?? (period !== null && period !== undefined
    ? periodLabel(fiscalYear, period)
    : `FY ${fiscalYear}`);

  return (
    <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      {companyCode && (
        <span>{companyCode}</span>
      )}
      <span>{label}</span>
      {status && (
        <span className={cn("rounded-full border px-2 py-0.5 font-medium leading-none", periodStatusColor(status))}>
          {periodStatusLabel(status)}
        </span>
      )}
      {(status === "hard_close") && (
        <span className="text-destructive">Read only</span>
      )}
    </div>
  );
}
