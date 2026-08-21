import assert from "node:assert/strict";
import test from "node:test";
import { inspectCatalog } from "../src/catalog-inspect.mjs";
import { defaultRepoRoot } from "../src/io.mjs";

test("every legacy Compose service has exactly one Stack v2 workload disposition", () => {
  const report = inspectCatalog(defaultRepoRoot);
  assert.deepEqual(report.counts, {
    legacyServices: 39, resolvedCatalogServices: 39, presetSelectedDevServices: 20, remainingLegacyServices: 19,
  });
  assert.deepEqual(report.inventory, {
    missingFromCatalog: [], absentFromLegacy: [], missingDisposition: [], duplicateDisposition: [], unknownDisposition: [],
  });
  assert.deepEqual(report.blockers, [
    "Workload set shared-observability is partial.", "Workload set shared-monitoring is design-required.",
  ]);
});
