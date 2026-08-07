"use client";

import { cn } from "@athyper/platform-theme/utils";
import { AccountingPeriodStatusChip } from "@athyper/platform-ui";
import { periodLabel, type FiscalPeriodStatus } from "../lib/period";

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
        <AccountingPeriodStatusChip status={status} className="px-2 py-0.5" />
      )}
      {(status === "hard_close") && (
        <span className="text-destructive">Read only</span>
      )}
    </div>
  );
}
