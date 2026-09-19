import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  artifactReader,
  packages,
  requirements,
  sha256,
  verifyQualification,
} from "./qualify-business-partner-ai.mjs";

import { extendedCapabilities } from "./bp-ai-extended-capabilities.mjs";

const now = Date.parse("2026-09-09T10:00:00Z");
function fixture(
  enabledPackages = packages.slice(0, 6),
  capabilities = enabledPackages.includes("BP-AI-10")
    ? Object.keys(extendedCapabilities)
    : [],
) {
  const manifest = {
    schema: "bp-ai-qualification/1",
    target: "DEV",
    plane: "neon",
    runId: "synthetic-validator-test",
    startedAt: "2026-09-09T09:00:00Z",
    completedAt: "2026-09-09T10:00:00Z",
    enabledPackages,
    enabledExtendedCapabilities: capabilities,
    extendedOwnerContracts: Object.fromEntries(
      capabilities.map((id) => [id, sha256(id)]),
    ),
    binding: Object.fromEntries(
      [
        "sourceTree",
        "deployment",
        "model",
        "prompt",
        "tools",
        "descriptor",
        "policy",
        "contracts",
        "fixtureSet",
      ].map((k) => [`${k}Sha256`, "a".repeat(64)]),
    ),
    evidence: [],
  };
  const files = new Map();
  for (const id of requirements(enabledPackages, capabilities)) {
    const receipt = {
      ...manifest,
      schema: "bp-ai-gate/1",
      id,
      status: "passed",
      sanitized: true,
      capturedAt: manifest.completedAt,
      collector: "synthetic-test-only",
      rawArtifactSha256: "b".repeat(64),
      assertions: [{ id: "synthetic-assertion", passed: true }],
      authorizationFailures: 0,
      unsupportedMutations: 0,
      unbackedFacts: 0,
      persona: id.split(":").at(-1),
      permissionBindingSha256: "c".repeat(64),
      principalSha256: sha256(id.split(":").at(-1)),
      existingPermissionBinding: true,
      authenticated: true,
      browserVersion: "test-browser",
      liveModel: true,
      trials: Array.from({ length: 20 }, (_, i) => ({
        id: `trial-${i}`,
        completed: true,
        ownerFactsVerified: true,
        partialTruthful: true,
        traceSha256: "e".repeat(64),
      })),
      automatedViolations: 0,
      keyboardPassed: true,
      focusPassed: true,
      overflowPassed: true,
      visualReviewPassed: true,
      samples: Array.from({ length: 20 }, () => ({
        evidenceMs: 10,
        firstUsefulTextMs: 20,
        totalMs: 30,
      })),
      datasetRows: 10000,
      acceptedBy: "test-owner",
      budgetRevision: "test-budget",
      rollbackRehearsed: true,
      historyPreserved: true,
      receiptsReconciled: true,
      alertsVerified: true,
      runbookSha256: "f".repeat(64),
      observedEnabledPackages: enabledPackages,
      meshStudioExcluded: true,
      reviewer: "test-reviewer",
      usefulJustifiedNextSteps: true,
      fixtureSetAccepted: true,
    };
    if (id.startsWith("extended:")) {
      const [, capability, dimension] = id.split(":");
      receipt.ownerContractSha256 = manifest.extendedOwnerContracts[capability];
      receipt.assertions = (
        dimension === "owner_contract"
          ? [
              "owner-api-versioned",
              "scope-and-disclosure-policy-versioned",
              "unavailable-and-freshness-semantics",
              "owner-reviewed",
            ]
          : extendedCapabilities[capability][dimension]
      ).map((id) => ({ id, passed: true }));
    }
    receipt.observedExtendedCapabilities = capabilities;
    delete receipt.evidence;
    const path = `${id}.json`,
      bytes = Buffer.from(JSON.stringify(receipt));
    files.set(path, bytes);
    manifest.evidence.push({
      id,
      status: "passed",
      path,
      sha256: sha256(bytes),
    });
  }
  return {
    manifest,
    files,
    verify: () => verifyQualification(manifest, (path) => files.get(path), now),
    edit(id, update) {
      const ref = manifest.evidence.find((r) => r.id === id),
        receipt = JSON.parse(files.get(ref.path));
      update(receipt);
      const bytes = Buffer.from(JSON.stringify(receipt));
      files.set(ref.path, bytes);
      ref.sha256 = sha256(bytes);
    },
  };
}
test("complete synthetic evidence passes for every supported release scope", () => {
  for (const enabled of [packages.slice(0, 6), packages.slice(0, 8), packages])
    assert.equal(fixture(enabled).verify().qualified, true);
});
test("pending, deleted and duplicated coverage cannot qualify", () => {
  for (const mutate of [
    (m) => m.evidence.pop(),
    (m) => (m.evidence[0].status = "pending"),
    (m) => m.evidence.push(m.evidence[0]),
  ]) {
    const f = fixture();
    mutate(f.manifest);
    assert.equal(f.verify().qualified, false);
  }
});
test("package-specific requirements are additive and enforced", () => {
  const ids = requirements(packages);
  for (const id of [
    "browser:A01",
    "service:A14",
    "live-model:A17",
    "proactive:redis-capacity",
  ])
    assert.ok(ids.includes(id));
  const f = fixture();
  f.manifest.enabledPackages.push("BP-AI-08");
  assert.equal(f.verify().qualified, false);
});
test("rejects unknown packages, missing baseline and invalid bindings", () => {
  for (const change of [
    (m) => m.enabledPackages.push("unknown"),
    (m) => m.enabledPackages.shift(),
    (m) => (m.binding.modelSha256 = "latest"),
    (m) => (m.plane = "mesh"),
    (m) => (m.completedAt = "2030-01-01"),
    (m) => (m.completedAt = "2026-08-01"),
  ]) {
    const f = fixture();
    change(f.manifest);
    assert.equal(f.verify().qualified, false);
  }
});
test("receipt integrity, run and deployment mismatch fail closed", () => {
  for (const change of [
    (r) => (r.target = "QA"),
    (r) => (r.runId = "different"),
    (r) => (r.binding.modelSha256 = "f".repeat(64)),
    (r) => (r.capturedAt = "2026-09-08"),
    (r) => (r.assertions = []),
    (r) => (r.assertions[0].passed = false),
    (r) => (r.authorizationFailures = 1),
    (r) => (r.unsupportedMutations = 1),
    (r) => (r.unbackedFacts = 1),
  ]) {
    const f = fixture();
    f.edit("r9", change);
    assert.equal(f.verify().qualified, false);
  }
  const f = fixture();
  f.files.set("r9.json", Buffer.from("{}"));
  assert.equal(f.verify().qualified, false);
});
test("persona receipts must prove existing bindings and authenticated execution", () => {
  for (const change of [
    (r) => (r.existingPermissionBinding = false),
    (r) => (r.permissionBindingSha256 = ""),
    (r) => (r.authenticated = false),
    (r) => (r.persona = "admin"),
  ]) {
    const f = fixture();
    f.edit("browser:persona:directory-reader", change);
    assert.equal(f.verify().qualified, false);
  }
});
test("live quality uses actual trial denominator and rejects unsupported facts", () => {
  const id = "live-model:persona:directory-reader";
  const f = fixture();
  f.edit(id, (r) => (r.trials[0].completed = false));
  assert.equal(f.verify().qualified, true);
  f.edit(id, (r) => (r.trials[1].completed = false));
  assert.equal(f.verify().qualified, false);
  for (const change of [
    (r) => r.trials.pop(),
    (r) => (r.trials[0].ownerFactsVerified = false),
    (r) => (r.trials[0].partialTruthful = false),
    (r) => (r.trials[0].completed = "yes"),
    (r) => (r.liveModel = false),
    (r) => (r.trials[1].id = r.trials[0].id),
  ]) {
    const f = fixture();
    f.edit(id, change);
    assert.equal(f.verify().qualified, false);
  }
});
test("recomputes nearest-rank p95, rejects nonfinite and threshold equality", () => {
  for (const key of ["evidenceMs", "firstUsefulTextMs", "totalMs"]) {
    const f = fixture();
    f.edit("performance", (r) => {
      r.samples[18][key] = 15000;
      r.samples[19][key] = 15000;
    });
    assert.equal(f.verify().qualified, false);
    const g = fixture();
    g.edit("performance", (r) => (r.samples[0][key] = null));
    assert.equal(g.verify().qualified, false);
  }
});
test("requires operations, deployment scope, accessibility and human review", () => {
  for (const [id, key, value] of [
    ["operations", "historyPreserved", false],
    ["deployment", "observedEnabledPackages", []],
    ["accessibility:mobile-dock", "automatedViolations", 1],
    ["human-review", "fixtureSetAccepted", false],
  ]) {
    const f = fixture();
    f.edit(id, (r) => (r[key] = value));
    assert.equal(f.verify().qualified, false);
  }
});
test("artifact reader rejects traversal, absolute paths and symlink escapes", () => {
  const dir = mkdtempSync(join(tmpdir(), "bp-ai-gate-"));
  try {
    const nested = join(dir, "root");
    writeFileSync(join(dir, "outside"), "{}");
    symlinkSync(dir, nested);
    const read = artifactReader(dir);
    assert.throws(() => read("/etc/passwd"));
    symlinkSync("/etc/passwd", join(dir, "escape"));
    assert.throws(() => read("escape"));
    assert.throws(() => read("../absent"));
    assert.equal(read("outside").toString(), "{}");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("malformed evidence never qualifies", () => {
  for (const manifest of [
    null,
    {},
    { evidence: "passed" },
    { evidence: [null] },
  ])
    assert.equal(
      verifyQualification(manifest, () => Buffer.from("{}"), now).qualified,
      false,
    );
});

test("one principal cannot substitute for independent reviewer or another tenant", () => {
  const f = fixture();
  f.edit(
    "browser:persona:independent-reviewer",
    (r) => (r.principalSha256 = sha256("submitter")),
  );
  assert.equal(f.verify().qualified, false);
  const g = fixture();
  g.edit(
    "browser:persona:other-tenant",
    (r) => (r.principalSha256 = sha256("directory-reader")),
  );
  assert.equal(g.verify().qualified, false);
});

test("BP-AI-10 qualifies each capability independently, with draft preview optional", () => {
  for (const capability of Object.keys(extendedCapabilities)) {
    const f = fixture(packages, [capability]);
    assert.equal(f.verify().qualified, true);
    for (const dimension of [
      "owner_contract",
      "evidence_quality",
      "disclosure",
      "workflow",
    ]) {
      const g = fixture(packages, [capability]);
      g.edit(`extended:${capability}:${dimension}`, (r) => r.assertions.pop());
      assert.equal(g.verify().qualified, false);
    }
  }
});
test("extended capability selection and owner binding cannot be omitted or widened", () => {
  for (const mutate of [
    (m) => delete m.enabledExtendedCapabilities,
    (m) => m.enabledExtendedCapabilities.push("unknown"),
    (m) => m.enabledExtendedCapabilities.push(m.enabledExtendedCapabilities[0]),
    (m) => delete m.extendedOwnerContracts.duplicate_candidates,
    (m) => (m.extendedOwnerContracts.duplicate_candidates = "latest"),
    (m) => (m.extendedOwnerContracts = null),
    (m) => m.enabledPackages.splice(m.enabledPackages.indexOf("BP-AI-10"), 1),
  ]) {
    const f = fixture([...packages]);
    mutate(f.manifest);
    assert.equal(f.verify().qualified, false);
  }
});
test("generic receipts cannot substitute for capability evidence", () => {
  for (const [id, mutate] of [
    [
      "extended:duplicate_candidates:disclosure",
      (r) => (r.assertions = [{ id: "passed", passed: true }]),
    ],
    [
      "extended:document_expiry:evidence_quality",
      (r) => (r.ownerContractSha256 = "f".repeat(64)),
    ],
    ["r9", (r) => (r.enabledExtendedCapabilities = [])],
    ["r9", (r) => (r.extendedOwnerContracts = {})],
    [
      "deployment",
      (r) => (r.observedExtendedCapabilities = ["duplicate_candidates"]),
    ],
  ]) {
    const f = fixture(packages);
    f.edit(id, mutate);
    assert.equal(f.verify().qualified, false);
  }
  const f = fixture(packages);
  f.manifest.evidence = f.manifest.evidence.filter(
    (r) => !r.id.startsWith("extended:"),
  );
  assert.equal(
    f.verify().missing.filter((id) => id.startsWith("extended:")).length,
    12,
  );
});
