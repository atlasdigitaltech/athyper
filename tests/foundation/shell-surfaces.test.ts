import assert from "node:assert/strict";
import test from "node:test";
import { reduceShellSurface, type ShellSurface } from "../../packages/platform/shell/shell/src/shell-surfaces";

test("opening a transient surface replaces the previous surface", () => {
  let state: ShellSurface = { kind: "none" };
  state = reduceShellSurface(state, { type: "navigation", value: true });
  state = reduceShellSurface(state, { type: "header", value: "notifications" });
  assert.deepEqual(state, { kind: "header", action: "notifications" });
  state = reduceShellSurface(state, { type: "quick-access", value: "recent" });
  assert.deepEqual(state, { kind: "quick-access", tab: "recent" });
  assert.deepEqual(reduceShellSurface(state, { type: "dismiss" }), { kind: "none" });
});

test("closing an inactive surface cannot dismiss the newly opened one", () => {
  const state: ShellSurface = { kind: "quick-access", tab: "favourites" };
  assert.equal(reduceShellSurface(state, { type: "header", value: undefined }), state);
  assert.equal(reduceShellSurface(state, { type: "navigation", value: false }), state);
});

test("quick access toggles the selected tab and switches tabs without closing", () => {
  const toggle = (tab: "recent" | "favourites") => (previous: "recent" | "favourites" | undefined) => previous === tab ? undefined : tab;
  let state: ShellSurface = { kind: "none" };
  state = reduceShellSurface(state, { type: "quick-access", value: toggle("recent") });
  state = reduceShellSurface(state, { type: "quick-access", value: toggle("favourites") });
  assert.deepEqual(state, { kind: "quick-access", tab: "favourites" });
  state = reduceShellSurface(state, { type: "quick-access", value: toggle("favourites") });
  assert.deepEqual(state, { kind: "none" });
});
