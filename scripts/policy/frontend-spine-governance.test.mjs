import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importSpecifiers, packageDependencyCounts, referencesBackupRoot } from "./frontend-spine-governance.mjs";

describe("frontend spine governance", () => {
  it("detects imports from every reference-only root", () => {
    for (const value of ["../../apps-backup/neon", "../packages-backup/platform/ui", "server-backup/src/app"]) {
      assert.equal(referencesBackupRoot(value), true);
    }
    assert.equal(referencesBackupRoot("@athyper/platform-ui"), false);
  });

  it("extracts static imports, exports, dynamic imports, and requires", () => {
    assert.deepEqual(importSpecifiers(`
      import value from "one";
      export { value } from "two";
      const three = import("three");
      const four = require("four");
    `), ["one", "two", "three", "four"]);
  });

  it("counts runtime and workspace dependencies without dev tooling", () => {
    assert.deepEqual(packageDependencyCounts({
      dependencies: { react: "^19", "@athyper/a": "workspace:*" },
      optionalDependencies: { sharp: "^1" },
      devDependencies: { typescript: "^6" },
    }), { runtime: 3, workspace: 1 });
  });
});
