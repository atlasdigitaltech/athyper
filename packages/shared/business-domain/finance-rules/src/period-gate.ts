/**
 * Period gate - shared forward-posting predicate consumed by UI affordances and
 * server-side parity checks.
 *
 * Forward posting is allowed only when BOTH fiscal and book period status are
 * open or soft_close. A missing book-period row is treated as "future".
 *
 * The database trigger has one operation-specific carve-out: updating a posted
 * journal entry to reversed bypasses the period gate. Keep that explicit in
 * PeriodGateDecision instead of folding it into the forward-posting boolean.
 */

import { parseBusinessDate } from "@athyper/temporal";

export type FiscalPeriodStatus = "open" | "soft_close" | "hard_close" | "future";

export interface PeriodStatusRow {
  /** Fiscal-period status. `null` means the caller could not resolve a period. */
  fiscalPeriodStatus: FiscalPeriodStatus | null;
  /** Book-period status. `null` is treated as a missing/unopened book row. */
  bookPeriodStatus: FiscalPeriodStatus | null;
}

export interface PeriodAddress {
  companyCodeId: string;
  bookId: string;
  fiscalYear: number;
  periodNumber: number;
}

export type PeriodGateOperation = "forward_posting" | "reversal";

export type PeriodGateDecision =
  | { allowed: true; reason: "forward_open" | "reversal_exempt" }
  | { allowed: false; reason: "fiscal_not_open" | "book_not_open" | "book_missing" };

/** Mirrors the trigger's posted -> reversed early return. */
export function isReversalGateExempt(input: {
  operation?: PeriodGateOperation;
  oldStatus?: string | null;
  newStatus?: string | null;
}): boolean {
  return input.operation === "reversal"
    || (input.oldStatus === "posted" && input.newStatus === "reversed");
}

/**
 * Structured period-gate decision. Consumers should render the reason code
 * instead of recomputing their own "locked" or "adjustment" messages.
 */
export function decidePeriodGate(
  status: PeriodStatusRow,
  operation: PeriodGateOperation = "forward_posting",
): PeriodGateDecision {
  if (operation === "reversal") return { allowed: true, reason: "reversal_exempt" };

  const fp = status.fiscalPeriodStatus;
  const bps = status.bookPeriodStatus;

  if (fp !== "open" && fp !== "soft_close") {
    return { allowed: false, reason: "fiscal_not_open" };
  }
  if (bps == null) {
    return { allowed: false, reason: "book_missing" };
  }
  if (bps !== "open" && bps !== "soft_close") {
    return { allowed: false, reason: "book_not_open" };
  }
  return { allowed: true, reason: "forward_open" };
}

/**
 * Compatibility boolean for existing date pickers and posting preflight checks.
 * New UI should prefer decidePeriodGate() so it can render a stable reason.
 */
export function isPostingAllowed(status: PeriodStatusRow): boolean {
  return decidePeriodGate(status).allowed;
}

export function isForwardPostingAllowed(status: PeriodStatusRow): boolean {
  return decidePeriodGate(status, "forward_posting").allowed;
}

/**
 * Convenience wrapper used by the DatePicker layer. Validates the date string
 * (so callers cannot pass a Date object that would silently TZ-shift), then
 * delegates the actual decision to `isPostingAllowed`.
 *
 * Resolution of (date -> fiscalYear + periodNumber) belongs to the caller. It
 * depends on the company-code fiscal calendar and is not pure from the date.
 */
export function isPostingDateOpen(date: string, status: PeriodStatusRow): boolean {
  parseBusinessDate(date);
  return isPostingAllowed(status);
}

/**
 * Most restrictive of the two lifecycle statuses for display. This is not the
 * same as postability; consumers should use decidePeriodGate() for allow/block.
 */
export function effectivePeriodStatus(status: PeriodStatusRow): FiscalPeriodStatus | null {
  const rank: Record<FiscalPeriodStatus, number> = {
    hard_close: 4,
    soft_close: 3,
    future: 2,
    open: 1,
  };
  const values = [status.fiscalPeriodStatus, status.bookPeriodStatus]
    .filter((value): value is FiscalPeriodStatus => value != null);
  if (values.length === 0) return null;
  return values.sort((a, b) => rank[b] - rank[a])[0]!;
}

export type PeriodCalendar = ReadonlyMap<string, PeriodStatusRow>;

export function periodCalendarKey(fiscalYear: number, period: number): string {
  return `${fiscalYear}:${period}`;
}

/**
 * Maps a calendar date to its fiscal (year, period) given the company-code's
 * fiscal-year start month.
 */
export function dateToFiscalPoint(
  date: string,
  fiscalYearStartMonth: number,
): { fiscalYear: number; period: number } | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(date);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (fiscalYearStartMonth < 1 || fiscalYearStartMonth > 12) return null;
  const shifted = (month - fiscalYearStartMonth + 12) % 12;
  const period = shifted + 1;
  const fiscalYear = month < fiscalYearStartMonth ? year - 1 : year;
  return { fiscalYear, period };
}

/**
 * Calendar-driven gate used by posting-date fields. Returns true when the
 * computed fiscal period row exists and passes the forward-posting gate.
 */
export function isPostingDateAllowedInCalendar(
  date: string,
  fiscalYearStartMonth: number,
  calendar: PeriodCalendar,
): boolean {
  const point = dateToFiscalPoint(date, fiscalYearStartMonth);
  if (!point) return true;
  const row = calendar.get(periodCalendarKey(point.fiscalYear, point.period));
  if (!row) return isPostingAllowed({ fiscalPeriodStatus: null, bookPeriodStatus: null });
  return isPostingAllowed(row);
}
