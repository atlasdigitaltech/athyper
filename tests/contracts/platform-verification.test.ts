import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parsePlatformVerificationRun, verificationFunctionalRunOperation, verificationSnapshotOperation } from "../../packages/platform/foundation/api-client/src/verification";

const fixture = {
  apiVersion: "athyper.io/v1alpha1", kind: "PlatformVerificationRun", runId: "run-1", mode: "quick", scope: "all", planeKey: "studio", tenantId: "tenant-1", principalId: "principal-1", startedAt: "2026-08-22T00:00:00.000Z", completedAt: "2026-08-22T00:00:01.000Z", status: "passed",
  summary: { passed: 1, failed: 0, skipped: 0 },
  checks: [{ id: "identity.session", label: "Authenticated session", category: "identity", status: "passed", durationMs: 1, detail: "Session is coherent", cleanup: "not-required" }],
  evidence: { correlationId: "request-1", logQuery: "{instance=\"dev\"} |= \"run-1\"", grafanaExploreUrl: "http://127.0.0.1:53902/explore" },
};

test("verification client contract is strict and mutations are idempotent", () => {
  assert.deepEqual(parsePlatformVerificationRun(fixture), fixture);
  assert.equal(verificationSnapshotOperation.method, "GET");
  assert.equal(verificationFunctionalRunOperation.method, "POST");
  assert.equal(verificationFunctionalRunOperation.idempotency, "required");
  assert.throws(() => parsePlatformVerificationRun({ ...fixture, planeKey: "athyper" }), /planeKey is invalid/u);
  assert.throws(() => parsePlatformVerificationRun({ ...fixture, evidence: { ...fixture.evidence, grafanaExploreUrl: "file:///secret" } }), /Grafana URL is invalid/u);
});

test("all planes expose the shared authenticated verification surface through allowlisted relays", () => {
  for (const plane of ["studio", "neon", "mesh"]) {
    const relay = readFileSync(`apps/${plane}/lib/relay.ts`, "utf8");
    const page = readFileSync(plane === "studio" ? "apps/studio/app/(shell)/operations/verification/page.tsx" : `apps/${plane}/app/(shell)/system/verification/page.tsx`, "utf8");
    assert.match(relay, /PLATFORM_VERIFICATION_SNAPSHOT_OPERATION/u);
    assert.match(relay, /PLATFORM_VERIFICATION_RUN_OPERATION/u);
    assert.match(page, new RegExp(`SystemVerificationPage plane="${plane}"`, "u"));
  }
});

test("qualification CLI accepts tokens only from environment authority", () => {
  const source = readFileSync("scripts/verification/run-platform-verification.mjs", "utf8");
  assert.match(source, /process\.env\.VERIFICATION_ACCESS_TOKEN/u);
  assert.doesNotMatch(source, /argumentsMap\.get\("token"\)/u);
  assert.match(source, /mode === "functional".*idempotency-key/su);
});
