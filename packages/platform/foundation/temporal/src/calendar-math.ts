/** Calendar maths shared by calendar views and date pickers. Calendar days
 * are `YYYY-MM-DD` strings and never pass through a time zone; instants are
 * converted only at the edges, in an explicit IANA time zone. */

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

function parts(day: string): [number, number, number] {
  const match = DAY.exec(day);
  if (!match) throw new TypeError(`Not a calendar day: ${day}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
function utcDays(day: string): number {
  const [year, month, date] = parts(day);
  return Date.UTC(year, month - 1, date) / MS_PER_DAY;
}
function fromUtcDays(days: number): string {
  return new Date(days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** The calendar day `count` days after (or before) `day`. */
export function addDays(day: string, count: number): string {
  return fromUtcDays(utcDays(day) + count);
}

/** Day of week, 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(day: string): number {
  return new Date(utcDays(day) * MS_PER_DAY).getUTCDay();
}

/** First day of the month containing `day`. */
export function startOfMonth(day: string): string {
  const [year, month] = parts(day);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
}

/** First day of the month `count` months after the month containing `day`. */
export function addMonths(day: string, count: number): string {
  const [year, month] = parts(day);
  const index = year * 12 + (month - 1) + count;
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}-01`;
}

/** First day of the week containing `day`, for a week starting on `weekStart` (0 = Sunday). */
export function startOfWeek(day: string, weekStart: number): string {
  return addDays(day, -((dayOfWeek(day) - weekStart + 7) % 7));
}

/** A half-open window of calendar days: `start` inclusive, `end` exclusive. */
export interface CalendarWindow {
  readonly start: string;
  readonly end: string;
}

/** The window a month view shows: the whole weeks covering the anchor's month. */
export function monthGridWindow(anchor: string, weekStart: number): CalendarWindow {
  const first = startOfMonth(anchor);
  const next = addMonths(anchor, 1);
  const start = startOfWeek(first, weekStart);
  const lastWeekStart = startOfWeek(addDays(next, -1), weekStart);
  return { start, end: addDays(lastWeekStart, 7) };
}

/** The window an agenda shows: the anchor's month. */
export function monthWindow(anchor: string): CalendarWindow {
  return { start: startOfMonth(anchor), end: addMonths(anchor, 1) };
}

/** The days of a window grouped into weeks of seven. */
export function weekRows(window: CalendarWindow): readonly (readonly string[])[] {
  const rows: string[][] = [];
  for (let day = window.start; day < window.end; day = addDays(day, 7))
    rows.push(Array.from({ length: 7 }, (_, index) => addDays(day, index)));
  return rows;
}

/** The days of a window, in order. */
export function windowDays(window: CalendarWindow): readonly string[] {
  const days: string[] = [];
  for (let day = window.start; day < window.end; day = addDays(day, 1)) days.push(day);
  return days;
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds. */
function zoneOffset(instant: number, timeZone: string): number {
  const fields = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(fields.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** The instant of local midnight at the start of `day` in `timeZone`, as an
 * RFC 3339 string with `Z`. Daylight-saving days are 23 or 25 hours long, so
 * the offset is resolved at the instant itself rather than assumed. */
export function zonedDayStart(day: string, timeZone: string): string {
  const [year, month, date] = parts(day);
  const wall = Date.UTC(year, month - 1, date);
  let instant = wall - zoneOffset(wall, timeZone);
  instant = wall - zoneOffset(instant, timeZone);
  return new Date(instant).toISOString();
}

/** The calendar day an instant falls on in `timeZone`. */
export function zonedDay(instant: string | number, timeZone: string): string {
  const value = typeof instant === "number" ? instant : Date.parse(instant);
  const fields = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const get = (type: string) => fields.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Today's calendar day in `timeZone`. */
export function zonedToday(timeZone: string, now: number = Date.now()): string {
  return zonedDay(now, timeZone);
}
