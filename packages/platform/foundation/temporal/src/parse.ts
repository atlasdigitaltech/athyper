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

import { z } from "zod";
import type { ZonedDateTimeValue } from "./kinds";

const BUSINESS_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const INSTANT_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?Z$/;
const LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;
const IANA_ZONE_RE = /^[A-Za-z][A-Za-z0-9_+\-]*(?:\/[A-Za-z][A-Za-z0-9_+\-]*)*$/;

export class TemporalParseError extends Error {
  constructor(public readonly kind: string, public readonly raw: unknown) {
    let repr: string;
    try {
      repr = JSON.stringify(raw);
    } catch {
      repr = String(raw);
    }
    super(`[temporal] Invalid ${kind} value: ${repr}`);
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
  // Validate time component ranges — the regex catches structure but not
  // semantic ranges (e.g. "T25:99:00Z" would pass the regex).
  const tIdx = raw.indexOf("T");
  const timePart = raw.slice(tIdx + 1, -1); // strip T prefix and Z suffix
  const [hStr, miStr, sStr = "00"] = timePart.split(":") as [string, string, string];
  const h = Number(hStr);
  const mi = Number(miStr);
  const s = parseFloat(sStr);
  if (h > 23 || mi > 59 || s >= 60) {
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

// ─── Zod refinement schemas ───────────────────────────────────────────────────

/**
 * Zod schema that validates and brands a businessDate string. Use at API
 * boundaries where you want declarative validation in a schema chain.
 */
export const BusinessDateSchema = z
  .string()
  .refine(
    (v) => {
      try {
        parseBusinessDate(v);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Must be a valid YYYY-MM-DD business date" },
  );

/**
 * Zod schema that validates an instant (ISO 8601 UTC with literal Z).
 */
export const InstantSchema = z
  .string()
  .refine(
    (v) => {
      try {
        parseInstant(v);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Must be a valid ISO 8601 UTC instant (e.g. 2026-06-30T14:45:00Z)" },
  );

// ─── Internals ───────────────────────────────────────────────────────────────

function isValidCalendarDay(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= lastDay;
}

// Single-allocation IANA zone cache. Creating Intl.DateTimeFormat per call
// was measurably hot in calendar grid renders (thousands of cells per mount).
const _ianaZoneCache = new Map<string, boolean>();

/**
 * Runtime check — the only way to know if a zone string is valid is to ask the
 * platform. Intl.DateTimeFormat throws RangeError on bad zone names.
 * Results are cached for the lifetime of the process.
 */
function isValidIanaZone(value: string): boolean {
  if (!IANA_ZONE_RE.test(value)) return false;
  const cached = _ianaZoneCache.get(value);
  if (cached !== undefined) return cached;
  let valid: boolean;
  try {
    // eslint-disable-next-line no-direct-date-parse -- bootstrap probe; restricted to this helper
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
    valid = true;
  } catch {
    valid = false;
  }
  _ianaZoneCache.set(value, valid);
  return valid;
}
