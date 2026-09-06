import assert from "node:assert/strict";
import test from "node:test";
import { inspectCatalog } from "../src/catalog-inspect.mjs";
import { defaultRepoRoot } from "../src/io.mjs";

test("every Stack v2 native service has exactly one workload disposition", () => {
  const report = inspectCatalog(defaultRepoRoot);
  assert.deepEqual(report.counts, {
    v2NativeServices: 35, presetSelectedDevServices: 20, optionalV2NativeServices: 15,
  });
  assert.deepEqual(report.inventory, {
    missingDisposition: [], duplicateDisposition: [], unknownDisposition: [],
  });
  assert.deepEqual(report.blockers, [
    "Workload set shared-observability is partial.", "Workload set shared-monitoring is design-required.",
  ]);
});

test("invalid workload YAML becomes a reconciliation blocker", () => {
  const report = inspectCatalog(defaultRepoRoot, { readYaml: () => { throw new Error("truncated YAML"); } });
  assert.equal(report.status, "implementation-in-progress");
  assert.match(report.blockers[0], /Workload-set catalog is invalid: truncated YAML/u);
});
