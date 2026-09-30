import { test } from "node:test";
import assert from "node:assert/strict";
import {
  verifyEvidence,
  verifyTestEvidence,
  requiredChecks,
} from "./verify-ci-integrity-evidence.mjs";
import { captureBaseline } from "./capture-ci-integrity-baseline.mjs";
const tests = () => ({
  success: true,
  numTotalTests: 2,
  numPassedTests: 2,
  numFailedTests: 0,
  numPendingTests: 0,
  testResults: [{ status: "passed" }],
});
const fixture = () => ({
  schemaVersion: 1,
  commit: "commit",
  source: { fileCount: 1, sha256: "a".repeat(64) },
  qualified: true,
  checks: requiredChecks.map((name) => ({
    name,
    status: "pass",
    evidence:
      name === "required service PostgreSQL suites"
        ? tests()
        : { receiptCount: 100, manifestSha256: "a".repeat(64) },
  })),
});
test("accepts complete evidence", () => verifyEvidence(fixture(), "commit"));
test("rejects stale, incomplete, failed and duplicate evidence", () => {
  assert.throws(() => verifyEvidence(fixture(), "other"));
  assert.throws(() =>
    verifyEvidence(fixture(), "commit", {
      fileCount: 1,
      sha256: "b".repeat(64),
    }),
  );
  for (const change of [
    (r) => r.checks.pop(),
    (r) => (r.qualified = false),
    (r) => (r.checks[0].status = "skip"),
    (r) => r.checks.push(r.checks[0]),
  ]) {
    const report = fixture();
    change(report);
    assert.throws(() => verifyEvidence(report, "commit"));
  }
});
test("zero tests, skipped tests and empty suite reports fail", () => {
  for (const patch of [
    { numTotalTests: 0 },
    { numPendingTests: 1 },
    { numPassedTests: 1 },
    { testResults: [] },
    { numTodoTests: 1 },
  ])
    assert.throws(() => verifyTestEvidence({ ...tests(), ...patch }));
});
test("unavailable GitHub settings stay unknown, not unprotected", () => {
  const report = captureBaseline("owner/repo", () => ({
    status: "unavailable",
    reason: "HTTP 403",
  }));
  assert.equal(report.availableRuns, 0);
  assert.equal(report.branchProtection.status, "unavailable");
  assert.equal(report.runsStatus, "unavailable");
});
