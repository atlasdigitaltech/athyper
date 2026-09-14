import assert from "node:assert/strict";
import test from "node:test";
import { reconcileRouteDispositions } from "./server-route-dispositions.mjs";
const manifest = {
  routes: [
    { identity: "GET /old", status: "legacy-only", current: [] },
    { identity: "GET /new", status: "current-only", current: [{}] },
  ],
};
const decision = {
  identity: "GET /old",
  disposition: "replaced",
  replacement: "GET /new",
  owner: "records",
  reason: "Renamed",
  evidence: ["package.json"],
};
test("unmatched routes remain unresolved without explicit evidence", () => {
  assert.equal(reconcileRouteDispositions(manifest).unresolved, 1);
  assert.equal(reconcileRouteDispositions(manifest, [decision]).unresolved, 0);
});
test("rejects missing evidence, missing replacements, stale and duplicate decisions", () => {
  for (const decisions of [
    [{ ...decision, evidence: [] }],
    [{ ...decision, replacement: "GET /absent" }],
    [{ ...decision, identity: "GET /absent" }],
    [decision, decision],
  ])
    assert.throws(() => reconcileRouteDispositions(manifest, decisions));
});
