import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ENTITY_LIST_VIEW_MODES } from "@athyper/contract-platform-entity-list";
import { listRendererKind } from "../../packages/platform/entity/runtime/list-view/src/mode-renderers";

describe("list mode renderer registry", () => {
  it("renders table and compact through their registered renderers", () => {
    assert.equal(listRendererKind("table", "wide"), "table");
    assert.equal(listRendererKind("compact", "wide"), "cards");
    assert.equal(listRendererKind("compact", undefined), "cards");
  });

  it("presents every mode as cards at narrow width", () => {
    for (const mode of ENTITY_LIST_VIEW_MODES) assert.equal(listRendererKind(mode, "narrow"), "cards");
  });

  it("keeps the existing table fall-through for unregistered modes", () => {
    for (const mode of ["board", "dashboard", "spreadsheet"] as const) {
      assert.equal(listRendererKind(mode, "wide"), "table");
      assert.equal(listRendererKind(mode, "medium"), "table");
    }
  });
});
