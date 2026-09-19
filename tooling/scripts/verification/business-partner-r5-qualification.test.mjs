import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  r5Gates,
  verifyBusinessPartnerR5Qualification,
} from "./verify-business-partner-r5-qualification.mjs";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const id = (n) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "r5-gates-"));
  const dir = "governance/evidence/business-partner/r5-target";
  mkdirSync(join(root, dir), { recursive: true });
  mkdirSync(join(root, "governance/policy/reports"), {
    recursive: true,
  });
  writeFileSync(
    join(root, "governance/policy/reports/business-partner-customer-state-review.md"),
    "Test-only state packet",
  );
  const lifecycle = [
    "activate",
    "suspend",
    "reactivate",
    "deactivate",
    "archive",
  ].map((action, index) => ({
    action,
    eventId: id(index + 1),
    version: index + 2,
  }));
  const proofs = {
    onboarding: {
      caseId: id(10),
      materializationId: id(11),
      sourceSnapshotId: id(12),
      resultSnapshotId: id(13),
      mutationJourney: true,
      customerCount: 1,
      customerStatus: "prospect",
      lineageRetained: true,
    },
    role_extensions: { identityReused: true, oppositeAuthorityUnchanged: true },
    controls: {
      creditRejected: true,
      staleCreditDenied: true,
      blockedActivationDenied: true,
      designationScopeVerified: true,
      independentReconciliation: true,
      lifecycle,
    },
    lifecycle_negative: {
      outcomes: [
        "exact_replay",
        "conflicting_key_denied",
        "stale_version_denied",
        "wrong_tenant_denied",
        "permission_denied",
        "invalid_transition_denied",
      ],
    },
    downstream: {
      deliveries: lifecycle.map((event, index) => ({
        lifecycleEventId: event.eventId,
        projectionReceiptId: id(20 + index),
        notificationReceiptId: id(30 + index),
        projectionStatus: "consumed",
        notificationStatus: "delivered",
        desiredState: ["activate", "reactivate"].includes(event.action)
          ? "active"
          : "inactive",
      })),
    },
    product_approval: {
      decisionId: "BP-Q002",
      decision: "approved",
      accountableRole: "NEON Master Data",
      reviewerName: "Test Reviewer",
      reviewerPrincipalId: id(40),
      approvedAt: "2026-01-01T00:00:00Z",
      packetSha256: sha("Test-only state packet"),
      archiveRetentionSemanticsAccepted: true,
      reactivationBlockSemanticsAccepted: true,
    },
  };
  const receipts = {};
  for (const gate of Object.keys(r5Gates)) {
    const artifact = `${dir}/${gate}-artifact.json`;
    const bytes = JSON.stringify({ testOnly: true, gate });
    writeFileSync(join(root, artifact), bytes);
    if (gate === "product_approval")
      proofs[gate].approvalEvidenceSha256 = sha(bytes);
    receipts[gate] = {
      schema: "athyper.business-partner-r5-target-receipt/1",
      gate,
      result: "passed",
      environment: "production",
      sanitized: true,
      completedAt: "2026-01-01T00:00:01Z",
      sourceRevision: "a".repeat(40),
      buildDigest: "b".repeat(64),
      targetId: "test-only",
      scenarios: r5Gates[gate],
      artifact,
      artifactSha256: sha(bytes),
      proof: proofs[gate],
    };
  }
  const manifest = {
    $schema: "athyper.business-partner-r5-qualification/1",
    productionQualified: true,
    productionQualification: "qualified",
    gates: Object.keys(r5Gates).map((gate) => ({
      id: gate,
      status: "passed",
      receipt: `${dir}/${gate}.json`,
    })),
  };
  const verify = () => {
    for (const [gate, receipt] of Object.entries(receipts))
      writeFileSync(join(root, dir, `${gate}.json`), JSON.stringify(receipt));
    return verifyBusinessPartnerR5Qualification({ root, manifest });
  };
  return {
    root,
    dir,
    manifest,
    receipts,
    verify,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
test("R5 qualifies only a complete consistent evidence set", () => {
  const f = fixture();
  try {
    assert.equal(f.verify().productionQualified, true);
  } finally {
    f.cleanup();
  }
});
test("pending gates remain blocked and cannot be promoted by a manifest flag", () => {
  const f = fixture();
  try {
    f.manifest.gates.forEach((g) => {
      g.status = "pending";
      g.receipt = null;
    });
    assert.throws(f.verify, /qualification must match/);
    f.manifest.productionQualified = false;
    f.manifest.productionQualification = "blocked";
    assert.equal(f.verify().pending.length, 6);
  } finally {
    f.cleanup();
  }
});
for (const [name, mutate, pattern] of [
  [
    "readback substituted for onboarding",
    (f) => (f.receipts.onboarding.proof.mutationJourney = false),
    /readback alone/,
  ],
  [
    "local green checks substituted for target",
    (f) => (f.receipts.controls.environment = "development"),
    /production target/,
  ],
  [
    "repeated lifecycle event",
    (f) => (f.receipts.controls.proof.lifecycle[1].eventId = id(1)),
    /distinct lifecycle/,
  ],
  [
    "published projection substituted for consumption",
    (f) =>
      (f.receipts.downstream.proof.deliveries[0].projectionStatus =
        "published"),
    /consumed projection/,
  ],
  [
    "unrelated downstream event",
    (f) =>
      (f.receipts.downstream.proof.deliveries[0].lifecycleEventId = id(99)),
    /exact lifecycle/,
  ],
  [
    "stale packet approval",
    (f) => (f.receipts.product_approval.proof.packetSha256 = "c".repeat(64)),
    /current review packet/,
  ],
  [
    "mismatched build",
    (f) => (f.receipts.controls.buildDigest = "c".repeat(64)),
    /same target revision/,
  ],
  [
    "altered artifact",
    (f) => writeFileSync(join(f.root, f.receipts.controls.artifact), "altered"),
    /artifact hash mismatch/,
  ],
  [
    "escaped receipt",
    (f) => (f.manifest.gates[0].receipt = "../../secret.json"),
    /below r5-target/,
  ],
  [
    "escaped symlink artifact",
    (f) => {
      const path = join(f.root, f.receipts.controls.artifact);
      rmSync(path);
      symlinkSync(
        join(
          f.root,
          "governance/policy/reports/business-partner-customer-state-review.md",
        ),
        path,
      );
    },
    /symlink escapes/,
  ],
])
  test(`R5 rejects ${name}`, () => {
    const f = fixture();
    try {
      mutate(f);
      assert.throws(f.verify, pattern);
    } finally {
      f.cleanup();
    }
  });
