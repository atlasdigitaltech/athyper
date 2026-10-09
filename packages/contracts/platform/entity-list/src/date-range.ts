import { allowKeys, fail, flag, member, record, text } from "./layout-parse";

// The date-range shape shared by the list layouts that place records on dates
// (Calendar, Gantt). Each layout declares its own list of date ranges.

export type ListCalendarTone = "neutral" | "success" | "warning" | "danger";
export const LIST_LAYOUT_TONES = Object.freeze([
  "neutral",
  "success",
  "warning",
  "danger",
] as const);

/** At most this many date ranges per layout. */
export const LIST_DATE_RANGE_MAX_FIELDS = 3;

/** A declared date range this viewer can use, shared by the date layouts
 * (Calendar, Gantt). */
export interface ListDateRangeFieldV1 {
  readonly start: string;
  /** Same kind as `start`; a null end means open-ended. */
  readonly end?: string;
  /** Set only with `end`: whether the end field can be null. When false, no
   * record is open-ended, so the open-ended query is not sent. Absent means
   * the end may be null. */
  readonly endNullable?: boolean;
  readonly label: string;
  /** `date` is a calendar day; `datetime` is an instant shown in the person's time zone. */
  readonly kind: "date" | "datetime";
  /** The start field is nullable, so records without a start appear in a tray. */
  readonly unscheduled: boolean;
  readonly tone?: {
    readonly field: string;
    readonly tones: Readonly<Record<string, ListCalendarTone>>;
  };
}

/** Parses a layout's date ranges. Fields must be listed fields of the
 * declared kind; a start field is declared once per layout. */
export function parseDateRangeFields(
  raw: unknown,
  fields: ReadonlyMap<string, { readonly valueKind: string }>,
  path: string,
): readonly ListDateRangeFieldV1[] {
  if (!Array.isArray(raw)) fail(path, "must be an array");
  const items = raw as unknown[];
  if (!items.length || items.length > LIST_DATE_RANGE_MAX_FIELDS)
    fail(path, `must declare 1 to ${LIST_DATE_RANGE_MAX_FIELDS} date fields`);
  const starts = new Set<string>();
  return Object.freeze(
    items.map((item, index) => {
      const at = `${path}[${index}]`;
      const entry = record(item, at);
      allowKeys(
        entry,
        ["start", "end", "endNullable", "label", "kind", "unscheduled", "tone"],
        at,
        "calendar",
      );
      const kind = entry.kind;
      if (kind !== "date" && kind !== "datetime")
        fail(`${at}.kind`, "must be date or datetime");
      const start = text(entry.start, `${at}.start`);
      if (fields.get(start)?.valueKind !== kind || starts.has(start))
        fail(`${at}.start`, `must be a listed ${kind} field, declared once`);
      starts.add(start);
      const end =
        entry.end === undefined ? undefined : text(entry.end, `${at}.end`);
      if (end !== undefined && fields.get(end)?.valueKind !== kind)
        fail(`${at}.end`, `must be a listed ${kind} field`);
      if (entry.endNullable !== undefined && end === undefined)
        fail(`${at}.endNullable`, "requires an end field");
      const endNullable =
        entry.endNullable === undefined
          ? undefined
          : flag(entry.endNullable, `${at}.endNullable`);
      let tone: ListDateRangeFieldV1["tone"];
      if (entry.tone !== undefined) {
        const toneValue = record(entry.tone, `${at}.tone`);
        allowKeys(toneValue, ["field", "tones"], `${at}.tone`, "calendar");
        const field = text(toneValue.field, `${at}.tone.field`);
        if (!fields.has(field))
          fail(`${at}.tone.field`, "must be a listed field");
        const tones: Record<string, ListCalendarTone> = {};
        for (const [key, candidate] of Object.entries(
          record(toneValue.tones, `${at}.tone.tones`),
        ))
          tones[key] = member(
            candidate,
            LIST_LAYOUT_TONES,
            `${at}.tone.tones.${key}`,
            "must be a published tone",
          );
        tone = Object.freeze({ field, tones: Object.freeze(tones) });
      }
      return Object.freeze({
        start,
        ...(end === undefined ? {} : { end }),
        ...(endNullable === undefined ? {} : { endNullable }),
        label: text(entry.label, `${at}.label`),
        kind,
        unscheduled: flag(entry.unscheduled, `${at}.unscheduled`),
        ...(tone ? { tone } : {}),
      });
    }),
  );
}

/** True for a layout anchor value (`YYYY-MM-DD`) naming a real calendar day.
 * `Date` rolls an impossible day such as 30 February into March, so the
 * parsed day must read back unchanged. */
export function isListDateAnchor(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}
