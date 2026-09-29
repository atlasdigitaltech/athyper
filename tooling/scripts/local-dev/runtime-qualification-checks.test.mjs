import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import {
  assertQualificationDiscovery,
  runtimeQualificationSuites,
} from "./runtime-qualification-checks.mjs";

test("qualification rejects partial discovery rather than silently skipping moved tests", () => {
  const root = resolve("fixture-root"),
    suite = runtimeQualificationSuites[0];
  const files = suite.required.map((file) => ({
    file: resolve(root, suite.directory, file),
  }));
  assert.equal(
    assertQualificationDiscovery(root, suite, files).files.length,
    suite.required.length,
  );
  assert.throws(
    () => assertQualificationDiscovery(root, suite, []),
    /empty or invalid/,
  );
  assert.throws(
    () => assertQualificationDiscovery(root, suite, files.slice(1)),
    /test not discovered/,
  );
  assert.throws(
    () =>
      assertQualificationDiscovery(root, suite, [
        { file: "src/composition/dev-publication.test.ts" },
      ]),
    /test not discovered/,
  );
});
