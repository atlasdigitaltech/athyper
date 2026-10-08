import assert from "node:assert/strict";
import test from "node:test";

import {
  addDays,
  addMonths,
  monthGridWindow,
  monthWindow,
  shiftMonths,
  startOfWeek,
  weekRows,
  zonedDay,
  zonedDayStart,
} from "./calendar-math.js";

test("calendar days move without a time zone", () => {
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addMonths("2026-12-15", 1), "2027-01-01");
  assert.equal(addMonths("2026-01-31", -1), "2025-12-01");
  assert.equal(shiftMonths("2026-10-09", 1), "2026-11-09");
  assert.equal(shiftMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(shiftMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(shiftMonths("2026-03-31", -1), "2026-02-28");
});

test("weeks start on the person's week start", () => {
  assert.equal(startOfWeek("2026-10-08", 1), "2026-10-05"); // Monday
  assert.equal(startOfWeek("2026-10-08", 0), "2026-10-04"); // Sunday
  assert.equal(startOfWeek("2026-10-08", 6), "2026-10-03"); // Saturday
});

test("a month grid covers whole weeks and an agenda covers the month", () => {
  const grid = monthGridWindow("2026-10-08", 1);
  assert.deepEqual(grid, { start: "2026-09-28", end: "2026-11-02" });
  assert.equal(weekRows(grid).length, 5);
  assert.ok(weekRows(grid).every((row) => row.length === 7));
  assert.deepEqual(monthWindow("2026-10-08"), { start: "2026-10-01", end: "2026-11-01" });
});

test("local midnight is resolved per day, including daylight-saving changes", () => {
  assert.equal(zonedDayStart("2026-10-08", "UTC"), "2026-10-08T00:00:00.000Z");
  assert.equal(zonedDayStart("2026-10-08", "Asia/Kuala_Lumpur"), "2026-10-07T16:00:00.000Z");
  // New York switches from EDT (-04:00) to EST (-05:00) on 1 November 2026.
  assert.equal(zonedDayStart("2026-10-31", "America/New_York"), "2026-10-31T04:00:00.000Z");
  assert.equal(zonedDayStart("2026-11-01", "America/New_York"), "2026-11-01T04:00:00.000Z");
  assert.equal(zonedDayStart("2026-11-02", "America/New_York"), "2026-11-02T05:00:00.000Z");
  // London springs forward on 29 March 2026: that day is 23 hours long.
  const spring = Date.parse(zonedDayStart("2026-03-30", "Europe/London")) - Date.parse(zonedDayStart("2026-03-29", "Europe/London"));
  assert.equal(spring, 23 * 3_600_000);
});

test("an instant falls on the calendar day of its time zone", () => {
  assert.equal(zonedDay("2026-10-07T16:30:00Z", "Asia/Kuala_Lumpur"), "2026-10-08");
  assert.equal(zonedDay("2026-10-07T16:30:00Z", "UTC"), "2026-10-07");
});
