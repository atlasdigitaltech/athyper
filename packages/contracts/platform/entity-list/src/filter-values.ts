import type { JsonValue, ListFilterOperator } from "./types";

/** A calendar day: `YYYY-MM-DD`, a real date, never an instant. */
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** An RFC 3339 instant with a required offset (`Z` or `±HH:MM`). A local time
 * without an offset is invalid: PostgreSQL would read it in the session time
 * zone and silently shift the comparison. */
const INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/;

function realDay(year: string, month: string, day: string): boolean {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day);
}

/** True for a calendar-day filter value (`YYYY-MM-DD`). */
export function isListDateValue(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DATE.exec(value);
  return match !== null && realDay(match[1]!, match[2]!, match[3]!);
}

/** True for an instant filter value: RFC 3339 with seconds and an explicit offset. */
export function isListInstantValue(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = INSTANT.exec(value);
  if (!match || !realDay(match[1]!, match[2]!, match[3]!)) return false;
  if (Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6]) > 59) return false;
  if (match[8] !== "Z" && (Number(match[10]) > 23 || Number(match[11]) > 59)) return false;
  return true;
}

/** Operators whose value is compared with a date or datetime column. */
const COMPARED = new Set<ListFilterOperator>(["eq", "ne", "gt", "gte", "lt", "lte", "between", "in"]);

/** Checks a filter value against its field's declared temporal kind. Returns
 * a reason when the value would not be compared exactly as written, or
 * undefined when it is valid (or the field or operator is not temporal).
 * `relative` uses its own closed vocabulary; presence operators carry no value. */
export function temporalFilterValueError(
  kind: string | undefined,
  operator: ListFilterOperator,
  value: JsonValue | undefined,
): string | undefined {
  if ((kind !== "date" && kind !== "datetime") || !COMPARED.has(operator)) return undefined;
  const valid = kind === "date" ? isListDateValue : isListInstantValue;
  const expected = kind === "date" ? "a YYYY-MM-DD date" : "an RFC 3339 date-time with an explicit offset";
  if ((operator === "eq" || operator === "ne") && value === null) return undefined;
  const values = operator === "between" || operator === "in" ? (Array.isArray(value) ? value : [value]) : [value];
  return values.every(valid) ? undefined : `must be ${expected}`;
}
