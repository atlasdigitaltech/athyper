import assert from "node:assert/strict";
import test from "node:test";
import { defaultRepoRoot } from "../src/io.mjs";
import { createOperationsPlan } from "../src/operations.mjs";

const probes = { runtimeRoot: "/fixture", secretProblem: () => null, liveProject: () => "", owned: false };

test("laptop-32 operations modes are bounded and mutually exclusive", () => {
  const expected = {
    lite: [5, 1_408, 1.35], tracing: [6, 1_792, 1.7], statuswatch: [6, 1_600, 1.55],
  };
  for (const [mode, [count, memoryMiB, cpu]] of Object.entries(expected)) {
    const plan = createOperationsPlan(defaultRepoRoot, mode, probes);
    assert.equal(plan.status, "ready-for-explicit-authorization");
    assert.equal(plan.services.length, count);
    assert.equal(plan.resources.memoryMiB, memoryMiB);
    assert.equal(plan.resources.cpu, cpu);
    assert.equal(plan.concurrencyPolicy.exactlyOneMode, true);
    assert.equal(plan.concurrencyPolicy.fullObservabilityProhibited, true);
    assert.equal(plan.concurrencyPolicy.simultaneousMonitoringModesProhibited, true);
    assert.equal(plan.ownershipReceipt.owned, false);
  }
});

test("uncomposed heavy monitoring modes remain explicitly blocked", () => {
  for (const mode of ["cronwatch", "errorcollect"]) {
    const plan = createOperationsPlan(defaultRepoRoot, mode, probes);
    assert.equal(plan.status, "blocked");
    assert.ok(plan.blockers.some((problem) => problem.includes("design-only")));
  }
  assert.throws(() => createOperationsPlan(defaultRepoRoot, "full", probes), /Unsupported operations mode/u);
});
