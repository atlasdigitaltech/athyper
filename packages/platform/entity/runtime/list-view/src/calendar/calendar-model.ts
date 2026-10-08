import type {
  EntityListDescriptorV1,
  ListCalendarDateFieldV1,
  ListCalendarView,
  ListLocationStateV1,
} from "@athyper/contract-platform-entity-list";
import {
  addDays,
  monthGridWindow,
  monthWindow,
  zonedToday,
  type CalendarWindow,
} from "@athyper/platform-temporal";
import { compareWithinDay, dateRangeQueryState, windowFilters, type DatedEntry } from "../date-range/date-range-model";

export interface CalendarContext {
  readonly timeZone: string;
  readonly weekStart: number;
  /** Today in the person's time zone; injectable for tests. */
  readonly today?: string;
}

/** The anchor, date field and view a calendar state resolves to. */
export function calendarSelection(
  state: ListLocationStateV1,
  descriptor: EntityListDescriptorV1,
  context: CalendarContext,
): { readonly anchor: string; readonly field: ListCalendarDateFieldV1; readonly view: ListCalendarView } {
  const calendar = descriptor.surface.calendar!;
  const field = calendar.dateFields.find((item) => item.start === state.calendar?.dateField) ?? calendar.dateFields[0]!;
  return {
    anchor: state.calendarAnchor ?? context.today ?? zonedToday(context.timeZone),
    field,
    view: state.calendar?.view ?? calendar.defaultView,
  };
}

/** The window of calendar days a view shows. */
export function calendarWindow(anchor: string, view: ListCalendarView, weekStart: number): CalendarWindow {
  return view === "month" ? monthGridWindow(anchor, weekStart) : monthWindow(anchor);
}

/** The list's page query in Calendar mode becomes the window query, so the
 * list's own authority and error handling cover it. */
export function calendarPageState(
  state: ListLocationStateV1,
  descriptor: EntityListDescriptorV1,
  context: CalendarContext,
): ListLocationStateV1 {
  if (state.mode !== "calendar" || !descriptor.surface.calendar) return state;
  const { anchor, field, view } = calendarSelection(state, descriptor, context);
  return dateRangeQueryState(state, descriptor, field, windowFilters(field, calendarWindow(anchor, view, context.weekStart), context.timeZone));
}

/** The entries on each day of the window, in within-day order. */
export function entriesByDay(entries: readonly DatedEntry[], window: CalendarWindow): ReadonlyMap<string, readonly DatedEntry[]> {
  const days = new Map<string, DatedEntry[]>();
  for (const entry of entries) {
    const from = entry.firstDay < window.start ? window.start : entry.firstDay;
    for (let day = from; day <= entry.lastDay && day < window.end; day = addDays(day, 1)) {
      const list = days.get(day) ?? [];
      list.push(entry);
      days.set(day, list);
    }
  }
  for (const list of days.values()) list.sort(compareWithinDay);
  return days;
}

/** Lanes a month week shows before "+N more". */
export const CALENDAR_LANES_PER_WEEK = 3;

/** One entry drawn as a continuous bar across the days it covers in a week. */
export interface WeekBar {
  readonly entry: DatedEntry;
  /** Column of the bar's first day in this week, 0 to 6. */
  readonly column: number;
  readonly span: number;
  readonly lane: number;
  readonly continuesBefore: boolean;
  readonly continuesAfter: boolean;
}

/** Week order: multi-day bars first, earlier and then longer first, so long
 * spans keep a stable lane; then the within-day order. */
function compareInWeek(left: DatedEntry, right: DatedEntry): number {
  return (
    Number(right.multiDay) - Number(left.multiDay) ||
    (left.firstDay < right.firstDay ? -1 : left.firstDay > right.firstDay ? 1 : 0) ||
    (left.lastDay > right.lastDay ? -1 : left.lastDay < right.lastDay ? 1 : 0) ||
    compareWithinDay(left, right)
  );
}

/** Packs a week's entries into lanes. An entry that finds no free lane for its
 * whole span is hidden on each day it covers, and counted in that day's
 * "+N more"; the day dialog lists every entry of the day. */
export function weekLayout(
  entries: readonly DatedEntry[],
  week: readonly string[],
  lanes: number = CALENDAR_LANES_PER_WEEK,
): { readonly bars: readonly WeekBar[]; readonly hidden: readonly number[] } {
  const first = week[0]!, last = week[week.length - 1]!;
  const occupied = Array.from({ length: lanes }, () => new Array<boolean>(week.length).fill(false));
  const hidden = new Array<number>(week.length).fill(0);
  const bars: WeekBar[] = [];
  for (const entry of entries.filter((item) => item.firstDay <= last && item.lastDay >= first).sort(compareInWeek)) {
    const column = entry.firstDay < first ? 0 : week.indexOf(entry.firstDay);
    const end = entry.lastDay > last ? week.length - 1 : week.indexOf(entry.lastDay);
    const lane = occupied.findIndex((row) => row.slice(column, end + 1).every((taken) => !taken));
    if (lane < 0) {
      for (let day = column; day <= end; day += 1) hidden[day]! += 1;
      continue;
    }
    occupied[lane]!.fill(true, column, end + 1);
    bars.push({ entry, column, span: end - column + 1, lane, continuesBefore: entry.firstDay < first, continuesAfter: entry.lastDay > last });
  }
  return { bars, hidden };
}
