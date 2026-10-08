import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { periodWindow } from "@athyper/platform-temporal";
import type {
  EntityListDescriptorV1,
  EntityListRowV1,
  ListDateRangeFieldV1,
  ListGanttGroupV1,
  ListLocationStateV1,
} from "@athyper/contract-platform-entity-list";
import { dateRangePageState } from "../../packages/platform/entity/runtime/list-view/src/date-range/date-range-model";
import {
  GANTT_ROW_CEILING,
  ganttBar,
  ganttColumns,
  ganttEntries,
  ganttGroups,
  ganttMilestone,
  ganttPeriod,
  ganttRange,
  ganttStep,
  ganttUpperTier,
} from "../../packages/platform/entity/runtime/list-view/src/gantt/gantt-model";

const range: ListDateRangeFieldV1 = {
  start: "starts_on",
  end: "ends_on",
  label: "Starts on",
  kind: "date",
  unscheduled: true,
  endNullable: true,
};
const point: ListDateRangeFieldV1 = {
  start: "due_on",
  label: "Due",
  kind: "date",
  unscheduled: false,
};
const instant: ListDateRangeFieldV1 = {
  start: "from_at",
  end: "to_at",
  label: "From",
  kind: "datetime",
  unscheduled: false,
  endNullable: false,
};
const row = (
  id: string,
  values: EntityListRowV1["values"],
): EntityListRowV1 => ({ id, values });
const quarter = periodWindow("2026-11-15", ganttPeriod("quarter"), 1); // 2026-09-28 .. 2027-01-04

describe("Gantt windows and scale", () => {
  it("steps by the zoom and draws the tiers the blueprint names", () => {
    assert.equal(ganttStep("2026-11-15", "month", 1), "2026-12-01");
    assert.equal(ganttStep("2026-11-15", "quarter", -1), "2026-08-01");
    assert.equal(ganttStep("2026-11-15", "year", 1), "2027-11-01");
    assert.equal(
      ganttColumns(periodWindow("2026-10-08", "month", 1), "month").length,
      31,
    );
    assert.equal(ganttColumns(quarter, "quarter").length, 14);
    assert.equal(
      ganttColumns(periodWindow("2026-10-08", "year", 1), "year").length,
      12,
    );
    // Quarter: months above weeks, clipped to the widened window.
    assert.deepEqual(
      ganttUpperTier(quarter, "quarter").map((segment) => segment.start),
      ["2026-09-28", "2026-10-01", "2026-11-01", "2026-12-01", "2027-01-01"],
    );
    assert.deepEqual(
      ganttUpperTier(periodWindow("2026-10-08", "year", 1), "year").map(
        (segment) => segment.start,
      ),
      ["2026-01-01", "2026-04-01", "2026-07-01", "2026-10-01"],
    );
  });

  it("turns the page query into the window query in Gantt mode only", () => {
    const descriptor = {
      surface: { gantt: { defaultZoom: "quarter", dateFields: [range] } },
      limits: { allowedPageSizes: [10, 50] },
    } as unknown as EntityListDescriptorV1;
    const state = {
      mode: "gantt",
      ganttAnchor: "2026-11-15",
      filters: [],
      sort: [{ field: "code", direction: "desc" }],
      columns: [],
      density: "comfortable",
    } as unknown as ListLocationStateV1;
    const context = { timeZone: "UTC", weekStart: 1 };
    const view = ganttRange(state, descriptor, context);
    assert.deepEqual(view?.window, quarter);
    const page = dateRangePageState(state, descriptor, view, "UTC");
    assert.deepEqual(page.sort, [{ field: "starts_on", direction: "asc" }]);
    assert.equal(page.pageSize, 50);
    assert.equal(
      ganttRange(
        { ...state, mode: "table" } as ListLocationStateV1,
        descriptor,
        context,
      ),
      undefined,
    );
  });
});

describe("Gantt bars and milestones", () => {
  it("declares milestones only: no end field, or a zero-length datetime; a one-day date range is a bar", () => {
    assert.equal(
      ganttMilestone(row("p", { due_on: "2026-10-09" }), point),
      true,
    );
    assert.equal(
      ganttMilestone(
        row("z", {
          from_at: "2026-10-09T08:00:00Z",
          to_at: "2026-10-09T08:00:00.000Z",
        }),
        instant,
      ),
      true,
    );
    assert.equal(
      ganttMilestone(
        row("t", {
          from_at: "2026-10-09T08:00:00Z",
          to_at: "2026-10-09T09:00:00Z",
        }),
        instant,
      ),
      false,
    );
    assert.equal(
      ganttMilestone(
        row("d", { starts_on: "2026-10-09", ends_on: "2026-10-09" }),
        range,
      ),
      false,
    );
    const { entries } = ganttEntries(
      [row("d", { starts_on: "2026-10-09", ends_on: "2026-10-09" })],
      range,
      quarter,
      "UTC",
    );
    const bar = ganttBar(entries[0]!, range, quarter);
    assert.equal(bar.milestone, false);
    assert.ok(Math.abs(bar.size - 1 / 98) < 1e-9); // one of the window's 98 days
  });

  it("clips bars to the window with continuation markers, and draws open-ended records to the window end", () => {
    const { entries } = ganttEntries(
      [
        row("early", { starts_on: "2026-09-01", ends_on: "2026-10-10" }),
        row("late", { starts_on: "2026-12-20", ends_on: "2027-02-01" }),
        row("open", { starts_on: "2026-08-01", ends_on: null }),
      ],
      range,
      quarter,
      "UTC",
    );
    const bars = new Map(
      entries.map((entry) => [entry.row.id, ganttBar(entry, range, quarter)]),
    );
    assert.deepEqual(
      [
        bars.get("early")?.start,
        bars.get("early")?.continuesBefore,
        bars.get("early")?.continuesAfter,
      ],
      [0, true, false],
    );
    assert.equal(bars.get("late")?.continuesAfter, true);
    assert.deepEqual(
      [bars.get("open")?.continuesAfter, bars.get("open")?.entry.openEnded],
      [false, true],
    );
    assert.ok(
      Math.abs(bars.get("open")!.start + bars.get("open")!.size - 1) < 1e-9,
    );
  });

  it("orders rows by start, placing open-ended rows among loaded ones, and stops at the ceiling", () => {
    const window = [
      row("b", { starts_on: "2026-10-05", ends_on: "2026-10-06" }),
      row("c", { starts_on: "2026-11-01", ends_on: "2026-11-02" }),
    ];
    const open = [row("a", { starts_on: "2026-09-01", ends_on: null })];
    assert.deepEqual(
      ganttEntries([...window, ...open], range, quarter, "UTC").entries.map(
        (entry) => entry.row.id,
      ),
      ["a", "b", "c"],
    );
    const many = Array.from({ length: GANTT_ROW_CEILING + 3 }, (_, index) =>
      row(`r${index}`, { starts_on: "2026-10-05", ends_on: "2026-10-06" }),
    );
    const capped = ganttEntries(many, range, quarter, "UTC");
    assert.equal(GANTT_ROW_CEILING, 500);
    assert.equal(capped.entries.length, GANTT_ROW_CEILING);
    assert.deepEqual([capped.reached, capped.truncated], [true, true]);
    // Exactly the ceiling: no further page is requested, but nothing was cut off.
    const exactly = ganttEntries(many.slice(0, GANTT_ROW_CEILING), range, quarter, "UTC");
    assert.deepEqual([exactly.entries.length, exactly.reached, exactly.truncated], [GANTT_ROW_CEILING, true, false]);
    const few = ganttEntries(many.slice(0, 10), range, quarter, "UTC");
    assert.deepEqual([few.reached, few.truncated], [false, false]);
  });
});

describe("Gantt groups", () => {
  const group: ListGanttGroupV1 = {
    field: "phase",
    label: "Phase",
    choices: [
      { value: "plan", label: "Plan" },
      { value: "build", label: "Build", tone: "warning" },
    ],
  };
  it("follows published choice order, then No value, then Unmapped values, hiding no row", () => {
    const { entries } = ganttEntries(
      [
        row("x", {
          starts_on: "2026-10-05",
          ends_on: "2026-10-06",
          phase: "legacy",
        }),
        row("y", {
          starts_on: "2026-10-06",
          ends_on: "2026-10-07",
          phase: "build",
        }),
        row("z", {
          starts_on: "2026-10-07",
          ends_on: "2026-10-08",
          phase: null,
        }),
        row("w", {
          starts_on: "2026-10-08",
          ends_on: "2026-10-09",
          phase: "plan",
        }),
      ],
      range,
      quarter,
      "UTC",
    );
    const groups = ganttGroups(entries, group);
    assert.deepEqual(
      groups.map((item) => [
        item.kind,
        item.label ?? "",
        item.entries.map((entry) => entry.row.id).join(),
      ]),
      [
        ["choice", "Plan", "w"],
        ["choice", "Build", "y"],
        ["none", "", "z"],
        ["unmapped", "", "x"],
      ],
    );
    assert.equal(
      groups.reduce((sum, item) => sum + item.entries.length, 0),
      4,
    );
    assert.deepEqual(
      ganttGroups(entries, undefined).map((item) => item.kind),
      ["all"],
    );
  });
});
