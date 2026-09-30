import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeGraphStorageOrder } from "../../../server/packages/planes/studio/meta-entity-authoring/src/graph-storage-order.js";
import { runContractTests } from "../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.js";
test("database ordering preserves assertion targets and rejects changed values", () => {
  const graph: any = {
    contractSchema: "athyper.meta-entity-contract/2.1",
    entity: { entityCode: "example" },
    fields: [],
    operations: [],
    surfaces: [
      { id: "bbbb", layoutConfig: { value: "expected" } },
      { id: "aaaa", layoutConfig: { value: "other" } },
    ],
    tests: [
      {
        key: "preserved",
        assertion: "path_equals",
        path: "surfaces.0.layoutConfig.value",
        expected: "expected",
      },
    ],
  };
  const stored = normalizeGraphStorageOrder(graph);
  assert.equal(stored.tests![0]!.path, "surfaces.1.layoutConfig.value");
  assert.equal(runContractTests(stored).passed, true);
  assert.deepEqual(normalizeGraphStorageOrder(stored), stored);
  assert.equal(graph.tests[0].path, "surfaces.0.layoutConfig.value");
  const changed: any = structuredClone(stored);
  changed.surfaces[1].layoutConfig.value = "changed";
  assert.equal(runContractTests(changed).passed, false);
  const invalid: any = {
    ...graph,
    tests: [{ ...graph.tests[0], path: "surfaces.9.layoutConfig.value" }],
  };
  assert.equal(
    runContractTests(normalizeGraphStorageOrder(invalid)).passed,
    false,
  );
});
