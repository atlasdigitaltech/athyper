import type {
  EntityListDescriptorV1,
  EntityListRowV1,
  ListCalendarTone,
  ListDateRangeFieldV1,
  ListGanttGroupV1,
  ListGanttZoom,
  ListLocationStateV1,
} from "@athyper/contract-platform-entity-list";
import {
  addDays,
  addMonths,
  daysBetween,
  periodWindow,
  type CalendarWindow,
  type DatePeriod,
} from "@athyper/platform-temporal";
import {
  dateRangeSelection,
  placeEntries,
  type DateRangeContext,
  type DateRangeView,
  type DatedEntry,
} from "../date-range/date-range-model";

/** At most this many rows are loaded and drawn. A framework rendering
 * budget, not entity configuration (Gantt blueprint section 7); the loader,
 * the drawing and the notice all read it. */
export const GANTT_ROW_CEILING = 500;

/** The date-scale period a zoom shows. */
export function ganttPeriod(zoom: ListGanttZoom): DatePeriod {
  return zoom === "month" ? "month" : zoom === "quarter" ? "quarter-weeks" : "year";
}

/** The anchor one ‹ › step away: a month, a quarter or a year. */
export function ganttStep(anchor: string, zoom: ListGanttZoom, direction: 1 | -1): string {
  return addMonths(anchor, direction * (zoom === "month" ? 1 : zoom === "quarter" ? 3 : 12));
}

/** Gantt's selection: the shared date-range selection plus its zoom. */
export function ganttSelection(
  state: ListLocationStateV1,
  descriptor: EntityListDescriptorV1,
  context: DateRangeContext,
): { readonly anchor: string; readonly field: ListDateRangeFieldV1; readonly zoom: ListGanttZoom } {
  const gantt = descriptor.surface.gantt!;
  return {
    ...dateRangeSelection(gantt.dateFields, state.gantt?.dateField, state.ganttAnchor, context),
    zoom: state.gantt?.zoom ?? gantt.defaultZoom,
  };
}

/** Gantt's field and window when the list is in Gantt mode. */
export function ganttRange(
  state: ListLocationStateV1,
  descriptor: EntityListDescriptorV1,
  context: DateRangeContext,
): DateRangeView | undefined {
  if (state.mode !== "gantt" || !descriptor.surface.gantt) return undefined;
  const { anchor, field, zoom } = ganttSelection(state, descriptor, context);
  return { field, window: periodWindow(anchor, ganttPeriod(zoom), context.weekStart) };
}

/** A span of days on the time axis, `start` inclusive and `end` exclusive. */
export interface GanttSpan {
  readonly start: string;
  readonly end: string;
}

function clip(span: GanttSpan, window: CalendarWindow): GanttSpan {
  return { start: span.start < window.start ? window.start : span.start, end: span.end > window.end ? window.end : span.end };
}

/** The lower tier: days at Month, weeks at Quarter, months at Year. */
export function ganttColumns(window: CalendarWindow, zoom: ListGanttZoom): readonly GanttSpan[] {
  const columns: GanttSpan[] = [];
  const next = (day: string) => (zoom === "month" ? addDays(day, 1) : zoom === "quarter" ? addDays(day, 7) : addMonths(day, 1));
  for (let day = window.start; day < window.end; day = next(day)) columns.push({ start: day, end: next(day) });
  return columns;
}

/** The upper tier: the month at Month, months at Quarter (clipped to the
 * widened window), quarters at Year. */
export function ganttUpperTier(window: CalendarWindow, zoom: ListGanttZoom): readonly GanttSpan[] {
  if (zoom === "month") return [window];
  const step = zoom === "quarter" ? 1 : 3;
  const segments: GanttSpan[] = [];
  for (let month = addMonths(window.start, 0); month < window.end; month = addMonths(month, step))
    segments.push(clip({ start: month, end: addMonths(month, step) }, window));
  return segments;
}

/** A span's position on the axis, as fractions of the window. */
export function axisPosition(span: GanttSpan, window: CalendarWindow): { readonly start: number; readonly size: number } {
  const total = daysBetween(window.start, window.end);
  return { start: daysBetween(window.start, span.start) / total, size: daysBetween(span.start, span.end) / total };
}

/** A milestone is declared, never inferred: a date range declared without an
 * end field, or a datetime range whose end equals its start to the instant.
 * A date range ending on its start day is a one-day bar. */
export function ganttMilestone(row: EntityListRowV1, field: ListDateRangeFieldV1): boolean {
  if (field.end === undefined) return true;
  if (field.kind !== "datetime") return false;
  const start = row.values[field.start], end = row.values[field.end];
  return typeof start === "string" && typeof end === "string" && Date.parse(start) === Date.parse(end);
}

export interface GanttBar {
  readonly entry: DatedEntry;
  /** Fractions of the window. A milestone's `start` is its day's centre. */
  readonly start: number;
  readonly size: number;
  readonly milestone: boolean;
  readonly continuesBefore: boolean;
  readonly continuesAfter: boolean;
}

/** An entry's bar: its first to last covered day, clipped to the window. */
export function ganttBar(entry: DatedEntry, field: ListDateRangeFieldV1, window: CalendarWindow): GanttBar {
  const milestone = ganttMilestone(entry.row, field);
  const span = clip({ start: entry.firstDay, end: addDays(entry.lastDay, 1) }, window);
  const position = axisPosition(span, window);
  const day = 1 / daysBetween(window.start, window.end);
  return {
    entry,
    start: milestone ? position.start + day / 2 : position.start,
    size: milestone ? 0 : position.size,
    milestone,
    continuesBefore: !milestone && entry.firstDay < window.start,
    continuesAfter: !milestone && !entry.openEnded && entry.lastDay >= window.end,
  };
}

function startValue(entry: DatedEntry, field: ListDateRangeFieldV1): number {
  const value = String(entry.row.values[field.start]);
  return field.kind === "date" ? Date.parse(`${value.slice(0, 10)}T00:00:00Z`) : Date.parse(value);
}

/** The rows a Gantt draws: placed on the window, in start order (then server
 * order, which already ends with the internal record ID), capped at the row
 * ceiling. Open-ended rows from the second stream take their place in start
 * order rather than being appended. */
export function ganttEntries(
  rows: readonly EntityListRowV1[],
  field: ListDateRangeFieldV1,
  window: CalendarWindow,
  timeZone: string,
): { readonly entries: readonly DatedEntry[]; readonly capped: boolean } {
  const placed = [...placeEntries(rows, field, window, timeZone)].sort(
    (left, right) => startValue(left, field) - startValue(right, field) || left.order - right.order,
  );
  return { entries: placed.slice(0, GANTT_ROW_CEILING), capped: placed.length >= GANTT_ROW_CEILING };
}

export interface GanttGroup {
  /** Stable key: the choice value, or a reserved key for No value and Unmapped values. */
  readonly key: string;
  readonly kind: "choice" | "none" | "unmapped" | "all";
  readonly label?: string;
  readonly tone?: ListCalendarTone;
  readonly entries: readonly DatedEntry[];
}

export const GANTT_NO_VALUE_GROUP = "\u0000none";
export const GANTT_UNMAPPED_GROUP = "\u0000unmapped";

/** Rows grouped in published choice order, then No value, then Unmapped
 * values (values that are not published choices). No row is hidden, and
 * grouping never changes paging. Without a group field, one group holds all. */
export function ganttGroups(entries: readonly DatedEntry[], group: ListGanttGroupV1 | undefined): readonly GanttGroup[] {
  if (!group) return [{ key: "", kind: "all", entries }];
  const choices = new Map(group.choices.map((choice) => [choice.value, choice]));
  const buckets = new Map<string, DatedEntry[]>();
  for (const entry of entries) {
    const raw = entry.row.values[group.field];
    const key = raw === null || raw === undefined || raw === "" ? GANTT_NO_VALUE_GROUP : choices.has(String(raw)) ? String(raw) : GANTT_UNMAPPED_GROUP;
    buckets.set(key, [...(buckets.get(key) ?? []), entry]);
  }
  const groups: GanttGroup[] = group.choices.flatMap((choice) =>
    buckets.has(choice.value) ? [{ key: choice.value, kind: "choice" as const, label: choice.label, ...(choice.tone ? { tone: choice.tone } : {}), entries: buckets.get(choice.value)! }] : [],
  );
  if (buckets.has(GANTT_NO_VALUE_GROUP)) groups.push({ key: GANTT_NO_VALUE_GROUP, kind: "none", entries: buckets.get(GANTT_NO_VALUE_GROUP)! });
  if (buckets.has(GANTT_UNMAPPED_GROUP)) groups.push({ key: GANTT_UNMAPPED_GROUP, kind: "unmapped", entries: buckets.get(GANTT_UNMAPPED_GROUP)! });
  return groups;
}
