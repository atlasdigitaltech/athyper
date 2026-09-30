import { test } from "node:test";
import assert from "node:assert/strict";
import { assessExactReleaseExecution as assess } from "./exact-release-execution-gate.mjs";
const fixture = () => {
  const releaseId = "r19",
    artifactHash = "a".repeat(64),
    image = "sha256:runtime",
    authorityFingerprint = "authority";
  const verification = {
    releaseId,
    artifactHash,
    verification: {
      signatureVerified: true,
      manifestValid: true,
      runtimeCompatible: true,
    },
  };
  return {
    releaseId,
    artifactHash,
    authorityFingerprint,
    runtimes: {
      api: { image, health: "healthy", verification, targetAdapterWired: true },
      worker: {
        image,
        health: "healthy",
        verification,
        targetAdapterWired: true,
      },
    },
    journeys: Object.fromEntries(
      [
        "reads",
        "commands_import",
        "export_ai_revocation",
        "company_owned",
        "independent_child",
      ].map((key) => [
        key,
        {
          qualified: true,
          authenticated: true,
          targetExecution: true,
          releaseId,
          artifactHash,
          authorityFingerprint,
          executionImages: [image],
        },
      ]),
    ),
    differences: {
      reviewedDispositionGateSatisfied: true,
      unresolvedReviewedDispositions: 0,
    },
    rollbackQualified: true,
  };
};
test("complete exact evidence still does not authorize activation", () => {
  const r = assess(fixture());
  assert.equal(r.executionQualified, true);
  assert.equal(r.activationAuthorized, false);
  assert.equal(r.enforcementApprovalRecorded, false);
});
test("signature verification and shared reads cannot replace target execution", () => {
  const i = fixture();
  i.runtimes.api.targetAdapterWired = false;
  i.journeys.reads.targetExecution = false;
  const codes = assess(i).blockers.map((b) => b.code);
  assert.ok(codes.includes("TARGET_ADAPTER_NOT_WIRED"));
  assert.ok(codes.includes("EXACT_JOURNEY_MISSING"));
});
test("historical image, authority and artifact evidence stays blocked", () => {
  for (const [field, value, code] of [
    ["executionImages", ["old-image"], "JOURNEY_RUNTIME_MISMATCH"],
    ["authorityFingerprint", "old-grants", "JOURNEY_AUTHORITY_MISMATCH"],
    ["artifactHash", "b".repeat(64), "EXACT_JOURNEY_MISSING"],
  ]) {
    const i = fixture();
    i.journeys.commands_import[field] = value;
    assert.ok(assess(i).blockers.some((b) => b.code === code));
  }
});
test("absent relationships, revoked evidence and rollback omissions stay blocked", () => {
  const i = fixture();
  delete i.journeys.independent_child;
  delete i.journeys.company_owned;
  i.differences.unresolvedReviewedDispositions = 1;
  i.rollbackQualified = false;
  assert.equal(assess(i).executionQualified, false);
  assert.equal(assess(i).blockers.length, 4);
});
