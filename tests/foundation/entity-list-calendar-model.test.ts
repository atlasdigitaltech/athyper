import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EntityListDescriptorV1, EntityListRowV1, ListCalendarDateFieldV1, ListLocationStateV1 } from "@athyper/contract-platform-entity-list";
import {
  calendarPageState,
  agendaByDay,
  calendarWindow,
  entriesByDay,
  mergeRows,
  openEndedFilters,
  placeEntries,
  trayFilters,
  visibleChips,
  windowFilters,
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

  it("orders a day multi-day first, then all-day, then timed by start, and shows three chips", () => {
    const placed = [
      ...placeEntries([row("late", { updated_at: "2026-10-08T15:00:00Z" }), row("early", { updated_at: "2026-10-08T09:00:00Z" })], instantField, window, "UTC"),
      ...placeEntries([row("span", { starts_on: "2026-10-07", ends_on: "2026-10-09" }), row("day", { starts_on: "2026-10-08", ends_on: "2026-10-08" })], dateField, window, "UTC"),
    ];
    const day = entriesByDay(placed, window).get("2026-10-08")!;
    assert.deepEqual(day.map((entry) => entry.row.id), ["span", "day", "early", "late"]);
    const chips = visibleChips(day);
    assert.deepEqual(chips.shown.map((entry) => entry.row.id), ["span", "day", "early"]);
    assert.equal(chips.more, 1);
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
