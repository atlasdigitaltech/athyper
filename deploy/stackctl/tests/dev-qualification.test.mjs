import assert from "node:assert/strict";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { evaluateDevQualification } from "../src/dev-qualification.mjs";
import { loadModel } from "../src/model.mjs";
import { createValidator } from "../src/schema.mjs";

const repoRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

test("DEV qualification records unproven functional acceptance as blockers", () => {
  const model = loadModel(repoRoot, "dev");
  const expected = model.selected.filter((service) => ["long-running", "stateful"].includes(service.lifecycle));
  const containers = expected.map((service) => ({
    service: service.id, name: `athyper-dev-${service.id}-1`, image: service.image,
    state: "running", health: "healthy", restartCount: 0, cpuPercent: 0, memoryUsage: "1MiB / 1GiB",
  }));
  const revision = "0123456789abcdef";
  const document = evaluateDevQualification({
    model,
    receipt: { spec: { state: "running", project: "athyper-dev", sourceRevision: revision, updatedAt: "2026-08-21T00:00:00Z" } },
    revision,
    containers,
    endpoints: [{ id: "api-readiness", label: "API readiness", ok: true, status: "200" }],
    qualifiedAt: "2026-08-21T00:00:00.000Z",
  });
  assert.equal(document.spec.status, "blocked");
  assert.ok(document.spec.blockers.includes("worker-exactly-once"));
  assert.equal(document.spec.checks.find((item) => item.id === "service-topology").status, "pass");
  createValidator(repoRoot)(document, "unit-test");
});

test("DEV qualification detects source, topology, restart, and readiness failures", () => {
  const model = loadModel(repoRoot, "dev");
  const document = evaluateDevQualification({
    model,
    receipt: { spec: { state: "running", project: "athyper-dev", sourceRevision: "old", updatedAt: "2026-08-21T00:00:00Z" } },
    revision: "new-revision", containers: [],
    endpoints: [{ id: "api-readiness", label: "API readiness", ok: false, status: "503" }],
    qualifiedAt: "2026-08-21T00:00:00.000Z",
  });
  assert.deepEqual(document.spec.blockers.slice(0, 2), ["deployment-source-current", "service-topology"]);
  assert.ok(document.spec.blockers.includes("api-readiness"));
});

test("DEV qualification reuses authenticated platform verification fixture evidence", () => {
  const model = loadModel(repoRoot, "dev");
  const expected = model.selected.filter((service) => ["long-running", "stateful"].includes(service.lifecycle));
  const revision = "0123456789abcdef";
  const verificationIds = ["identity.session", "identity.iam", "runtime.worker", "runtime.scheduler", "document.storage-round-trip", "document.clean-scan", "document.extract", "document.render", "search.round-trip", "mail.delivery"];
  const document = evaluateDevQualification({
    model,
    receipt: { spec: { state: "running", project: "athyper-dev", sourceRevision: revision, updatedAt: "2026-08-21T00:00:00Z" } },
    revision,
    containers: expected.map((service) => ({ service: service.id, name: `athyper-dev-${service.id}-1`, image: service.image, state: "running", health: "healthy", restartCount: 0, cpuPercent: 0, memoryUsage: "1MiB / 1GiB" })),
    endpoints: [],
    qualifiedAt: "2026-08-21T00:00:00.000Z",
    verification: { document: { runId: "verification-run", checks: verificationIds.map((id) => ({ id, status: "passed" })) } },
  });
  for (const id of Object.keys({ "api-authenticated-request": 1, "worker-exactly-once": 1, "scheduler-no-duplication": 1, "document-pipeline": 1, "mail-webhook": 1 })) {
    assert.equal(document.spec.checks.find((item) => item.id === id).status, "pass");
  }
  assert.deepEqual(document.spec.blockers, ["auth-session-planes", "telemetry-dimensions"]);
  createValidator(repoRoot)(document, "unit-test");
});
