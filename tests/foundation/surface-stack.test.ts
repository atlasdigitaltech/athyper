import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SURFACE_ORDER, topSurface, validateSurfaceOpen } from "../../packages/platform/foundation/surface-kit/src/stack-rules";

describe("surface stack rules", () => {
  it("keeps page, overlay, drawer, popover, confirmation monotonic", () => {
    assert.ok(SURFACE_ORDER.page < SURFACE_ORDER.overlay);
    assert.ok(SURFACE_ORDER.overlay < SURFACE_ORDER["form-drawer"]);
    assert.ok(SURFACE_ORDER["form-drawer"] < SURFACE_ORDER.popover);
    assert.ok(SURFACE_ORDER.popover < SURFACE_ORDER["confirm-dialog"]);
  });
  it("rejects pages, drawer-in-drawer, and reverse stacking", () => {
    assert.equal(validateSurfaceOpen([], "page").ok, false);
    assert.deepEqual(validateSurfaceOpen([{ kind: "context-drawer" }], "form-drawer").ok, false);
    assert.deepEqual(validateSurfaceOpen([{ kind: "confirm-dialog" }], "popover").ok, false);
  });
  it("returns the active top surface", () => { assert.equal(topSurface([{ kind: "overlay" }, { kind: "popover" }])?.kind, "popover"); assert.equal(topSurface([]), null); });
});
