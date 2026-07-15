/**
 * Pure calendar arithmetic on "YYYY-MM-DD" strings. Every helper here is
 * timezone-immune — the strings are treated as calendar dates, never as
 * moments. That means:
 *
 *   addDaysISO("2026-06-30", 1) → "2026-07-01"
 *
 * regardless of the caller's timezone. The internal `Date` construction uses
 * UTC noon as a stable anchor to dodge DST transitions.
 *
 * These helpers are the building blocks for the DateRangePicker presets
 * (@athyper/finance-rules::resolveDateRangePreset).
 */

import { parseBusinessDate } from "./parse";
import type { WeekStart } from "./kinds";

function parts(iso: string): [number, number, number] {
  const s = parseBusinessDate(iso);
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  return [y, m, d];
}

function toISO(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Adds `days` (may be negative) to `iso`. Returns "YYYY-MM-DD".
 * Uses Date arithmetic via UTC noon anchor — the string round-trips
 * cleanly regardless of the caller's timezone.
 */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = parts(iso);
  // eslint-disable-next-line no-direct-date-parse -- reason: numeric UTC construction with noon anchor; no string parsing
  const anchor = Date.UTC(y, m - 1, d, 12);
  const shifted = new Date(anchor + days * 86400000);
  return toISO(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

/** Adds calendar months. Clamps day-of-month to the last valid day of the target month. */
export function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = parts(iso);
  const totalMonths = (y * 12 + (m - 1)) + months;
  const ty = Math.floor(totalMonths / 12);
  const tm = (totalMonths % 12) + 1;
  const lastDay = daysInMonth(ty, tm);
  return toISO(ty, tm, Math.min(d, lastDay));
}

/** First day of the calendar month containing `iso`. */
export function startOfMonthISO(iso: string): string {
  const [y, m] = parts(iso);
  return toISO(y, m, 1);
}

/** Last day of the calendar month containing `iso`. */
export function endOfMonthISO(iso: string): string {
  const [y, m] = parts(iso);
  return toISO(y, m, daysInMonth(y, m));
}

/**
 * First day of the week containing `iso`, honouring locale weekStart.
 *   weekStart=0 (Sun) → previous Sunday (or same day if `iso` is a Sunday)
 *   weekStart=1 (Mon) → previous Monday
 *   weekStart=6 (Sat) → previous Saturday
 */
export function startOfWeekISO(iso: string, weekStart: WeekStart): string {
  const [y, m, d] = parts(iso);
  // eslint-disable-next-line no-direct-date-parse -- reason: numeric UTC construction with noon anchor
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(); // 0=Sun..6=Sat
  const back = (dow - weekStart + 7) % 7;
  return addDaysISO(iso, -back);
}

/** Last day of the week containing `iso` (start-of-week + 6). */
export function endOfWeekISO(iso: string, weekStart: WeekStart): string {
  return addDaysISO(startOfWeekISO(iso, weekStart), 6);
}

/** First day of the calendar year containing `iso`. */
export function startOfYearISO(iso: string): string {
  const [y] = parts(iso);
  return toISO(y, 1, 1);
}

/** Last day of the calendar year containing `iso`. */
export function endOfYearISO(iso: string): string {
  const [y] = parts(iso);
  return toISO(y, 12, 31);
}

function daysInMonth(year: number, month: number): number {
  // eslint-disable-next-line no-direct-date-parse -- reason: numeric UTC construction for month-length arithmetic
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
