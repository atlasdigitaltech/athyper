import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import { validateCoverage } from "./ddl-service-coverage-policy.mjs";
import { EVIDENCE_FIELDS } from "./generate-ddl-service-coverage.mjs";
import { verifyEvidenceReferences, verifyFeatureGateReferences } from "./verify-ddl-service-coverage.mjs";

const root = resolve(import.meta.dirname, "../../..");
const existingTest = "tooling/tools/scripts/ddl-service-coverage-policy.test.mjs";

test("accepts a fully evidenced coverage row", async () => {
  const errors = await validateCoverage({ rows: [{
    tableKey: "ledger.entry",
    classification: "append_only",
    serviceOwner: "@athyper/server-service-finance",
    reviewStatus: "reviewed",
    commands: { decision: "supported", codes: ["finance.ledger.post"] },
    mutationComposition: "composed",
    replayEvidence: [existingTest],
    immutabilityEvidence: [existingTest],
    reversalEvidence: [existingTest],
    auditEvent: [existingTest],
    outboxEvent: [existingTest],
  }] }, { root });
  assert.deepEqual(errors, []);
});

test("reports every required policy failure", async () => {
  const errors = await validateCoverage({ rows: [
    { tableKey: "app.mutable", classification: "runtime_mutable", serviceOwner: "none", reviewStatus: "provisional", commands: { decision: "not_exposed", codes: [], reason: "baseline" } },
    { tableKey: "event.entry", classification: "append_only", serviceOwner: "events" },
    { tableKey: "finance.account_balance", classification: "projection", serviceOwner: "finance" },
    { tableKey: "app.composed", classification: "runtime_mutable", serviceOwner: "app", commands: { decision: "supported", codes: ["app.write"] }, mutationComposition: "composed", auditEvent: [] },
  ] }, { root });
  assert.ok(errors.some((error) => error.includes("missing ownership row")));
  assert.ok(errors.some((error) => error.includes("classification and ownership remain provisional")));
  assert.ok(errors.some((error) => error.includes("qualified command")));
  assert.ok(errors.some((error) => error.includes("replay evidence")));
  assert.ok(errors.some((error) => error.includes("immutability evidence")));
  assert.ok(errors.some((error) => error.includes("reversal evidence")));
  assert.ok(errors.some((error) => error.includes("concurrency evidence")));
  assert.ok(errors.some((error) => error.includes("rebuild or reconciliation evidence")));
  assert.ok(errors.some((error) => error.includes("lacks outbox evidence")));
});

test("accepts explicit approved none and not_exposed decisions", async () => {
  const errors = await validateCoverage({ rows: [{
    tableKey: "internal.state",
    classification: "runtime_mutable",
    serviceOwner: "none",
    reviewStatus: "reviewed",
    commands: { decision: "not_exposed", codes: [], reason: "internal state" },
  }] }, { root });
  assert.deepEqual(errors, []);
});

test("rejects a discovered table whose ownership review was omitted", async () => {
  const errors = await validateCoverage({ rows: [{
    tableKey: "new_slice.omitted_table",
    classification: "runtime_mutable",
    serviceOwner: "none",
    reviewStatus: "provisional",
    commands: { decision: "not_exposed", codes: [], reason: "generated baseline" },
  }] }, { root });
  assert.ok(errors.some((error) => error.includes("classification and ownership remain provisional")));
  assert.ok(errors.some((error) => error.includes("missing ownership row")));
});

test("rejects missing evidence and directories used as test evidence", async () => {
  const emptyEvidence = Object.fromEntries(EVIDENCE_FIELDS.map((field) => [field, []]));
  const errors = [];
  await verifyEvidenceReferences({ rows: [{
    sourceKey: "test:policy.row",
    ...emptyEvidence,
    repository: ["missing/repository.ts"],
    unitTests: ["tooling/tools/scripts"],
  }] }, root, errors);
  assert.ok(errors.some((error) => error.includes("missing/repository.ts")));
  assert.ok(errors.some((error) => error.includes("tooling/tools/scripts")));
});

test("feature gates require a configuration declaration and a non-test composition consumer", async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const scratch = await mkdtemp(resolve(tmpdir(), "athyper-gate-wiring-"));
  try {
    const host = resolve(scratch, "server/apps/platform-host/src");
    await mkdir(resolve(host, "config"), { recursive: true });
    await mkdir(resolve(host, "composition"), { recursive: true });
    await writeFile(resolve(host, "config/environment.ts"), 'enabled: readBoolean("KNOWN_GATE", false), unwired: readBoolean("UNWIRED_GATE", false)');
    await writeFile(resolve(host, "composition/services.ts"), "if (config.enabled) register();");
    await writeFile(resolve(host, "composition/services.test.ts"), "config.unwired;");
    const errors = [];
    await verifyFeatureGateReferences({ rows: ["KNOWN_GATE", "MISSING_GATE", "UNWIRED_GATE"].map(featureGate => ({ featureGate })) }, scratch, errors);
    assert.equal(errors.length, 2);
    assert.ok(errors.some(error => error.includes("MISSING_GATE") && error.includes("no host configuration")));
    assert.ok(errors.some(error => error.includes("UNWIRED_GATE") && error.includes("no host composition")));
  } finally { await rm(scratch, { recursive: true, force: true }); }
});
