import { test } from "node:test";
import assert from "node:assert/strict";
import { validateQaOwnership } from "./qa-runtime.mjs";
const receipt = (project) => ({
  kind: "ActiveInstanceReceipt",
  metadata: { instance: "qa" },
  spec: { project },
});
test("accepts owned QA and isolated candidate project names", () => {
  for (const project of ["athyper-qa", "athyper-qa-candidate-1789163256545"])
    assert.equal(validateQaOwnership(receipt(project)), project);
});
test("rejects DEV, arbitrary projects and wrong instance receipts", () => {
  for (const project of ["athyper-dev", "athyper-qa-foreign", "other-qa"])
    assert.throws(() => validateQaOwnership(receipt(project)));
  assert.throws(() =>
    validateQaOwnership({
      ...receipt("athyper-qa"),
      metadata: { instance: "dev" },
    }),
  );
});
