import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  EntityListDescriptorV1,
  ListBoardLaneFieldV1,
  ListFieldDescriptorV1,
  ListLocationStateV1,
} from "@athyper/contract-platform-entity-list";
import {
  boardCounts,
  boardDistribution,
  boardLanes,
  boardSummaryState,
  laneFilter,
  laneFilterFits,
  NO_VALUE_LANE_KEY,
} from "../../packages/platform/entity/runtime/list-view/src/board/board-model";
import { resolveCardLayout } from "../../packages/platform/entity/runtime/list-view/src/card-content";
import { renderCardValue } from "../../packages/platform/entity/runtime/list-view/src/card-renderers";

const laneField: ListBoardLaneFieldV1 = {
  field: "stage",
  label: "Stage",
  noValueLane: true,
  lanes: [
    {
      key: "open",
      label: "Open",
      values: ["open"],
      tone: "warning",
      collapsed: false,
      terminal: false,
    },
    {
      key: "finished",
      label: "Finished",
      localizedLabel: {
        defaultLocale: "en",
        values: { en: "Finished", ms: "Selesai" },
      },
      values: ["done", "closed"],
      tone: "success",
      collapsed: true,
      terminal: true,
    },
  ],
};

describe("board model", () => {
  it("lists published lanes in order and adds No value for a nullable field", () => {
    const lanes = boardLanes(laneField, "No value", "ms");
    assert.deepEqual(
      lanes.map((lane) => [lane.key, lane.label, lane.noValue]),
      [
        ["open", "Open", false],
        ["finished", "Selesai", false],
        [NO_VALUE_LANE_KEY, "No value", true],
      ],
    );
    assert.equal(
      boardLanes({ ...laneField, noValueLane: false }, "No value").length,
      2,
    );
  });

  it("folds exact buckets into lanes, counts lanes without a bucket as zero and isolates unmapped values", () => {
    const lanes = boardLanes(laneField, "No value");
    const counts = boardCounts(lanes, [
      { value: "done", label: "done", count: 4 },
      { value: "closed", label: "closed", count: 2 },
      { value: null, label: "", count: 1 },
      { value: "legacy_hold", label: "legacy_hold", count: 3 },
    ]);
    assert.deepEqual(
      [...counts.lanes],
      [
        ["open", 0],
        ["finished", 6],
        [NO_VALUE_LANE_KEY, 1],
      ],
    );
    assert.equal(counts.unmapped, 3);
    assert.equal(counts.total, 10);
    assert.deepEqual(
      boardDistribution(lanes, counts).map((item) => [
        item.lane.key,
        item.count,
      ]),
      [
        ["open", 0],
        ["finished", 6],
        [NO_VALUE_LANE_KEY, 1],
      ],
    );
  });

  it("selects a lane with in, or is_null for No value, and needs a free filter slot", () => {
    const [open, , none] = boardLanes(laneField, "No value");
    assert.deepEqual(laneFilter("stage", open!), {
      field: "stage",
      operator: "in",
      value: ["open"],
    });
    assert.deepEqual(laneFilter("stage", none!), {
      field: "stage",
      operator: "is_null",
    });
    assert.equal(laneFilterFits({ filters: [] }), true);
    assert.equal(
      laneFilterFits({
        filters: Array.from({ length: 20 }, () => ({
          field: "stage",
          operator: "eq" as const,
          value: "x",
        })),
      }),
      false,
    );
  });

  it("turns the list query into one grouped summary query in Board mode only", () => {
    const descriptor = {
      limits: { allowedPageSizes: [25, 10, 50] },
    } as unknown as EntityListDescriptorV1;
    const state = {
      mode: "board",
      board: { laneField: "stage", collapsed: [] },
      filters: [],
      sort: [],
      columns: [],
      density: "comfortable",
      cursor: "c",
      pageIndex: 2,
      pageSize: 50,
    } as unknown as ListLocationStateV1;
    assert.deepEqual(
      (({ group, cursor, pageIndex, pageSize }) => ({
        group,
        cursor,
        pageIndex,
        pageSize,
      }))(boardSummaryState(state, descriptor)),
      { group: "stage", cursor: undefined, pageIndex: undefined, pageSize: 10 },
    );
    const table = { ...state, mode: "table" } as ListLocationStateV1;
    assert.equal(boardSummaryState(table, descriptor), table);
  });
});

const field = (
  key: string,
  options: Partial<ListFieldDescriptorV1> = {},
): ListFieldDescriptorV1 => ({
  key,
  label: key,
  valueKind: "string",
  defaultVisible: true,
  defaultOrder: 0,
  filterOperators: [],
  sortable: false,
  groupable: false,
  aggregations: [],
  ...options,
});

describe("card content", () => {
  const fields = [
    field("code"),
    field("name", { semanticRole: "title" }),
    field("stage", { semanticRole: "status" }),
    field("owner"),
    field("due", { valueKind: "date" }),
    field("progress", { valueKind: "decimal", cardPriority: "primary" }),
  ];
  const base = {
    entity: { identityField: "code" },
    fields,
    surface: {},
  } as unknown as EntityListDescriptorV1;

  it("uses published card content exactly and ahead of card priority", () => {
    const descriptor = {
      ...base,
      surface: {
        cardContent: {
          fields: [
            { field: "due", rendererKey: "date.due" },
            { field: "owner" },
          ],
        },
      },
    } as unknown as EntityListDescriptorV1;
    const layout = resolveCardLayout(descriptor, fields, "stage");
    assert.equal(layout.title?.key, "name");
    assert.equal(layout.status, undefined);
    assert.deepEqual(
      layout.body.map((item) => [item.key, item.rendererKey]),
      [
        ["due", "date.due"],
        ["owner", undefined],
      ],
    );
    assert.deepEqual(layout.more, []);
  });

  it("falls back to visible columns ordered by card priority, without the lane field", () => {
    const layout = resolveCardLayout(base, fields, "stage");
    assert.equal(layout.status, undefined);
    assert.equal(layout.body[0]?.key, "progress");
    assert.ok(!layout.body.some((item) => item.key === "stage"));
  });

  it("renders progress and due-date values and quiets due dates in terminal lanes", () => {
    const progress = renderCardValue(
      64.6,
      field("p", { rendererKey: "number.progress" }),
      "64.6",
      undefined,
      undefined,
    ) as { props: { className: string } };
    assert.equal(progress.props.className, "a-entity-list__progress");
    const overdue = renderCardValue(
      "2026-01-01",
      field("d", { rendererKey: "date.due" }),
      "1 Jan",
      undefined,
      undefined,
      "2026-10-08",
    ) as { props: { className: string } };
    assert.match(overdue.props.className, /overdue/);
    const quiet = renderCardValue(
      "2026-01-01",
      field("d", { rendererKey: "date.due" }),
      "1 Jan",
      undefined,
      { terminal: true },
      "2026-10-08",
    ) as { props: { className: string } };
    assert.doesNotMatch(quiet.props.className, /overdue/);
    assert.equal(
      renderCardValue(
        "<script>alert(1)</script>",
        field("text", { rendererKey: "text" }),
        "<script>alert(1)</script>",
        undefined,
        undefined,
      ),
      "<script>alert(1)</script>",
    );
    const highlighted = { type: "mark", props: { children: "Readable" } };
    assert.equal(
      renderCardValue(
        "Readable",
        field("text", { rendererKey: "text" }),
        highlighted as never,
        undefined,
        undefined,
      ),
      highlighted,
    );
    assert.equal(
      renderCardValue("x", field("plain"), "x", undefined, undefined),
      undefined,
    );
  });
});
