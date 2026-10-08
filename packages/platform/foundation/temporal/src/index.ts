const OFFSET_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;
const BUSINESS_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const HTTP_DATE =
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/u;

/**
 * Parse an unambiguous instant without accepting implementation-dependent
 * local-time strings. Invalid or ambiguous input returns NaN, matching the
 * useful failure behavior of Date.parse while centralizing accepted formats.
 */
export function parseInstant(value: string): number {
  if (typeof value !== "string") return Number.NaN;
  if (OFFSET_TIMESTAMP.test(value) || HTTP_DATE.test(value))
    return Date.parse(value);
  if (BUSINESS_DATE.test(value)) return parseBusinessDate(value);
  return Number.NaN;
}

/** Validate PostgreSQL's offset-bearing text form without rewriting a cursor.
 * Callers must retain the original string to preserve sub-millisecond ordering. */
export function parseDatabaseInstant(value: string): number {
  if (typeof value !== "string") return Number.NaN;
  const match =
    /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?)([+-]\d{2})(?::(\d{2}))?$/u.exec(
      value,
    );
  return match
    ? parseInstant(`${match[1]}T${match[2]}${match[3]}:${match[4] ?? "00"}`)
    : parseInstant(value);
}

/** Parse YYYY-MM-DD as a calendar date anchored at midnight UTC. */
export function parseBusinessDate(value: string): number {
  const match = BUSINESS_DATE.exec(value);
  if (!match) return Number.NaN;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const result = Date.UTC(year, month - 1, day);
  const roundTrip = new Date(result);
  return roundTrip.getUTCFullYear() === year &&
    roundTrip.getUTCMonth() === month - 1 &&
    roundTrip.getUTCDate() === day
    ? result
    : Number.NaN;
}
export * from "./date-scale";
