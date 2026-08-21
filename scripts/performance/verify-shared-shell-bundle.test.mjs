import { spawnSync } from "node:child_process";
import { strict as assert } from "node:assert";
import { test } from "node:test";

test("shared shell bundle remains inside its CI budget", () => {
  const result = spawnSync(process.execPath, [
    "scripts/performance/verify-shared-shell-bundle.mjs",
  ], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Shared shell bundle verified/);
});
