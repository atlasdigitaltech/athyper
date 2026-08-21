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
