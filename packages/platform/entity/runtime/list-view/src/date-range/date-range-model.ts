import type {
  EntityListDescriptorV1,
  EntityListResultV1,
  EntityListRowV1,
  ListDateRangeFieldV1,
  ListFilterV1,
  ListLocationStateV1,
} from "@athyper/contract-platform-entity-list";
import {
  addDays,
  parseInstant,
  zonedDay,
  zonedDayStart,
  zonedToday,
  type CalendarWindow,
} from "@athyper/platform-temporal";

// Date-range helpers shared by the list layouts that place records on dates
// (Calendar, Gantt): window and open-ended queries, the Unscheduled tray,
// row merging and day placement.

export interface DateRangeContext {
  readonly timeZone: string;
  readonly weekStart: number;
  /** Today in the person's time zone; injectable for tests. */
  readonly today?: string;
}

/** The anchor and date range a layout's state resolves to: the chosen date
 * field when it is still offered, otherwise the first; the anchor from the
 * location, otherwise today. */
export function dateRangeSelection(
  dateFields: readonly ListDateRangeFieldV1[],
  chosen: string | undefined,
  anchor: string | undefined,
  context: DateRangeContext,
): { readonly anchor: string; readonly field: ListDateRangeFieldV1 } {
  return {
    anchor: anchor ?? context.today ?? zonedToday(context.timeZone),
    field: dateFields.find((item) => item.start === chosen) ?? dateFields[0]!,
  };
}

/** The active date layout's field and window, when the list is in one. */
export interface DateRangeView {
  readonly field: ListDateRangeFieldV1;
  readonly window: CalendarWindow;
}

/** The list's page query in a date layout becomes that layout's window query,
 * so the list's own authority and error handling cover it. */
export function dateRangePageState(
  state: ListLocationStateV1,
  descriptor: EntityListDescriptorV1,
  view: DateRangeView | undefined,
  timeZone: string,
): ListLocationStateV1 {
  return view
    ? dateRangeQueryState(
        state,
        descriptor,
        view.field,
        windowFilters(view.field, view.window, timeZone),
      )
    : state;
}

/** A window edge on the wire: a calendar day for date fields, an instant with
 * an explicit offset (local midnight in the person's zone) for datetime fields. */
export function windowEdge(
  day: string,
  field: ListDateRangeFieldV1,
  timeZone: string,
): string {
  return field.kind === "date" ? day : zonedDayStart(day, timeZone);
}

/** The window query's own filters (ANDed with the list's filters). */
export function windowFilters(
  field: ListDateRangeFieldV1,
  window: CalendarWindow,
  timeZone: string,
): readonly ListFilterV1[] {
  const start = windowEdge(window.start, field, timeZone),
    end = windowEdge(window.end, field, timeZone);
  if (field.end === undefined)
    return [
      { field: field.start, operator: "gte", value: start },
      { field: field.start, operator: "lt", value: end },
    ];
  return [
    { field: field.start, operator: "lt", value: end },
    {
      field: field.end,
      operator: field.kind === "date" ? "gte" : "gt",
      value: start,
    },
    // Explicit when the end can be null, so this query never relies on how SQL
    // compares with null. A required end has no null to exclude.
    ...(field.endNullable === false
      ? []
      : [{ field: field.end, operator: "is_not_null" } as const]),
  ];
}

/** The open-ended query's filters: started before the window ends, no end.
 * Not sent when the end field is required, since no record can match. */
export function openEndedFilters(
  field: ListDateRangeFieldV1,
  window: CalendarWindow,
  timeZone: string,
): readonly ListFilterV1[] | undefined {
  if (field.end === undefined || field.endNullable === false) return undefined;
  return [
    {
      field: field.start,
      operator: "lt",
      value: windowEdge(window.end, field, timeZone),
    },
    { field: field.end, operator: "is_null" },
  ];
}

/** The window-start point query's filters: zero-length `datetime` ranges
 * (milestones) exactly at the window start. The window query's `end gt
 * windowStart` cannot match them and no earlier window's `start lt` its end
 * can either, so without this query they appear in no window. `end eq
 * windowStart` names only this window's own start instant, never its end, so
 * each point belongs to exactly one window. Disjoint from the window query
 * (end equal, not after) and the open-ended query (end set). Sent only for a
 * `datetime` range with an end field; a `date` range has no such gap. */
export function windowStartPointFilters(
  field: ListDateRangeFieldV1,
  window: CalendarWindow,
  timeZone: string,
): readonly ListFilterV1[] | undefined {
  if (field.kind !== "datetime" || field.end === undefined) return undefined;
  const start = windowEdge(window.start, field, timeZone);
  return [
    { field: field.start, operator: "gte", value: start },
    {
      field: field.start,
      operator: "lt",
      value: windowEdge(window.end, field, timeZone),
    },
    { field: field.end, operator: "eq", value: start },
    ...(field.endNullable === false
      ? []
      : [{ field: field.end, operator: "is_not_null" } as const]),
  ];
}

/** The Unscheduled tray's filters: no start date, independent of the window. */
export function trayFilters(
  field: ListDateRangeFieldV1,
): readonly ListFilterV1[] | undefined {
  return field.unscheduled
    ? [{ field: field.start, operator: "is_null" }]
    : undefined;
}

/** Date-range queries carry an explicit start-ascending sort and the largest
 * allowed page size, and keep both across pages (the cursor is bound to them). */
export function dateRangeQueryState(
  state: ListLocationStateV1,
  descriptor: EntityListDescriptorV1,
  field: ListDateRangeFieldV1,
  filters: readonly ListFilterV1[],
): ListLocationStateV1 {
  return {
    ...state,
    filters: [...state.filters, ...filters],
    sort: [{ field: field.start, direction: "asc" }],
    groups: undefined,
    cursor: undefined,
    pageIndex: undefined,
    pageSize: Math.max(...descriptor.limits.allowedPageSizes),
  };
}

/** One record placed on the days it covers inside the window. */
export interface DatedEntry {
  readonly row: EntityListRowV1;
  readonly firstDay: string;
  /** Last covered day, inclusive. */
  readonly lastDay: string;
  /** Spans more than one day, or is a date (all-day) entry. */
  readonly allDay: boolean;
  readonly multiDay: boolean;
  readonly openEnded: boolean;
  /** Start instant for datetime entries, used for ordering and time labels. */
  readonly startsAt?: string;
  /** Position in server order (start ascending, then internal record ID). */
  readonly order: number;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

/** Places rows on calendar days in the person's time zone. A date end is
 * inclusive and a datetime end exclusive; a null end runs to the window end. */
export function placeEntries(
  rows: readonly EntityListRowV1[],
  field: ListDateRangeFieldV1,
  window: CalendarWindow,
  timeZone: string,
): readonly DatedEntry[] {
  const lastWindowDay = addDays(window.end, -1);
  return rows.flatMap((row, order): DatedEntry[] => {
    const start = text(row.values[field.start]);
    if (!start) return [];
    const end =
      field.end === undefined ? undefined : text(row.values[field.end]);
    const openEnded = field.end !== undefined && end === undefined;
    const firstDay =
      field.kind === "date" ? start.slice(0, 10) : zonedDay(start, timeZone);
    let lastDay: string;
    if (openEnded) lastDay = lastWindowDay;
    else if (end === undefined) lastDay = firstDay;
    else
      lastDay =
        field.kind === "date"
          ? end.slice(0, 10)
          : zonedDay(
              Math.max(parseInstant(end) - 1, parseInstant(start)),
              timeZone,
            );
    if (lastDay < firstDay) lastDay = firstDay;
    const multiDay = lastDay > firstDay;
    return [
      {
        row,
        firstDay,
        lastDay,
        allDay: field.kind === "date" || multiDay,
        multiDay,
        openEnded,
        ...(field.kind === "datetime" ? { startsAt: start } : {}),
        order,
      },
    ];
  });
}

/** Renderer order within a day: multi-day and all-day entries first, then
 * timed entries by start, then server order. Paging order is unaffected. */
export function compareWithinDay(left: DatedEntry, right: DatedEntry): number {
  return (
    Number(right.multiDay) - Number(left.multiDay) ||
    Number(right.allDay) - Number(left.allDay) ||
    (left.startsAt && right.startsAt
      ? parseInstant(left.startsAt) - parseInstant(right.startsAt)
      : 0) ||
    left.order - right.order
  );
}

/** Agenda grouping: each record appears once, on its first day inside the
 * window, so a long or open-ended record does not repeat on every day. */
export function agendaByDay(
  entries: readonly DatedEntry[],
  window: CalendarWindow,
): ReadonlyMap<string, readonly DatedEntry[]> {
  const days = new Map<string, DatedEntry[]>();
  for (const entry of entries) {
    const day = entry.firstDay < window.start ? window.start : entry.firstDay;
    if (day >= window.end) continue;
    days.set(day, [...(days.get(day) ?? []), entry]);
  }
  for (const list of days.values()) list.sort(compareWithinDay);
  return days;
}

/** Merges the window and open-ended pages without duplicates (the queries
 * are disjoint by construction; the guard keeps rendering safe regardless). */
export function mergeRows(
  ...pages: readonly (readonly EntityListRowV1[])[]
): readonly EntityListRowV1[] {
  const seen = new Set<string>();
  return pages
    .flat()
    .filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)));
}

/** The "of M" in "Showing N of M": every record the shown rows come from,
 * so the window query's total plus each other stream that is sent (the
 * open-ended and window-start point queries; `undefined` when not sent). The
 * streams are disjoint. Only under exact counts, and only once every total
 * is known. */
export function shownTotal(
  page: EntityListResultV1 | undefined,
  streams: readonly ({ readonly total?: number } | undefined)[],
): number | undefined {
  let total =
    page?.pagination.countMode === "exact" ? page.pagination.total : undefined;
  for (const stream of streams) {
    if (total === undefined || !stream) continue;
    total = stream.total === undefined ? undefined : total + stream.total;
  }
  return total;
}
