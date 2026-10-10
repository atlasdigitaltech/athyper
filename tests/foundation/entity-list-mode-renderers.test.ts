import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ENTITY_LIST_VIEW_MODES } from "@athyper/contract-platform-entity-list";
import type { EntityListDescriptorV1 } from "@athyper/contract-platform-entity-list";
import { LIST_MODE_RENDERER_MISSING, hostLayouts, classifyListHost, listModeTraits, listRendererKind, withRenderableModes } from "../../packages/platform/entity/runtime/list-view/src/mode-renderers";

describe("list mode renderer registry", () => {
  it("declares per-layout list policy as renderer traits, not mode comparisons", () => {
    // Date layouts report their own counts, so the list title shows none.
    assert.deepEqual(["table", "compact", "board", "calendar", "gantt"].map((mode) => listModeTraits(mode as never).ownCounts), [false, false, false, true, true]);
    assert.deepEqual(["table", "compact", "board", "calendar", "gantt"].map((mode) => listModeTraits(mode as never).ownPaging), [false, false, true, true, true]);
    assert.equal(listModeTraits("gantt").ownGrouping, true);
    assert.equal(listRendererKind("gantt", "narrow"), "gantt");
    assert.equal(listRendererKind("table", "narrow"), "cards");
    assert.deepEqual(listModeTraits("dashboard"), { adaptsWhenNarrow: false, ownPaging: false, ownGrouping: false, ownCounts: false });
  });

  it("renders table and compact through their registered renderers", () => {
    assert.equal(listRendererKind("table", "wide"), "table");
    assert.equal(listRendererKind("compact", "wide"), "cards");
    assert.equal(listRendererKind("compact", undefined), "cards");
  });

  it("presents table and compact as cards at narrow width, and keeps the board", () => {
    for (const mode of ENTITY_LIST_VIEW_MODES.filter((item) => item === "table" || item === "compact"))
      assert.equal(listRendererKind(mode, "narrow"), "cards");
    assert.equal(listRendererKind("board", "wide"), "board");
    assert.equal(listRendererKind("board", "narrow"), "board");
  });

  it("never draws an unregistered mode through another renderer", () => {
    for (const mode of ["dashboard", "spreadsheet"] as const) {
      assert.equal(listRendererKind(mode, "wide"), undefined);
      assert.equal(listRendererKind(mode, "narrow"), undefined);
    }
  });

  it("moves supported modes without a renderer into unavailableModes", () => {
    const descriptor = {
      surface: {
        supportedModes: ["spreadsheet", "table", "compact"],
        unavailableModes: [{ mode: "dashboard", code: "LIST_MODE_UNSUPPORTED" }],
        defaultState: { mode: "spreadsheet" },
      },
    } as unknown as EntityListDescriptorV1;
    const normalized = withRenderableModes(descriptor);
    assert.deepEqual(normalized.surface.supportedModes, ["table", "compact"]);
    assert.deepEqual(normalized.surface.unavailableModes, [
      { mode: "dashboard", code: "LIST_MODE_UNSUPPORTED" },
      { mode: "spreadsheet", code: LIST_MODE_RENDERER_MISSING },
    ]);
    assert.equal(normalized.surface.defaultState.mode, "table");
  });

  it("keeps Board for list pages and drops it, with its projection, for choosers", () => {
    const descriptor = {
      surface: { supportedModes: ["table", "board"], board: { laneFields: [] }, defaultState: { mode: "board" } },
    } as unknown as EntityListDescriptorV1;
    assert.equal(withRenderableModes(descriptor), descriptor);
    const chooser = withRenderableModes(descriptor, { board: false });
    assert.deepEqual(chooser.surface.supportedModes, ["table"]);
    assert.equal(chooser.surface.board, undefined);
    assert.equal(chooser.surface.defaultState.mode, "table");
    assert.deepEqual(chooser.surface.unavailableModes, [{ mode: "board", code: LIST_MODE_RENDERER_MISSING }]);
  });

  it("never lists a mode twice or as both supported and unavailable", () => {
    const descriptor = {
      surface: {
        supportedModes: ["table", "dashboard", "dashboard"],
        unavailableModes: [{ mode: "dashboard", code: "LIST_MODE_UNSUPPORTED" }],
        defaultState: { mode: "table" },
      },
    } as unknown as EntityListDescriptorV1;
    const normalized = withRenderableModes(descriptor);
    assert.deepEqual(normalized.surface.supportedModes, ["table"]);
    assert.deepEqual(normalized.surface.unavailableModes, [{ mode: "dashboard", code: "LIST_MODE_UNSUPPORTED" }]);
  });

  it("returns the same descriptor when every supported mode has a renderer", () => {
    const descriptor = { surface: { supportedModes: ["table", "compact"], defaultState: { mode: "table" } } } as unknown as EntityListDescriptorV1;
    assert.equal(withRenderableModes(descriptor), descriptor);
  });

  it("decides layouts by declared host: pages and record sections offer every layout, record pickers Tree only", () => {
    assert.equal(classifyListHost({ lookup: false, section: false }), "page");
    assert.equal(classifyListHost({ lookup: false, section: true }), "section");
    assert.equal(classifyListHost({ lookup: true, section: false }), "picker");
    assert.deepEqual(hostLayouts("section"), { board: true, calendar: true, gantt: true, tree: true, matrix: true, aggregate: true });
    assert.deepEqual(hostLayouts("page"), { board: true, calendar: true, gantt: true, tree: true, matrix: true, aggregate: true });
    // A picker may offer Tree for a hierarchical target (Tree blueprint B5); never a Matrix or a Summary.
    assert.deepEqual(hostLayouts("picker"), { board: false, calendar: false, gantt: false, tree: true, matrix: false, aggregate: false });
    assert.equal(listModeTraits("aggregate").ownCounts, true);
    assert.equal(listRendererKind("aggregate", "narrow"), "aggregate");
    assert.equal(listModeTraits("matrix").ownCounts, true);
    assert.equal(listRendererKind("matrix", "narrow"), "matrix");
    assert.equal(listModeTraits("tree").ownPaging, true);
    assert.equal(listRendererKind("tree", "narrow"), "tree");
  });
});
