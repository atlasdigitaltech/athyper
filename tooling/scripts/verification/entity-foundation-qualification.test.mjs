import assert from "node:assert/strict";
import { test } from "node:test";
import { assess, runSuites } from "./qualify-entity-foundation.mjs";

const report = {
  success: true,
  numPassedTests: 2,
  numFailedTests: 0,
  numPendingTests: 1,
  numTodoTests: 0,
  numFailedTestSuites: 0,
};
test("required security tests cannot disappear or become skipped behind other passing tests", () => {
  const required = ["src/security.test.ts"];
  const file = {
    name: "/repo/src/security.test.ts",
    status: "passed",
    assertionResults: [{ status: "passed" }],
  };
  assert.equal(assess({ status: 0 }, report, required).passed, false);
  assert.equal(
    assess({ status: 0 }, { ...report, testResults: [file] }, required).passed,
    true,
  );
  for (const assertionResults of [
    [],
    [{ status: "pending" }],
    [{ status: "failed" }],
  ])
    assert.equal(
      assess(
        { status: 0 },
        { ...report, testResults: [{ ...file, assertionResults }] },
        required,
      ).passed,
      false,
    );
});
test("requires substantive results and distinguishes skipped tests", () => {
  assert.equal(assess({ status: 0 }, report).passed, true);
  assert.equal(assess({ status: 0 }, report).counts.skipped, 1);
  for (const invalid of [
    undefined,
    {},
    { ...report, numPassedTests: 0 },
    { ...report, success: false },
    { ...report, numFailedTestSuites: 1 },
    { ...report, numFailedTests: 1 },
  ])
    assert.equal(assess({ status: 0 }, invalid).passed, false);
  assert.equal(assess({ status: 1 }, report).passed, false);
  assert.equal(
    assess({ status: null, error: "timeout" }, report).passed,
    false,
  );
});
test("a missing report or crashed suite cannot hide later security results", () => {
  const calls = [];
  const results = runSuites(
    [{ id: "missing" }, { id: "crash" }, { id: "security" }],
    (suite) => {
      calls.push(suite.id);
      if (suite.id === "crash") throw Error("missing executable");
      return {
        result: { status: 0 },
        report: suite.id === "missing" ? undefined : report,
      };
    },
  );
  assert.deepEqual(calls, ["missing", "crash", "security"]);
  assert.deepEqual(
    results.map((result) => result.passed),
    [false, false, true],
  );
  assert.throws(() => runSuites([], () => {}), /EMPTY_FOUNDATION/);
});
