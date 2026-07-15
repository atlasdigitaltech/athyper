/**
 * Strict parsers. Each one accepts ONLY the canonical wire form for its kind
 * and rejects anything else. These are the boundary guards — Zod schemas in
 * @athyper/api-contracts and BFF routes refine through them so a malformed
 * value cannot reach storage.
 *
 * Why strict? The lax form `new Date(str)` silently accepts (and silently
 * misinterprets) almost any string. `new Date("2026-06-30")` is UTC midnight;
 * `new Date("2026-06-30T00:00:00")` is local midnight. That one-character
 * difference shifts the displayed date by ±1 day in any non-UTC zone.
 */

import type { ZonedDateTimeValue } from "./kinds";

const BUSINESS_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const INSTANT_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?Z$/;
const LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;
const IANA_ZONE_RE = /^[A-Za-z][A-Za-z0-9_+\-]*(?:\/[A-Za-z][A-Za-z0-9_+\-]*)*$/;

export class TemporalParseError extends Error {
  constructor(public readonly kind: string, public readonly raw: unknown) {
    super(`[temporal] Invalid ${kind} value: ${JSON.stringify(raw)}`);
    this.name = "TemporalParseError";
  }
}

/**
 * Accepts ONLY "YYYY-MM-DD" with valid calendar components. Rejects any
 * trailing time, offset, or 'T' character. Returns the same string so callers
 * can use it as a brand check (no transformation, just validation).
 */
export function parseBusinessDate(raw: unknown): string {
  if (typeof raw !== "string" || !BUSINESS_DATE_RE.test(raw)) {
    throw new TemporalParseError("businessDate", raw);
  }
  const [y, m, d] = raw.split("-").map(Number) as [number, number, number];
  if (!isValidCalendarDay(y, m, d)) {
    throw new TemporalParseError("businessDate", raw);
  }
  return raw;
}

/**
 * Accepts ONLY ISO 8601 UTC strings — must end in literal "Z". Rejects naked
 * "YYYY-MM-DD" (those are businessDate), rejects local datetimes without
 * offset, rejects "+HH:MM" offsets (those should be normalised to UTC at the
 * boundary). Returns the same string.
 */
export function parseInstant(raw: unknown): string {
  if (typeof raw !== "string" || !INSTANT_ISO_RE.test(raw)) {
    throw new TemporalParseError("instant", raw);
  }
  return raw;
}

/**
 * Accepts ONLY the two-field object form. Rejects bracketed strings
 * ("2026-06-30T18:00:00[Asia/Riyadh]") even though the picker uses them
 * internally — they must not cross the wire. Validates both pieces.
 */
export function parseZonedDateTime(raw: unknown): ZonedDateTimeValue {
  if (raw === null || typeof raw !== "object") {
    throw new TemporalParseError("zonedDateTime", raw);
  }
  const obj = raw as { localDateTime?: unknown; timeZone?: unknown };
  if (typeof obj.localDateTime !== "string" || !LOCAL_DATETIME_RE.test(obj.localDateTime)) {
    throw new TemporalParseError("zonedDateTime", raw);
  }
  if (typeof obj.timeZone !== "string" || !isValidIanaZone(obj.timeZone)) {
    throw new TemporalParseError("zonedDateTime", raw);
  }
  return { localDateTime: obj.localDateTime, timeZone: obj.timeZone };
}

// ─── Internals ───────────────────────────────────────────────────────────────

function isValidCalendarDay(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= lastDay;
}

/**
 * Runtime check — the only way to know if a zone string is valid is to ask the
 * platform. Intl.DateTimeFormat throws RangeError on bad zone names.
 */
function isValidIanaZone(value: string): boolean {
  if (!IANA_ZONE_RE.test(value)) return false;
  try {
    // eslint-disable-next-line no-direct-date-parse -- bootstrap probe; restricted to this helper
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}
