import { describe, expect, it } from "vitest";
import type { ListFieldDescriptorV1 } from "@athyper/contract-platform-entity-list";
import type { EntityFieldDescriptor, EntityListBoardDescriptor } from "@athyper/server-contract-metadata";
import { LIST_BOARD_COUNTS_UNAVAILABLE, LIST_BOARD_LANE_FIELD_UNAVAILABLE, resolveCardContent, resolveListBoard } from "./list-board.js";

const listField = (key: string, options: Partial<ListFieldDescriptorV1> = {}): ListFieldDescriptorV1 => ({
  key, label: key === "stage" ? "Stage" : key, valueKind: "enum", defaultVisible: true, defaultOrder: 0,
  filterOperators: ["eq", "ne", "in", "is_null", "is_not_null"], sortable: true, groupable: true, aggregations: [], ...options,
});
const entityField = (key: string, required: boolean): EntityFieldDescriptor => ({ key, storagePath: key, type: "enum", required, writableOn: [] });
const board: EntityListBoardDescriptor = {
  laneFields: [{
    field: "stage",
    choices: [
      { value: "open", label: "Open", tone: "warning", position: 1 },
      { value: "done", label: "Done", tone: "success", position: 2 },
      { value: "closed", label: "Closed", tone: "success", position: 3 },
    ],
    lanes: [
      { key: "open", label: "Open", values: ["open"], tone: "warning", collapsed: false, terminal: false },
      { key: "finished", label: "Finished", values: ["done", "closed"], tone: "success", collapsed: true, terminal: true },
    ],
  }],
};
const resolve = (overrides: Partial<Parameters<typeof resolveListBoard>[0]> = {}) => resolveListBoard({
  board, countMode: "exact", fields: [listField("stage")], entityFields: [entityField("stage", true)], masked: () => false, ...overrides,
});

describe("per-viewer board resolution", () => {
  it("offers the published lanes for a usable lane field", () => {
    expect(resolve()).toEqual({ board: { laneFields: [{
      field: "stage", label: "Stage", noValueLane: false,
      lanes: [
        { key: "open", label: "Open", values: ["open"], tone: "warning", collapsed: false, terminal: false },
        { key: "finished", label: "Finished", values: ["done", "closed"], tone: "success", collapsed: true, terminal: true },
      ],
    }] } });
  });

  it("adds a no-value lane only for a nullable lane field", () => {
    const result = resolve({ entityFields: [entityField("stage", false)] });
    expect("board" in result && result.board.laneFields[0]?.noValueLane).toBe(true);
  });

  it("requires an exact count mode", () => {
    expect(resolve({ countMode: "approximate" })).toEqual({ unavailable: LIST_BOARD_COUNTS_UNAVAILABLE });
  });

  it.each([
    ["not in the viewer's list fields", { fields: [] }],
    ["masked", { masked: (key: string) => key === "stage" }],
    ["not groupable", { fields: [listField("stage", { groupable: false })] }],
    ["missing the in operator", { fields: [listField("stage", { filterOperators: ["eq"] })] }],
    ["nullable without is_null", { fields: [listField("stage", { filterOperators: ["eq", "in"] })], entityFields: [entityField("stage", false)] }],
  ])("makes Board unavailable when the only lane field is %s", (_, overrides) => {
    expect(resolve(overrides)).toEqual({ unavailable: LIST_BOARD_LANE_FIELD_UNAVAILABLE });
  });

  it("keeps card content to readable, unmasked placements in published order", () => {
    const cardContent = { fields: [{ field: "secret" }, { field: "due", rendererKey: "date.due" }, { field: "stage" }] };
    expect(resolveCardContent({ cardContent, fields: [listField("due"), listField("stage"), listField("secret")], masked: (key) => key === "secret" }))
      .toEqual({ fields: [{ field: "due", rendererKey: "date.due" }, { field: "stage" }] });
    expect(resolveCardContent({ cardContent, fields: [], masked: () => false })).toBeUndefined();
  });
});
