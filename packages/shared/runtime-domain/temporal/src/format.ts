/**
 * Formatters. Each one mirrors a parser — same kind, opposite direction.
 *
 * Formatters NEVER mutate the stored value. They take the canonical wire form
 * and produce a localised string for display. If you find yourself wanting to
 * "format then parse back," you're treating display as storage — stop and use
 * the canonical form instead.
 *
 * Calendar systems (Phase 5):
 *   When the locale carries a `-u-ca-…` calendar extension (e.g.
 *   "ar-SA-u-ca-islamic-umalqura" for Umm al-Qura Hijri, or
 *   "ja-JP-u-ca-japanese" for Reiwa-era Japanese), formatBusinessDate
 *   bypasses the sprintf template (whose numeric tokens %d/%m/%Y are
 *   Gregorian-only) and uses native Intl formatting in the requested
 *   calendar. Storage stays Gregorian — the alternative calendar is
 *   presentational only.
 */

import { parseBusinessDate, parseInstant, parseZonedDateTime } from "./parse";
import type { ZonedDateTimeValue } from "./kinds";

export interface FormatBusinessDateOptions {
  /** BCP-47 locale tag, e.g. "ar-SA", "en-GB". */
  locale: string;
  /**
   * Optional sprintf template matching @athyper/runtime-shared/date-format.ts.
   * If omitted, falls back to Intl medium date style ("30 Jun 2026").
   */
  template?: string;
}

export interface FormatInstantOptions {
  locale: string;
  /** IANA zone in which to render (e.g. "Asia/Tokyo"). Default: UTC. */
  timeZone?: string;
  /** Default "medium". */
  dateStyle?: "short" | "medium" | "long" | "full";
  /** Default "short". */
  timeStyle?: "short" | "medium" | "long" | "full";
}

export interface FormatZonedDateTimeOptions {
  locale: string;
  /** Default "medium". */
  dateStyle?: "short" | "medium" | "long" | "full";
  /** Default "short". */
  timeStyle?: "short" | "medium" | "long" | "full";
  /** Append the zone label (e.g. "29 Jul 2026, 18:00 Asia/Riyadh"). Default true. */
  showZone?: boolean;
}

/**
 * "2026-06-30" → "30 Jun 2026" (en) / "30/06/2026" (ar-SA Gregorian) / etc.
 *
 * Pure string-level — never touches `Date`. This avoids the entire class of
 * "midnight UTC vs midnight local" bugs that haunt date display.
 *
 * If `options.locale` requests an alternative calendar (`-u-ca-…` extension),
 * the sprintf template is bypassed and the formatter falls through to native
 * Intl — otherwise %d/%m/%Y would render Gregorian numerics inside a Hijri
 * locale, which is the wrong answer.
 */
export function formatBusinessDate(value: string, options: FormatBusinessDateOptions): string {
  const ymd = parseBusinessDate(value);
  const useNative = !options.template || localeUsesAlternativeCalendar(options.locale);
  if (!useNative && options.template) {
    return applyTemplate(ymd, options.locale, options.template);
  }
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(options.locale, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  }).format(Date.UTC(y, m - 1, d, 12) as unknown as Date);
}

/**
 * Returns true when the locale tag carries a non-Gregorian calendar via the
 * `-u-ca-…` BCP-47 extension. Used by formatters and CalendarGrid to decide
 * whether the locale wants alternative-calendar rendering.
 *
 *   "ar-SA-u-ca-islamic-umalqura" → true
 *   "ja-JP-u-ca-japanese"          → true
 *   "en-GB"                        → false
 *   "ar-SA"                        → false  (Gregorian, even though country is Saudi)
 */
export function localeUsesAlternativeCalendar(locale: string): boolean {
  return /-u-ca-(?!gregor(?:y|ian))/.test(locale.toLowerCase());
}

/**
 * Format a Gregorian YMD as a day-number string in the locale's calendar.
 * Used by CalendarGrid for cell day labels — gives Hijri day numbers under
 * `ar-SA-u-ca-islamic-umalqura`, Gregorian (1-31) elsewhere.
 *
 * Pure-Intl, no Date string parsing — anchors at UTC noon to dodge DST and
 * timezone shifts.
 */
export function formatDayNumber(ymd: string, locale: string): string {
  const [y, m, d] = parseBusinessDate(ymd).split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    timeZone: "UTC",
  }).format(Date.UTC(y, m - 1, d, 12) as unknown as Date);
}

/** "2026-06-30T18:45:00Z" → "30 Jun 2026, 23:45" (Asia/Tokyo) etc. */
export function formatInstant(value: string, options: FormatInstantOptions): string {
  parseInstant(value);
  const ms = Date.parse(value); // safe: regex above already validated; Date.parse on canonical UTC ISO is well-defined
  return new Intl.DateTimeFormat(options.locale, {
    dateStyle: options.dateStyle ?? "medium",
    timeStyle: options.timeStyle ?? "short",
    timeZone: options.timeZone ?? "UTC",
  }).format(ms);
}

/**
 * { localDateTime: "2026-06-30T18:00:00", timeZone: "Asia/Riyadh" }
 *   → "30 Jun 2026, 18:00 Asia/Riyadh" (en) — always shows the bound zone.
 *
 * NEVER silently converts a zonedDateTime to the user's TZ. That's the whole
 * point of the kind: this clock means 18:00 in Riyadh, regardless of who's
 * looking. Conversion would defeat the contract.
 */
export function formatZonedDateTime(value: ZonedDateTimeValue, options: FormatZonedDateTimeOptions): string {
  const v = parseZonedDateTime(value);
  // Build a "moment" by treating localDateTime as if it were in v.timeZone.
  // We do NOT need to compute the UTC equivalent for display — we render the
  // wall-clock components directly.
  const [datePart, timePart] = v.localDateTime.split("T") as [string, string];
  const [y, mo, d] = datePart.split("-").map(Number) as [number, number, number];
  const [h, mi] = timePart.split(":").map(Number) as [number, number];

  const dateText = new Intl.DateTimeFormat(options.locale, {
    dateStyle: options.dateStyle ?? "medium",
    timeZone: "UTC",
  }).format(Date.UTC(y, mo - 1, d, 12));
  const timeText = `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
  const zoneSuffix = options.showZone === false ? "" : ` ${v.timeZone}`;
  return `${dateText}, ${timeText}${zoneSuffix}`;
}

// ─── Internals ───────────────────────────────────────────────────────────────

function applyTemplate(ymd: string, locale: string, template: string): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const dd = String(d).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const yyyy = String(y);
  const monthShort = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" })
    .format(Date.UTC(y, m - 1, 1, 12));
  const monthLong = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" })
    .format(Date.UTC(y, m - 1, 1, 12));
  return template
    .replaceAll("%d", dd)
    .replaceAll("%m", mm)
    .replaceAll("%Y", yyyy)
    .replaceAll("%b", monthShort)
    .replaceAll("%B", monthLong);
}
