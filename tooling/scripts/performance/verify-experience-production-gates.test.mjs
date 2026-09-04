import { spawnSync } from "node:child_process";
import { strict as assert } from "node:assert";
import { test } from "node:test";

test("production experience budget contract is valid", () => {
  const result = spawnSync(process.execPath, [
    "tooling/scripts/performance/verify-experience-production-gates.mjs",
    "--contracts-only",
  ], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /verified/);
});
