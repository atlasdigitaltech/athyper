import { spawnSync } from "node:child_process";
import { strict as assert } from "node:assert";
import { test } from "node:test";

test("experience cleanup inventory matches the repository", () => {
  const result = spawnSync(process.execPath, [
    "scripts/policy/verify-experience-cleanup.mjs",
  ], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
