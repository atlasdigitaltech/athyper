import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { sourceBinding } from "./ci-integrity-binding.mjs";

export function verifyTestEvidence(report) {
  assert.equal(report.success, true, "test runner must report success");
  assert.ok(
    Number.isInteger(report.numTotalTests) && report.numTotalTests > 0,
    "zero tests cannot qualify",
  );
  assert.equal(
    report.numPassedTests,
    report.numTotalTests,
    "all required tests must pass",
  );
  assert.equal(report.numFailedTests, 0);
  assert.equal(report.numPendingTests, 0, "skips cannot qualify");
  assert.equal(report.numTodoTests ?? 0, 0, "todo tests cannot qualify");
  assert.ok(
    report.testResults?.length > 0,
    "per-file test evidence is required",
  );
  assert.ok(
    report.testResults.every((result) => result.status === "passed"),
    "every collected suite must pass",
  );
}
export const requiredChecks = [
  ...["studio", "neon", "mesh"].flatMap((plane) =>
    [
      "canonical DDL",
      "seed replay, drift convergence and wrong-plane rejection",
      "db:verify:rls",
      "db:verify:security-definer",
      "negative RLS disabled",
      "negative PUBLIC function execution",
    ].map((check) => `${plane}: ${check}`),
  ),
  ...["studio", "neon", "mesh"].map(
    (plane) =>
      `${plane}: permission FK, runtime writer denial and tenant role isolation`,
  ),
  "studio: fixtures/publication-authority.sql",
  "studio: ci-entity-release-contract.sql",
  "neon: fixtures/runtime-entity-projection.sql",
  "neon: business-partner-profile-projection.sql",
  "required service PostgreSQL suites",
  "PgBouncer transaction stamping: commit, rollback, no-context denial and tenant switch",
];
export function verifyEvidence(report, commit, source = report.source) {
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.commit, commit, "evidence must bind this commit");
  assert.ok(report.source?.fileCount > 0, "source binding is required");
  assert.match(report.source?.sha256 ?? "", /^[a-f0-9]{64}$/);
  assert.deepEqual(report.source, source, "source changed since qualification");
  assert.equal(
    report.qualified,
    true,
    "failed/incomplete execution cannot qualify",
  );
  assert.equal(report.error, undefined, "failed execution cannot qualify");
  assert.ok(Array.isArray(report.checks));
  assert.ok(
    report.checks.every((check) => check.status === "pass"),
    "a failed independent check cannot qualify",
  );
  assert.equal(
    new Set(report.checks.map((check) => check.name)).size,
    report.checks.length,
    "duplicate evidence",
  );
  for (const name of requiredChecks) {
    const check = report.checks.find((check) => check.name === name);
    assert.equal(check?.status, "pass", `missing or failed evidence: ${name}`);
    if (name.endsWith("canonical DDL")) {
      assert.ok(check.evidence?.receiptCount > 0);
      assert.match(check.evidence?.manifestSha256 ?? "", /^[a-f0-9]{64}$/);
    }
    if (name === "required service PostgreSQL suites")
      verifyTestEvidence(check.evidence);
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  verifyEvidence(
    JSON.parse(readFileSync(process.argv[2], "utf8")),
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    sourceBinding(),
  );
  console.log(
    "CI database evidence contains every required check and nonempty, zero-skip test results for this commit.",
  );
}
