import assert from "node:assert/strict";
import test from "node:test";
import { findGenericPlaneFallbacks, verifyGovernancePlaneComposition } from "./verify-governance-plane-composition.mjs";

test("rejects generic nullish plane fallback construction", () => {
  const findings = findGenericPlaneFallbacks("const governanceDatabase = databases.neon ?? databases.studio ?? databases.mesh;");
  assert.equal(findings.length, 1);
});

test("accepts an immutable exact-key registry", () => {
  assert.deepEqual(findGenericPlaneFallbacks("const repositories = createExactPlaneRepositoryProvider({ neon, studio, mesh });"), []);
});

test("current governance/control host composition has no generic fallback", () => {
  assert.equal(verifyGovernancePlaneComposition(), true);
});
