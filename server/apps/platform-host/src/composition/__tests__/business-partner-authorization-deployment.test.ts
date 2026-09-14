import { describe, it, expect } from "vitest";
import {
  parseBusinessPartnerDeployment,
  validDeploymentApproval,
  loadBusinessPartnerAuthorizationDeployment,
} from "../business-partner-authorization-deployment.js";
import { entityAuthorizationCoverage } from "@athyper/server-service-records";
const hash = "a".repeat(64),
  id = "44444444-4444-4444-8444-444444444444";
const raw = () => ({
  schemaVersion: 1,
  tenantId: id,
  publicationKey: "bp.tenant",
  artifactPath: "/release/artifact.json",
  artifactHash: hash,
  runtimeImage: "sha256:" + hash,
  artifactReference: {
    artifactUri: "s3://bucket/key",
    artifactHash: hash,
    targetPlane: "neon",
    publicationKey: "bp.tenant",
    sourceReleaseId: id,
    sourceReleaseNo: 19,
    signatureAlgorithm: "Ed25519",
    signingKeyId: "test",
    signature: "signature",
  },
  rollout: {
    schemaVersion: 1,
    mode: "shadow",
    release: {
      entityCode: "business_partner",
      planeKey: "neon",
      descriptorHash: hash,
      profileHash: hash,
      bindingsHash: hash,
      runtimeVersion: "1",
    },
  },
});
const approval = (c: ReturnType<typeof parseBusinessPartnerDeployment>) => ({
  schemaVersion: 1,
  kind: "entity_authorization_enforcement_approval",
  tenantId: id,
  publicationKey: c.publicationKey,
  releaseId: id,
  artifactHash: hash,
  runtimeImage: c.runtimeImage,
  reference: c.rollout.qualificationRef,
  approvalReference: "review:independent",
  enforcementApproved: true,
  effectiveFrom: "2026-09-11T00:00:00Z",
  effectiveUntil: "2026-09-12T00:00:00Z",
  qualification: {
    release: c.rollout.release,
    coverage: [...entityAuthorizationCoverage],
    unresolvedDifferences: 0,
    grantReviewRef: "grant:approved",
    rollbackRef: "rollback:qualified",
    revocationWatermark: "watermark",
    companyEntityQualified: true,
    independentChildQualified: true,
  },
});
describe("operator selected BP deployment", () => {
  it("does not discover or activate without explicit configuration", () => {
    expect(
      loadBusinessPartnerAuthorizationDeployment(
        undefined,
        {} as never,
        {} as never,
      ),
    ).toBeUndefined();
  });
  it("accepts explicit staged configuration", () => {
    expect(parseBusinessPartnerDeployment(raw()).rollout.mode).toBe("shadow");
  });
  it("rejects unknown keys, alternate tenant/plane coordinates and artifact drift", () => {
    for (const change of [
      { extra: true },
      { tenantId: "all" },
      { artifactHash: "b".repeat(64) },
      { artifactPath: "relative.json" },
      { runtimeImage: "latest" },
      {
        artifactReference: { ...raw().artifactReference, targetPlane: "mesh" },
      },
    ])
      expect(() =>
        parseBusinessPartnerDeployment({ ...raw(), ...change }),
      ).toThrow();
  });
  it("cannot select enforcement using a grant approval or no qualification", () => {
    expect(() =>
      parseBusinessPartnerDeployment({
        ...raw(),
        rollout: {
          ...raw().rollout,
          mode: "enforce",
          qualificationRef: "review:19",
        },
      }),
    ).toThrow("BP_DEPLOYMENT_APPROVAL_REQUIRED");
  });
  it("requires exact release, image, time, scope and complete qualification", () => {
    const c = parseBusinessPartnerDeployment({
      ...raw(),
      rollout: {
        ...raw().rollout,
        mode: "enforce",
        qualificationRef: "review:19",
      },
      approval: { path: "/release/approval.json", sha256: hash },
    });
    const p = approval(c),
      now = Date.parse("2026-09-11T01:00:00Z");
    expect(validDeploymentApproval(p, c, now)).toBe(true);
    for (const changed of [
      { ...p, runtimeImage: "sha256:" + "b".repeat(64) },
      { ...p, artifactHash: "b".repeat(64) },
      { ...p, tenantId: "other" },
      { ...p, enforcementApproved: false },
      { ...p, qualification: { ...p.qualification, coverage: ["record"] } },
      {
        ...p,
        qualification: { ...p.qualification, independentChildQualified: false },
      },
      { ...p, qualification: { ...p.qualification, rollbackRef: "" } },
    ])
      expect(validDeploymentApproval(changed, c, now)).toBe(false);
    for (const at of [
      NaN,
      Date.parse(p.effectiveFrom) - 1,
      Date.parse(p.effectiveUntil),
    ])
      expect(validDeploymentApproval(p, c, at)).toBe(false);
  });
});
