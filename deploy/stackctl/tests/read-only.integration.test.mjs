import assert from "node:assert/strict";
import { existsSync, statSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { collectDoctor } from "../src/doctor.mjs";
import { defaultRepoRoot, runReadOnly, runtimeRoot } from "../src/io.mjs";
import { createPlan, renderConfig } from "../src/plan.mjs";
import { createLifecyclePlan } from "../src/lifecycle.mjs";
import { createRehearsalPlan } from "../src/rehearsal.mjs";
import { createCapabilityPlan } from "../src/capability.mjs";
import { assessOrchestrator } from "../src/orchestrator.mjs";
import { inspectRemainingGates } from "../src/gates.mjs";

function lines(command, args) {
  const result = runReadOnly(command, args, { timeout: 15_000 });
  return result.ok ? result.stdout.split(/\r?\n/u).filter(Boolean).sort() : [];
}

function snapshot() {
  const runtime = runtimeRoot();
  return {
    containers: lines("docker", ["ps", "-aq"]),
    images: lines("docker", ["image", "ls", "-q", "--no-trunc"]),
    networks: lines("docker", ["network", "ls", "-q", "--no-trunc"]),
    volumes: lines("docker", ["volume", "ls", "-q"]),
    hostsMtimeMs: existsSync("/etc/hosts")
      ? statSync("/etc/hosts").mtimeMs
      : null,
    runtimeEntries: existsSync(runtime)
      ? lines("find", [runtime, "-mindepth", "1", "-printf", "%P\\n"])
      : [],
    gitStatus: lines("git", [
      "-C",
      defaultRepoRoot,
      "status",
      "--porcelain=v1",
    ]),
  };
}

test("all controller assessments and plans do not mutate machine state", (t) => {
  // Local QA overrides belong to their deployed instance, not these template plans.
  // Use an empty operator root while still snapshotting real Docker/host state.
  const previousRoot = process.env.ATHYPER_RUNTIME_ROOT;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "athyper-read-only-"));
  process.env.ATHYPER_RUNTIME_ROOT = isolatedRoot;
  t.after(() => {
    if (previousRoot === undefined) delete process.env.ATHYPER_RUNTIME_ROOT;
    else process.env.ATHYPER_RUNTIME_ROOT = previousRoot;
    rmSync(isolatedRoot, { recursive: true, force: true });
  });
  const before = snapshot();
  const doctor = collectDoctor(defaultRepoRoot);
  const rendered = renderConfig(defaultRepoRoot, "dev");
  const plan = createPlan(defaultRepoRoot, "dev");
  const qaLifecycle = createLifecyclePlan(defaultRepoRoot, "qa", "reset");
  const stgRehearsal = createRehearsalPlan(defaultRepoRoot, "stg", "qa");
  const productionRehearsal = createRehearsalPlan(
    defaultRepoRoot,
    "production",
    "stg",
  );
  const capability = createCapabilityPlan(
    defaultRepoRoot,
    "dev",
    "observability",
  );
  const orchestrator = assessOrchestrator(defaultRepoRoot);
  const gates = inspectRemainingGates(defaultRepoRoot);
  const after = snapshot();
  assert.equal(doctor.readOnly, true);
  assert.equal(rendered.kind, "RenderedInstance");
  assert.equal(plan.readOnly, true);
  assert.equal(qaLifecycle.readOnly, true);
  assert.equal(qaLifecycle.executionAuthorized, false);
  assert.equal(stgRehearsal.readOnly, true);
  assert.equal(stgRehearsal.executionAuthorized, false);
  assert.equal(productionRehearsal.readOnly, true);
  assert.equal(productionRehearsal.executionAuthorized, false);
  assert.equal(capability.readOnly, true);
  assert.equal(capability.executionAuthorized, false);
  assert.equal(orchestrator.readOnly, true);
  assert.equal(orchestrator.executionAuthorized, false);
  assert.equal(gates.readOnly, true);
  assert.equal(gates.executionAuthorized, false);
  assert.deepEqual(after, before);
});
