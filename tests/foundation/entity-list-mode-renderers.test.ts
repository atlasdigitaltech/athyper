import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ENTITY_LIST_VIEW_MODES } from "@athyper/contract-platform-entity-list";
import type { EntityListDescriptorV1 } from "@athyper/contract-platform-entity-list";
import { LIST_MODE_RENDERER_MISSING, listRendererKind, withRenderableModes } from "../../packages/platform/entity/runtime/list-view/src/mode-renderers";

describe("list mode renderer registry", () => {
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

  it("returns the same descriptor when every supported mode has a renderer", () => {
    const descriptor = { surface: { supportedModes: ["table", "compact"], defaultState: { mode: "table" } } } as unknown as EntityListDescriptorV1;
    assert.equal(withRenderableModes(descriptor), descriptor);
  });
});
