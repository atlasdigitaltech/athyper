import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EntityListDescriptorV1, EntityListRowV1, ListCalendarDateFieldV1, ListLocationStateV1 } from "@athyper/contract-platform-entity-list";
import {
  agendaByDay,
  mergeRows,
  openEndedFilters,
  placeEntries,
  trayFilters,
  windowFilters,
} from "../../packages/platform/entity/runtime/list-view/src/date-range/date-range-model";
import {
  calendarPageState,
  calendarWindow,
  entriesByDay,
  weekLayout,
} from "../../packages/platform/entity/runtime/list-view/src/calendar/calendar-model";

const dateField: ListCalendarDateFieldV1 = { start: "starts_on", end: "ends_on", label: "Starts on", kind: "date", unscheduled: true };
const instantField: ListCalendarDateFieldV1 = { start: "updated_at", label: "Updated", kind: "datetime", unscheduled: false };
const row = (id: string, values: EntityListRowV1["values"]): EntityListRowV1 => ({ id, values });

describe("calendar windows and wire format", () => {
  it("sends date edges as calendar days and datetime edges as offset instants at local midnight", () => {
    const window = calendarWindow("2026-10-08", "month", 1);
    assert.deepEqual(window, { start: "2026-09-28", end: "2026-11-02" });
    assert.deepEqual(windowFilters(dateField, window, "Asia/Kuala_Lumpur"), [
      { field: "starts_on", operator: "lt", value: "2026-11-02" },
      { field: "ends_on", operator: "gte", value: "2026-09-28" },
      { field: "ends_on", operator: "is_not_null" },
    ]);
    assert.deepEqual(windowFilters(instantField, calendarWindow("2026-10-08", "agenda", 1), "Asia/Kuala_Lumpur"), [
      { field: "updated_at", operator: "gte", value: "2026-09-30T16:00:00.000Z" },
      { field: "updated_at", operator: "lt", value: "2026-10-31T16:00:00.000Z" },
    ]);
  });

  it("computes datetime edges per day across a daylight-saving change", () => {
    const [from, to] = windowFilters(instantField, calendarWindow("2026-11-01", "agenda", 0), "America/New_York");
    assert.equal(from?.value, "2026-11-01T04:00:00.000Z"); // EDT midnight
    assert.equal(to?.value, "2026-12-01T05:00:00.000Z"); // EST midnight
  });

  it("runs the open-ended query only with an end field and the tray only for a nullable start", () => {
    const window = calendarWindow("2026-10-08", "agenda", 1);
    assert.deepEqual(openEndedFilters(dateField, window, "UTC"), [
      { field: "starts_on", operator: "lt", value: "2026-11-01" },
      { field: "ends_on", operator: "is_null" },
    ]);
    assert.equal(openEndedFilters(instantField, window, "UTC"), undefined);
    // A required end: no open-ended query, and no null to exclude from the window query.
    const requiredEnd = { ...dateField, endNullable: false };
    assert.equal(openEndedFilters(requiredEnd, window, "UTC"), undefined);
    assert.deepEqual(windowFilters(requiredEnd, window, "UTC").map((filter) => filter.operator), ["lt", "gte"]);
    assert.deepEqual(trayFilters(dateField), [{ field: "starts_on", operator: "is_null" }]);
    assert.equal(trayFilters(instantField), undefined);
  });

  it("turns the page query into the window query with an explicit sort and the largest page", () => {
    const descriptor = {
      surface: { calendar: { defaultView: "month", dateFields: [dateField] } },
      limits: { allowedPageSizes: [10, 50, 25] },
    } as unknown as EntityListDescriptorV1;
    const state = { mode: "calendar", calendarAnchor: "2026-10-08", filters: [{ field: "stage", operator: "eq", value: "open" }], sort: [{ field: "code", direction: "desc" }], columns: [], density: "comfortable", group: "stage", pageSize: 10 } as unknown as ListLocationStateV1;
    const page = calendarPageState(state, descriptor, { timeZone: "UTC", weekStart: 1 });
    assert.deepEqual(page.sort, [{ field: "starts_on", direction: "asc" }]);
    assert.equal(page.pageSize, 50);
    assert.equal(page.group, undefined);
    assert.deepEqual(page.filters[0], { field: "stage", operator: "eq", value: "open" });
    assert.equal(page.filters.length, 4);
    const table = { ...state, mode: "table" } as ListLocationStateV1;
    assert.equal(calendarPageState(table, descriptor, { timeZone: "UTC", weekStart: 1 }), table);
  });
});

describe("calendar placement", () => {
  const window = calendarWindow("2026-10-08", "month", 1);

  it("treats a date end as inclusive, a datetime end as exclusive, and a null end as open-ended", () => {
    const [range, single, open] = placeEntries([
      row("r", { starts_on: "2026-10-05", ends_on: "2026-10-07" }),
      row("s", { starts_on: "2026-10-09", ends_on: "2026-10-09" }),
      row("o", { starts_on: "2026-10-20", ends_on: null }),
    ], dateField, window, "UTC");
    assert.deepEqual([range?.firstDay, range?.lastDay, range?.multiDay], ["2026-10-05", "2026-10-07", true]);
    assert.deepEqual([single?.firstDay, single?.lastDay, single?.multiDay], ["2026-10-09", "2026-10-09", false]);
    assert.deepEqual([open?.lastDay, open?.openEnded], ["2026-11-01", true]);
    const [timed] = placeEntries([row("t", { updated_at: "2026-10-07T17:30:00Z" })], instantField, window, "Asia/Kuala_Lumpur");
    assert.equal(timed?.firstDay, "2026-10-08"); // 01:30 the next day in Kuala Lumpur
  });

  it("orders a day multi-day first, then all-day, then timed by start", () => {
    const placed = [
      ...placeEntries([row("late", { updated_at: "2026-10-08T15:00:00Z" }), row("early", { updated_at: "2026-10-08T09:00:00Z" })], instantField, window, "UTC"),
      ...placeEntries([row("span", { starts_on: "2026-10-07", ends_on: "2026-10-09" }), row("day", { starts_on: "2026-10-08", ends_on: "2026-10-08" })], dateField, window, "UTC"),
    ];
    assert.deepEqual(entriesByDay(placed, window).get("2026-10-08")!.map((entry) => entry.row.id), ["span", "day", "early", "late"]);
  });

  it("draws a week as continuous bars in three lanes and counts the rest per day", () => {
    const week = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];
    const placed = placeEntries([
      row("open", { starts_on: "2026-09-20", ends_on: null }),
      row("range", { starts_on: "2026-10-06", ends_on: "2026-10-08" }),
      ...["a", "b", "c"].map((id) => row(id, { starts_on: "2026-10-08", ends_on: "2026-10-08" })),
      row("next", { starts_on: "2026-10-10", ends_on: "2026-10-14" }),
    ], dateField, window, "UTC");
    const { bars, hidden } = weekLayout(placed, week);
    const byId = new Map(bars.map((bar) => [bar.entry.row.id, bar]));
    assert.deepEqual(byId.get("open"), { ...byId.get("open"), column: 0, span: 7, lane: 0, continuesBefore: true, continuesAfter: true });
    assert.deepEqual([byId.get("range")?.column, byId.get("range")?.span, byId.get("range")?.lane], [1, 3, 1]);
    assert.deepEqual([byId.get("next")?.column, byId.get("next")?.span, byId.get("next")?.continuesAfter], [5, 2, true]);
    // Lane 2 holds one of the three single days on the 8th; two are hidden there.
    assert.deepEqual(hidden, [0, 0, 0, 2, 0, 0, 0]);
    assert.equal(bars.filter((bar) => bar.column === 3).length, 1);
  });

  it("lists each record once in Agenda, on its first visible day", () => {
    const placed = placeEntries([row("o", { starts_on: "2026-09-20", ends_on: null }), row("r", { starts_on: "2026-10-05", ends_on: "2026-10-07" })], dateField, window, "UTC");
    const agenda = agendaByDay(placed, window);
    assert.deepEqual([...agenda.keys()], ["2026-09-28", "2026-10-05"]);
    assert.equal([...agenda.values()].flat().length, 2);
  });

  it("merges the window and open-ended pages without duplicates", () => {
    assert.deepEqual(mergeRows([row("a", {}), row("b", {})], [row("b", {}), row("c", {})]).map((item) => item.id), ["a", "b", "c"]);
  });
});
