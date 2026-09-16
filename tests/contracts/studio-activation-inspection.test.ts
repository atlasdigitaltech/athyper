import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyActivation } from "../../server/apps/platform-host/src/composition/meta-entity-activation-inspection";
const expected = { id: "release", contractHash: "hash" } as never;
const row = {
  releaseId: "release",
  contractHash: "hash",
  descriptorSourceHash: "hash",
  appliedReleaseId: "local",
  descriptorHash: "compiled",
  activatedAt: "now",
};
test("activation requires one current descriptor with matching release and source hashes", () => {
  assert.equal(classifyActivation(expected, []).state, "not_active");
  assert.equal(classifyActivation(expected, [row, row]).state, "unavailable");
  assert.equal(
    classifyActivation(expected, [{ ...row, releaseId: "old" }]).state,
    "different_release",
  );
  assert.equal(
    classifyActivation(expected, [{ ...row, descriptorSourceHash: "other" }])
      .state,
    "hash_mismatch",
  );
  assert.equal(classifyActivation(expected, [row]).state, "active");
});
