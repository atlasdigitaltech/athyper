import { describe, expect, it } from "vitest";
import {
  evaluatePromotion,
  type PromotionCoordinate,
  type PromotionEvidence,
  type PromotionHostPolicy,
} from "./release-promotion.js";
import type { LocalDevelopmentAuthority } from "@athyper/server-contract-publication";
const now = Date.parse("2026-10-09T00:00:00Z");
function fixture() {
  const host = {
    environment: "local",
    instance: "dev",
    domainSuffix: "dev.athyper.test",
  };
  const coordinate: PromotionCoordinate = {
    releaseId: "release",
    contentHash: "a".repeat(64),
    scope: { kind: "product" },
    environment: "dev",
    targets: [{ plane: "neon", instance: "dev" }],
  };
  const authority: LocalDevelopmentAuthority = {
    schema: "athyper.local-development-authority/1",
    id: "standing",
    hash: "b".repeat(64),
    version: 1,
    active: true,
    validFrom: "2026-10-01T00:00:00Z",
    expiresAt: "2026-11-01T00:00:00Z",
    enrollmentReceiptId: "enrollment",
    host,
    scope: coordinate.scope,
    developerPrincipalIds: ["developer"],
    authorWorkloadId: "submitter",
    publisherWorkloadId: "publisher",
    actions: ["publish"],
    destinations: coordinate.targets,
  };
  const policy: PromotionHostPolicy = {
    environment: "dev",
    instance: "dev",
    devfull: true,
    automaticDevelopmentApproval: false,
    localDevelopmentIdentity: host,
    destinations: coordinate.targets,
  };
  const evidence: PromotionEvidence = {
    authorId: "developer",
    authorKind: "human",
    publisherId: "publisher",
    publisherKind: "workload",
    publisherAuthorized: true,
    approvedCandidate: false,
    validationPassed: true,
    signatureTrusted: true,
    qualifications: [],
    localAuthority: authority,
    artifacts: [
      { id: "artifact", plane: "neon", hash: "c".repeat(64), status: "signed" },
    ],
  };
  return { policy, coordinate, evidence };
}
describe("local basis in the shared promotion evaluator", () => {
  it("preserves human maker and permits successive source hashes without renewed enrollment", () => {
    const f = fixture();
    for (const hash of ["a".repeat(64), "d".repeat(64)]) {
      const result = evaluatePromotion(
        f.policy,
        { ...f.coordinate, contentHash: hash },
        f.evidence,
        now,
      );
      expect(result.mode).toBe("local_development_authority");
      expect(result.authorId).toBe("developer");
      expect(result.approvalReceiptId).toBeNull();
    }
  });
  it.each(["qa", "stg", "prod"] as const)(
    "cannot promote the local basis to %s",
    (environment) => {
      const f = fixture();
      expect(() =>
        evaluatePromotion(
          {
            ...f.policy,
            localDevelopmentIdentity: undefined,
            environment,
            instance: environment,
          },
          { ...f.coordinate, environment },
          { ...f.evidence, approvedCandidate: true },
          now,
        ),
      ).toThrow("LOCAL_BASIS_NOT_ALLOWED");
    },
  );
  it("requires installed authority even when host mode is configured", () => {
    const f = fixture();
    expect(() =>
      evaluatePromotion(
        f.policy,
        f.coordinate,
        { ...f.evidence, localAuthority: undefined },
        now,
      ),
    ).toThrow("LOCAL_AUTHORITY_REQUIRED");
  });
  it("rechecks revoked authority and QA host coordinates", () => {
    const f = fixture();
    expect(() =>
      evaluatePromotion(
        f.policy,
        f.coordinate,
        {
          ...f.evidence,
          localAuthority: { ...f.evidence.localAuthority!, active: false },
        },
        now,
      ),
    ).toThrow("REVOKED");
    expect(() =>
      evaluatePromotion(
        {
          ...f.policy,
          localDevelopmentIdentity: {
            environment: "local",
            instance: "qa",
            domainSuffix: "qa.athyper.test",
          },
        },
        f.coordinate,
        f.evidence,
        now,
      ),
    ).toThrow("DEV_ONLY");
  });
});
