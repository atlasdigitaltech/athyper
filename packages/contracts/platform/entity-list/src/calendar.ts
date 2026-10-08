import {
  isListDateAnchor,
  LIST_DATE_RANGE_MAX_FIELDS,
  parseDateRangeFields,
  type ListDateRangeFieldV1,
} from "./date-range";
import { allowKeys, member, record } from "./layout-parse";

/** Calendar views this release can render. Grows only as renderers exist. */
export const LIST_CALENDAR_VIEWS = Object.freeze(["month", "agenda"] as const);
export type ListCalendarView = (typeof LIST_CALENDAR_VIEWS)[number];

export const LIST_CALENDAR_MAX_DATE_FIELDS = LIST_DATE_RANGE_MAX_FIELDS;

/** Calendar's name for the shared date-range shape. */
export type ListCalendarDateFieldV1 = ListDateRangeFieldV1;

export interface ListCalendarV1 {
  readonly defaultView: ListCalendarView;
  readonly dateFields: readonly ListCalendarDateFieldV1[];
}

/** Saved calendar state. The navigable position (anchor) is location state only. */
export interface ListCalendarStateV1 {
  readonly dateField: string;
  readonly view: ListCalendarView;
}

/** Parses the browser calendar projection. Fields must be listed fields of
 * the declared kind; the default view must be one this release can render. */
export function parseListCalendar(
  raw: unknown,
  fields: ReadonlyMap<string, { readonly valueKind: string }>,
): ListCalendarV1 {
  const value = record(raw, "surface.calendar");
  allowKeys(
    value,
    ["defaultView", "dateFields"],
    "surface.calendar",
    "calendar",
  );
  const dateFields = parseDateRangeFields(
    value.dateFields,
    fields,
    "surface.calendar.dateFields",
  );
  return Object.freeze({
    defaultView: member(
      value.defaultView,
      LIST_CALENDAR_VIEWS,
      "surface.calendar.defaultView",
      "must be a renderable view",
    ),
    dateFields,
  });
}

/** Normalizes saved or shared calendar state against this viewer's calendar.
 * An unusable date field falls back to the first declared one; a view the
 * descriptor cannot render becomes the default view. Display state only, so
 * normalizing it never widens results. */
export function parseListCalendarState(
  raw: unknown,
  calendar: ListCalendarV1,
): ListCalendarStateV1 {
  const value =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const dateField =
    calendar.dateFields.find((item) => item.start === value.dateField)?.start ??
    calendar.dateFields[0]!.start;
  const chosen =
    typeof value.view === "string" &&
    (LIST_CALENDAR_VIEWS as readonly string[]).includes(value.view)
      ? (value.view as ListCalendarView)
      : calendar.defaultView;
  return Object.freeze({ dateField, view: chosen });
}

/** True for a calendar anchor value (`YYYY-MM-DD`). */
export const isListCalendarAnchor = isListDateAnchor;
