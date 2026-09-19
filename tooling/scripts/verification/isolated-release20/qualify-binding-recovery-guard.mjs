import fs from "node:fs";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { file, bytes, sourceBytes, sql } from "./binding-recovery-probe.mjs";
const state = JSON.parse(
  cp.execFileSync("docker", ["inspect", "athyper-bp-r20-db"], {
    encoding: "utf8",
  }),
)[0];
assert.deepEqual(Object.keys(state.NetworkSettings.Networks), [
  "athyper-bp-r20-isolated",
]);
const out = cp.execFileSync(
  "docker",
  [
    "exec",
    "-i",
    "athyper-bp-r20-db",
    "psql",
    "-X",
    "-U",
    "postgres",
    "-d",
    "athyper_neon",
    "-At",
    "-v",
    "ON_ERROR_STOP=1",
  ],
  { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
);
assert.ok(out.trim().endsWith("ROLLBACK"));
const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  sourceFile: file,
  sourceSha256: createHash("sha256").update(sourceBytes).digest("hex"),
  functionSqlSha256: createHash("sha256").update(bytes).digest("hex"),
  checks: 6,
  passed: true,
  rolledBack: true,
  deployed: false,
  compatibleRecoveryQualified: false,
  limitations: [
    "Exercises production function bodies against an isolated rollback-only table; no signed recovery successor or deployment is claimed.",
  ],
};
fs.writeFileSync(
  "governance/policy/reports/business-partner-release-20-binding-recovery-guard.dev.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
