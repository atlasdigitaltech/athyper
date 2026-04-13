"use client";

import { cn } from "@athyper/theme/utils";
import { periodLabel, periodStatusColor, periodStatusLabel } from "../lib/period";
import type { FiscalPeriodStatus } from "../lib/period";

interface PeriodStatusBarProps {
  fiscalYear: number;
  period: number | null;
  status: FiscalPeriodStatus | null;
  companyCode?: string;
  className?: string;
}

export function PeriodStatusBar({
  fiscalYear,
  period,
  status,
  companyCode,
  className,
}: PeriodStatusBarProps) {
  const label = period !== null && period !== undefined
    ? periodLabel(fiscalYear, period)
    : `FY ${fiscalYear}`;

  return (
    <div className={cn("flex items-center gap-1.5 text-[10px]", className)}>
      {companyCode && (
        <span className="font-mono text-muted-foreground">{companyCode}</span>
      )}
      <span className="text-muted-foreground">{label}</span>
      {status && (
        <span className={cn("px-1.5 py-0 rounded border text-[9px] font-medium", periodStatusColor(status))}>
          {periodStatusLabel(status)}
        </span>
      )}
      {(status === "hard_close") && (
        <span className="text-destructive">Read only</span>
      )}
    </div>
  );
}
