import { strict as assert } from "node:assert";
import { test } from "node:test";
import { invalidServerTestPlacements } from "./verify-server-test-placement.mjs";

test("new server unit tests must be colocated beneath src", () => {
  assert.deepEqual(
    invalidServerTestPlacements([
      "server/packages/platform/example/src/example.test.ts",
      "server/packages/platform/example/src/feature/example.test.ts",
    ]),
    [],
  );
  assert.deepEqual(
    invalidServerTestPlacements([
      "server/packages/platform/example/src/__tests__/example.test.ts",
      "server/packages/platform/example/tests/example.test.ts",
    ]),
    [
      "server/packages/platform/example/src/__tests__/example.test.ts",
      "server/packages/platform/example/tests/example.test.ts",
    ],
  );
});
