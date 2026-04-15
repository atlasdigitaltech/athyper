/* ---------------------------------------------------------------------------
   Period utilities — fiscal period labels, status helpers, navigation.
   --------------------------------------------------------------------------- */

import { resolveSemanticColors } from "@athyper/theme";

export type FiscalPeriodStatus =
  | "future"
  | "open"
  | "soft_close"
  | "hard_close";

export interface FiscalPeriodInfo {
  fiscalYear: number;
  period: number;
  label: string;       // e.g. "Apr 2026"
  isAdjustment: boolean;
  status: FiscalPeriodStatus | null;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Returns a human-readable label for a period.
 * Period 0 = "Opening YYYY"
 * Periods 1-12 = calendar month name + year (assuming Jan=1 fiscal start)
 * Periods 13-16 = "Adj-1 YYYY" ... "Adj-4 YYYY"
 */
export function periodLabel(
  fiscalYear: number,
  period: number,
  fiscalYearStartMonth = 1,
): string {
  if (period === 0) return `Opening ${fiscalYear}`;
  if (period >= 13) return `Adj-${period - 12} ${fiscalYear}`;

  const calendarMonth = ((fiscalYearStartMonth - 1 + period - 1) % 12) + 1;
  const calendarYear =
    fiscalYearStartMonth === 1
      ? fiscalYear
      : calendarMonth < fiscalYearStartMonth
        ? fiscalYear + 1
        : fiscalYear;
  return `${MONTH_NAMES[calendarMonth - 1]} ${calendarYear}`;
}

/** Returns true when the period is currently postable (open or soft_close). */
export function isPostablePeriod(status: FiscalPeriodStatus | null): boolean {
  return status === "open" || status === "soft_close";
}

/** Returns the prior fiscal year and period for comparative display. */
export function priorYearPeriod(
  fiscalYear: number,
  period: number | null,
): { fiscalYear: number; period: number | null } {
  return { fiscalYear: fiscalYear - 1, period };
}

/** Color class for a period status badge. */
export function periodStatusColor(status: FiscalPeriodStatus | null): string {
  switch (status) {
    case "open":       return resolveSemanticColors("success").subtleBadge;
    case "soft_close": return resolveSemanticColors("warning").subtleBadge;
    case "hard_close": return resolveSemanticColors("error").subtleBadge;
    case "future":     return resolveSemanticColors("neutral").subtleBadge;
    default:           return resolveSemanticColors("neutral").subtleBadge;
  }
}

/** Short label for a period status. */
export function periodStatusLabel(status: FiscalPeriodStatus | null): string {
  switch (status) {
    case "open":       return "Open";
    case "soft_close": return "Soft closed";
    case "hard_close": return "Hard closed";
    case "future":     return "Future";
    default:           return "Unknown";
  }
}
