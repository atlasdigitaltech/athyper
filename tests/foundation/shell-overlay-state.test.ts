import assert from "node:assert/strict";
import test from "node:test";
import { initialOverlayState, reduceShellOverlay } from "../../packages/platform/shell/shell/src/shell-overlay-state";
import { activityCount } from "../../packages/platform/shell/shell/src/activity-counts";

test("context and header replace transient Atlas; desktop dock coexists", () => {
  let state = reduceShellOverlay(initialOverlayState, { type: "atlas", field: "open", value: true });
  state = reduceShellOverlay(state, { type: "surface", event: { type: "context", id: "company", open: true } });
  assert.equal(state.atlas.open, false);
  assert.deepEqual(state.surface, { kind: "context", id: "company" });
  state = reduceShellOverlay(state, { type: "atlas", field: "pinned", value: true });
  state = reduceShellOverlay(state, { type: "atlas", field: "open", value: true });
  state = reduceShellOverlay(state, { type: "surface", event: { type: "header", value: "search" } });
  assert.equal(state.atlas.open, true);
  assert.equal(state.atlas.pinned, true);
  state = reduceShellOverlay(state, { type: "atlas", field: "full", value: true });
  assert.equal(state.surface.kind, "none");
  state = reduceShellOverlay(state, { type: "atlas", field: "full", value: false });
  assert.equal(state.atlas.pinned, true);
  assert.equal(state.atlas.open, true);
});

test("compact mode does not leave a dock alongside another surface or persist adaptation", () => {
  let state = reduceShellOverlay(initialOverlayState, { type: "atlas", field: "pinned", value: true });
  state = reduceShellOverlay(state, { type: "atlas", field: "open", value: true });
  state = reduceShellOverlay(state, { type: "compact", value: true });
  state = reduceShellOverlay(state, { type: "surface", event: { type: "navigation", value: true } });
  assert.equal(state.atlas.open, false);
  assert.equal(state.atlas.pinned, true);
  state = reduceShellOverlay(state, { type: "dismiss-context" });
  assert.equal(state.surface.kind, "none");
  assert.equal(state.atlas.open, false);
});

test("late picker cleanup cannot close a different picker", () => {
  const state = reduceShellOverlay(initialOverlayState, { type: "surface", event: { type: "context", id: "new", open: true } });
  assert.equal(reduceShellOverlay(state, { type: "surface", event: { type: "context", id: "old", open: false } }), state);
});

test("activity counts distinguish unknown, zero and complete totals", () => {
  assert.equal(activityCount(undefined, "inbox"), undefined);
  assert.equal(activityCount({ loading: true, openInboxCount: 0 }, "inbox"), undefined);
  assert.equal(activityCount({ error: "Unavailable", openInboxCount: 5 }, "inbox"), undefined);
  assert.equal(activityCount({ inbox: [], hasMoreInbox: true }, "inbox"), undefined);
  assert.equal(activityCount({ inbox: [] }, "inbox"), 0);
  assert.equal(activityCount({ openInboxCount: -1 }, "inbox"), undefined);
  assert.equal(activityCount({ openInboxCount: NaN }, "inbox"), undefined);
  assert.equal(activityCount({ openInboxCount: 104 }, "inbox"), 104);
});
