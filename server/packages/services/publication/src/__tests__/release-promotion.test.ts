import { describe, expect, it, vi } from "vitest";
import {
  evaluatePromotion,
  ReleasePromotionService,
  type PromotionCoordinate,
  type PromotionEvidence,
  type PromotionHostPolicy,
} from "../release-promotion.js";
import type { PublicationDeploymentBundle } from "@athyper/server-contract-publication";

const now = Date.parse("2026-09-21T00:00:00Z");
function fixture(environment: PromotionHostPolicy["environment"] = "dev") {
  const coordinate: PromotionCoordinate = {
    releaseId: "release-1",
    contentHash: "a".repeat(64),
    scope: { kind: "product" },
    environment,
    targets: [{ plane: "neon", instance: environment }],
  };
  const policy: PromotionHostPolicy = {
    environment,
    instance: environment,
    devfull: environment === "dev",
    automaticDevelopmentApproval: environment === "dev",
    destinations: coordinate.targets,
  };
  const evidence: PromotionEvidence = {
    authorId: "author",
    authorKind: "workload",
    publisherId: "publisher",
    publisherKind: "workload",
    publisherAuthorized: true,
    approvedCandidate: true,
    validationPassed: true,
    signatureTrusted: true,
    artifacts: [
      {
        id: "artifact-1",
        plane: "neon",
        hash: "b".repeat(64),
        status: "signed",
      },
    ],
    approval: {
      coordinate,
      principalId: "reviewer",
      kind: "human",
      authorityCurrent: true,
      expiresAt: "2099-01-01T00:00:00Z",
      receiptId: "approval-1",
    },
    qualifications: [
      {
        releaseId: coordinate.releaseId,
        contentHash: coordinate.contentHash,
        scope: coordinate.scope,
        environment: environment === "prod" ? "stg" : "qa",
        planes: ["neon"],
        passed: true,
        receiptId: "qualification-1",
      },
    ],
  };
  return { policy, coordinate, evidence };
}
describe("publication environment policy", () => {
  it.each(["dev", "qa", "stg", "prod"] as const)(
    "permits qualified %s promotion",
    (environment) => {
      const f = fixture(environment);
      expect(
        evaluatePromotion(f.policy, f.coordinate, f.evidence, now).mode,
      ).toBe(
        environment === "dev"
          ? "development_auto_approval"
          : "governed_promotion",
      );
    },
  );
  it.each(["qa", "stg", "prod"] as const)(
    "rejects automatic approval on %s even with devfull claimed",
    (environment) => {
      const f = fixture(environment);
      expect(() =>
        evaluatePromotion(
          { ...f.policy, devfull: true, automaticDevelopmentApproval: true },
          f.coordinate,
          f.evidence,
          now,
        ),
      ).toThrow("DEVFULL_ONLY");
    },
  );
  it("rejects environment and destination overrides", () => {
    const f = fixture();
    expect(() =>
      evaluatePromotion(
        f.policy,
        { ...f.coordinate, environment: "prod" },
        f.evidence,
      ),
    ).toThrow("ENVIRONMENT_MISMATCH");
    expect(() =>
      evaluatePromotion(
        f.policy,
        { ...f.coordinate, targets: [{ plane: "neon", instance: "prod" }] },
        f.evidence,
      ),
    ).toThrow("TARGET_NOT_ALLOWED");
  });
  it("requires separate workload identities for dev", () => {
    const f = fixture();
    for (const change of [
      { publisherId: "author" },
      { publisherKind: "human" as const },
    ]) {
      expect(() =>
        evaluatePromotion(f.policy, f.coordinate, { ...f.evidence, ...change }),
      ).toThrow("DISTINCT_WORKLOAD");
    }
  });
  it("binds production approval to content, scope and full target selection", () => {
    const f = fixture("prod");
    for (const change of [
      { contentHash: "c".repeat(64) },
      { scope: { kind: "tenant" as const, tenantId: "catl" } },
      { targets: [{ plane: "neon" as const, instance: "other-prod" }] },
    ]) {
      expect(() =>
        evaluatePromotion(
          f.policy,
          f.coordinate,
          {
            ...f.evidence,
            approval: {
              ...f.evidence.approval!,
              coordinate: { ...f.coordinate, ...change },
            },
          },
          now,
        ),
      ).toThrow("COORDINATE_CHANGED");
    }
  });
  it("rejects expired, revoked, self and machine approvals in production", () => {
    const f = fixture("prod");
    for (const change of [
      { expiresAt: new Date(now).toISOString() },
      { authorityCurrent: false },
      { principalId: "author" },
      { kind: "workload" as const },
    ]) {
      expect(() =>
        evaluatePromotion(
          f.policy,
          f.coordinate,
          { ...f.evidence, approval: { ...f.evidence.approval!, ...change } },
          now,
        ),
      ).toThrow();
    }
  });
  it("rejects staging with qualification of different bytes or tenant", () => {
    const f = fixture("stg");
    for (const change of [
      { contentHash: "c".repeat(64) },
      { scope: { kind: "tenant" as const, tenantId: "other" } },
      { passed: false },
      { planes: [] },
    ]) {
      expect(() =>
        evaluatePromotion(
          f.policy,
          f.coordinate,
          {
            ...f.evidence,
            qualifications: [{ ...f.evidence.qualifications[0]!, ...change }],
          },
          now,
        ),
      ).toThrow("PREDECESSOR_QUALIFICATION");
    }
  });
});

describe("immutable promotion dispatch", () => {
  function harness() {
    const f = fixture();
    const deployments = new Map<string, PublicationDeploymentBundle>();
    const createDeployment = vi.fn(
      async (input: {
        commandId: string;
        targetPlane: "neon" | "mesh" | "studio";
        targetInstance: string;
        targetEnvironment: string;
      }) => {
        const existing = deployments.get(input.commandId);
        if (existing) return existing;
        const d: PublicationDeploymentBundle = {
          deploymentId: input.commandId,
          deploymentStatus: "pending",
          targetPlane: input.targetPlane,
          targetEnvironment: input.targetEnvironment,
          targetInstance: input.targetInstance,
          publicationKey: "entity.bp",
          sourceReleaseId: "release-1",
          sourceReleaseNo: 1,
          artifactUri: "immutable://artifact",
          artifactHash: "b".repeat(64),
          signatureAlgorithm: "Ed25519",
          signingKeyId: "key",
          signature: "signature",
        };
        deployments.set(d.deploymentId, d);
        return d;
      },
    );
    const dispatch = vi.fn(async (id: string) => {
      deployments.set(id, {
        ...deployments.get(id)!,
        deploymentStatus: "activated",
      });
    });
    const ports = {
      loadVerified: vi.fn(async () => f.evidence),
      authority: {
        createDeployment,
        getDeployment: vi.fn(async (id: string) => deployments.get(id) ?? null),
      },
      dispatch,
      record: vi.fn(async () => {}),
    };
    return { ...f, ports };
  }
  it("resumes with the same deployment ID and skips activated destinations", async () => {
    const f = harness(),
      service = new ReleasePromotionService(f.policy, f.ports);
    expect((await service.promote(f.coordinate)).status).toBe("activated");
    expect((await service.promote(f.coordinate)).status).toBe("activated");
    expect(f.ports.dispatch).toHaveBeenCalledTimes(1);
    expect(f.ports.authority.createDeployment.mock.calls[0]![0].commandId).toBe(
      f.ports.authority.createDeployment.mock.calls[1]![0].commandId,
    );
  });
  it("does not report queued or failed dispatch as activated and can retry", async () => {
    const f = harness(),
      service = new ReleasePromotionService(f.policy, f.ports);
    f.ports.dispatch.mockRejectedValueOnce(Error("secret transport details"));
    const failed = await service.promote(f.coordinate);
    expect(failed.status).toBe("incomplete");
    expect(JSON.stringify(failed)).not.toContain("secret");
    expect((await service.promote(f.coordinate)).status).toBe("activated");
    expect(f.ports.authority.createDeployment.mock.calls[0]![0].commandId).toBe(
      f.ports.authority.createDeployment.mock.calls[1]![0].commandId,
    );
  });
  it("stops before creation if authority is revoked after initial evaluation", async () => {
    const f = harness();
    f.ports.loadVerified
      .mockResolvedValueOnce(f.evidence)
      .mockResolvedValueOnce({ ...f.evidence, publisherAuthorized: false });
    await expect(
      new ReleasePromotionService(f.policy, f.ports).promote(f.coordinate),
    ).rejects.toThrow("AUTHORITY_REQUIRED");
    expect(f.ports.authority.createDeployment).not.toHaveBeenCalled();
  });
  it("stops before dispatch when the audit sink fails", async () => {
    const f = harness();
    f.ports.record.mockRejectedValueOnce(Error("audit unavailable"));
    await expect(
      new ReleasePromotionService(f.policy, f.ports).promote(f.coordinate),
    ).rejects.toThrow("audit unavailable");
    expect(f.ports.dispatch).not.toHaveBeenCalled();
  });
});
