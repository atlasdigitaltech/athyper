import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { defaultRepoRoot } from "../src/io.mjs";
import { executeOperationsOperation } from "../src/operations-execution.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "athyper-operations-"));
  const secretDirectory = join(root, "operations/secrets");
  mkdirSync(secretDirectory, { recursive: true, mode: 0o700 });
  const secret = join(secretDirectory, "grafana-admin-password");
  writeFileSync(secret, "fixture-secret\n", { mode: 0o600 }); chmodSync(secret, 0o600);
  const calls = [];
  return { root, calls, dependencies: {
    runtimeRoot: root, now: () => new Date("2026-08-22T01:02:03.000Z"),
    sourceRevision: "2".repeat(40), operator: "test-operator",
    run: (_program, args) => { calls.push(args); return { ok: true, status: 0, stdout: "", stderr: "" }; },
    plan: () => ({ blockers: [], composeProfiles: [] }),
    startForwarder: (_repo, directory) => { mkdirSync(directory, { recursive: true }); writeFileSync(join(directory, "forwarder.pid"), "4242\n"); return 4242; },
    stopForwarder: () => undefined,
  } };
}

test("operations up is confirmed, receipt-owned, and starts Compose before forwarding", () => {
  const context = fixture();
  assert.throws(() => executeOperationsOperation(defaultRepoRoot, "up", "lite", { confirm: "wrong" }, context.dependencies), /--confirm lite/u);
  const receipt = executeOperationsOperation(defaultRepoRoot, "up", "lite", { confirm: "lite" }, context.dependencies);
  assert.equal(receipt.spec.status, "succeeded");
  assert.equal(receipt.spec.artifacts.forwarderPid, 4242);
  assert.ok(context.calls[0].includes("config"));
  assert.ok(context.calls[1].includes("up"));
  const active = JSON.parse(readFileSync(join(context.root, "operations/receipts/active.json"), "utf8"));
  assert.equal(active.spec.project, "athyper-operations");
  assert.equal(active.spec.state, "running");
});

test("operations down requires ownership and retains volumes", () => {
  const context = fixture();
  executeOperationsOperation(defaultRepoRoot, "up", "lite", { confirm: "lite" }, context.dependencies);
  const receipt = executeOperationsOperation(defaultRepoRoot, "down", undefined, { confirm: "operations" }, context.dependencies);
  assert.equal(receipt.spec.status, "succeeded");
  const command = context.calls.at(-1);
  assert.ok(command.includes("down"));
  assert.ok(!command.includes("--volumes"));
  const active = JSON.parse(readFileSync(join(context.root, "operations/receipts/active.json"), "utf8"));
  assert.equal(active.spec.state, "stopped");
});
