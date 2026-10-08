import type {
  EntityListDescriptorV1,
  ListCalendarView,
  ListDateRangeFieldV1,
  ListLocationStateV1,
} from "@athyper/contract-platform-entity-list";
import { addDays, periodWindow, type CalendarWindow, type DatePeriod } from "@athyper/platform-temporal";
import {
  compareWithinDay,
  dateRangeSelection,
  type DateRangeContext,
  type DateRangeView,
  type DatedEntry,
} from "../date-range/date-range-model";

/** The date-scale period a Calendar view shows. */
export function calendarPeriod(view: ListCalendarView): DatePeriod {
  return view === "month" ? "month-grid" : "month";
}

/** Calendar's selection: the shared date-range selection plus its view. */
export function calendarSelection(
  state: ListLocationStateV1,
  descriptor: EntityListDescriptorV1,
  context: DateRangeContext,
): { readonly anchor: string; readonly field: ListDateRangeFieldV1; readonly view: ListCalendarView } {
  const calendar = descriptor.surface.calendar!;
  return {
    ...dateRangeSelection(calendar.dateFields, state.calendar?.dateField, state.calendarAnchor, context),
    view: state.calendar?.view ?? calendar.defaultView,
  };
}

/** Calendar's field and window when the list is in Calendar mode. */
export function calendarRange(
  state: ListLocationStateV1,
  descriptor: EntityListDescriptorV1,
  context: DateRangeContext,
): DateRangeView | undefined {
  if (state.mode !== "calendar" || !descriptor.surface.calendar) return undefined;
  const { anchor, field, view } = calendarSelection(state, descriptor, context);
  return { field, window: periodWindow(anchor, calendarPeriod(view), context.weekStart) };
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
