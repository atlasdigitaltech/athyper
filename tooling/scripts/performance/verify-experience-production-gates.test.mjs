import { spawnSync } from "node:child_process";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const script = resolve(import.meta.dirname, "verify-experience-production-gates.mjs");

test("production experience budget contract is valid", () => {
  const result = spawnSync(process.execPath, [
    "tooling/scripts/performance/verify-experience-production-gates.mjs",
    "--contracts-only",
  ], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /verified/);
});

test("rejects incomplete numeric evidence from any working directory", () => {
  const directory = mkdtempSync(join(tmpdir(), "experience-gate-"));
  const evidence = join(directory, "evidence.json");
  writeFileSync(evidence, JSON.stringify({
    lcpP75Ms: 100,
    inpP75Ms: 50,
    dashboardBootstrapRequests: 1,
    settingsBootstrapRequests: 1,
    maxObservedListPageSize: 50,
  }));
  const result = spawnSync(process.execPath, [script], {
    cwd: tmpdir(),
    encoding: "utf8",
    env: { ...process.env, ATHYPER_EXPERIENCE_GATE_EVIDENCE: evidence },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /shared shell bundle evidence/u);
});
