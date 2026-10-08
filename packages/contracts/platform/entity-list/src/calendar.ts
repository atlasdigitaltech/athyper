/** Calendar views this release can render. Grows only as renderers exist. */
export const LIST_CALENDAR_VIEWS = Object.freeze(["month", "agenda"] as const);
export type ListCalendarView = (typeof LIST_CALENDAR_VIEWS)[number];
export type ListCalendarTone = "neutral" | "success" | "warning" | "danger";

export const LIST_CALENDAR_MAX_DATE_FIELDS = 3;

/** A declared date field this viewer can use. */
export interface ListCalendarDateFieldV1 {
  readonly start: string;
  /** Same kind as `start`; a null end means open-ended. */
  readonly end?: string;
  readonly label: string;
  /** `date` is a calendar day; `datetime` is an instant shown in the person's time zone. */
  readonly kind: "date" | "datetime";
  /** The start field is nullable, so records without a start appear in a tray. */
  readonly unscheduled: boolean;
  readonly tone?: { readonly field: string; readonly tones: Readonly<Record<string, ListCalendarTone>> };
}

export interface ListCalendarV1 {
  readonly defaultView: ListCalendarView;
  readonly dateFields: readonly ListCalendarDateFieldV1[];
}

/** Saved calendar state. The navigable position (anchor) is location state only. */
export interface ListCalendarStateV1 {
  readonly dateField: string;
  readonly view: ListCalendarView;
}

const TONES = ["neutral", "success", "warning", "danger"] as const;

function fail(path: string, reason: string): never {
  throw new TypeError(`${path} ${reason}`);
}
function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "must be an object");
  return value as Record<string, unknown>;
}
function allowKeys(value: Record<string, unknown>, keys: readonly string[], path: string): void {
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${path}.${key}`, "is not a calendar property");
}
function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200) fail(path, "must be readable text");
  return value;
}
function flag(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "must be a boolean");
  return value;
}
function view(value: unknown, path: string): ListCalendarView {
  if (typeof value !== "string" || !(LIST_CALENDAR_VIEWS as readonly string[]).includes(value)) fail(path, "must be a renderable view");
  return value as ListCalendarView;
}

/** Parses the browser calendar projection. Fields must be listed fields of
 * the declared kind; the default view must be one this release can render. */
export function parseListCalendar(
  raw: unknown,
  fields: ReadonlyMap<string, { readonly valueKind: string }>,
): ListCalendarV1 {
  const value = record(raw, "surface.calendar");
  allowKeys(value, ["defaultView", "dateFields"], "surface.calendar");
  if (!Array.isArray(value.dateFields)) fail("surface.calendar.dateFields", "must be an array");
  const items = value.dateFields as unknown[];
  if (!items.length || items.length > LIST_CALENDAR_MAX_DATE_FIELDS)
    fail("surface.calendar.dateFields", `must declare 1 to ${LIST_CALENDAR_MAX_DATE_FIELDS} date fields`);
  const starts = new Set<string>();
  const dateFields = items.map((item, index) => {
    const path = `surface.calendar.dateFields[${index}]`;
    const entry = record(item, path);
    allowKeys(entry, ["start", "end", "label", "kind", "unscheduled", "tone"], path);
    const kind = entry.kind;
    if (kind !== "date" && kind !== "datetime") fail(`${path}.kind`, "must be date or datetime");
    const start = text(entry.start, `${path}.start`);
    if (fields.get(start)?.valueKind !== kind || starts.has(start)) fail(`${path}.start`, `must be a listed ${kind} field, declared once`);
    starts.add(start);
    const end = entry.end === undefined ? undefined : text(entry.end, `${path}.end`);
    if (end !== undefined && fields.get(end)?.valueKind !== kind) fail(`${path}.end`, `must be a listed ${kind} field`);
    let tone: ListCalendarDateFieldV1["tone"];
    if (entry.tone !== undefined) {
      const toneValue = record(entry.tone, `${path}.tone`);
      allowKeys(toneValue, ["field", "tones"], `${path}.tone`);
      const field = text(toneValue.field, `${path}.tone.field`);
      if (!fields.has(field)) fail(`${path}.tone.field`, "must be a listed field");
      const tones: Record<string, ListCalendarTone> = {};
      for (const [key, candidate] of Object.entries(record(toneValue.tones, `${path}.tone.tones`))) {
        if (typeof candidate !== "string" || !(TONES as readonly string[]).includes(candidate)) fail(`${path}.tone.tones.${key}`, "must be a published tone");
        tones[key] = candidate as ListCalendarTone;
      }
      tone = Object.freeze({ field, tones: Object.freeze(tones) });
    }
    return Object.freeze({
      start,
      ...(end === undefined ? {} : { end }),
      label: text(entry.label, `${path}.label`),
      kind,
      unscheduled: flag(entry.unscheduled, `${path}.unscheduled`),
      ...(tone ? { tone } : {}),
    });
  });
  return Object.freeze({ defaultView: view(value.defaultView, "surface.calendar.defaultView"), dateFields: Object.freeze(dateFields) });
}

/** Normalizes saved or shared calendar state against this viewer's calendar.
 * An unusable date field falls back to the first declared one; a view the
 * descriptor cannot render becomes the default view. Display state only, so
 * normalizing it never widens results. */
export function parseListCalendarState(raw: unknown, calendar: ListCalendarV1): ListCalendarStateV1 {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const dateField = calendar.dateFields.find((item) => item.start === value.dateField)?.start ?? calendar.dateFields[0]!.start;
  const chosen = typeof value.view === "string" && (LIST_CALENDAR_VIEWS as readonly string[]).includes(value.view) ? (value.view as ListCalendarView) : calendar.defaultView;
  return Object.freeze({ dateField, view: chosen });
}

/** True for a calendar anchor value (`YYYY-MM-DD`). */
export function isListCalendarAnchor(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}
