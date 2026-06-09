"use client";

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@athyper/ui/primitives";
import { periodLabel } from "../lib/period";

interface PeriodSelectorProps {
  fiscalYear: number;
  period: number | null;
  onChange: (fiscalYear: number, period: number | null) => void;
  /** Show adjustment periods 13-16 */
  showAdjustment?: boolean;
  /** Show "Full year" option (period = null) */
  showFullYear?: boolean;
  size?: "sm" | "md";
}

export function PeriodSelector({
  fiscalYear,
  period,
  onChange,
  showAdjustment = false,
  showFullYear = true,
  size = "sm",
}: PeriodSelectorProps) {
  const triggerClass = size === "sm" ? "h-6 w-36 text-xs" : "h-7 w-44 text-xs";
  const yearTriggerClass = size === "sm" ? "h-6 w-20 text-xs" : "h-7 w-24 text-xs";

  const currentPeriodValue = period === null ? "all" : String(period);

  const years = [fiscalYear - 1, fiscalYear, fiscalYear + 1];

  const periods: Array<{ value: string; label: string }> = [];
  if (showFullYear) periods.push({ value: "all", label: "Full year" });
  periods.push({ value: "0", label: "Opening balances" });
  for (let p = 1; p <= 12; p++) {
    periods.push({ value: String(p), label: periodLabel(fiscalYear, p) });
  }
  if (showAdjustment) {
    for (let p = 13; p <= 16; p++) {
      periods.push({ value: String(p), label: periodLabel(fiscalYear, p) });
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Select
        value={String(fiscalYear)}
        onValueChange={(v) => onChange(Number(v), period)}
      >
        <SelectTrigger className={yearTriggerClass}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>FY {y}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={currentPeriodValue}
        onValueChange={(v) => onChange(fiscalYear, v === "all" ? null : Number(v))}
      >
        <SelectTrigger className={triggerClass}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {periods.map(({ value, label }) => (
            <SelectItem key={value} value={value}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
