import { describe, expect, it, vi } from "vitest";
import { PublicationOrchestrator } from "../publication-orchestrator.js";
import type {
  ActiveRelease,
  AppliedRelease,
  DeploymentBundle,
  DeploymentStatus,
  LocalPublicationRepository,
  PublicationAuthorityRepository,
} from "../publication.contract.js";

const HASH = "a".repeat(64);
const bundle: DeploymentBundle = {
  deploymentId: "11111111-1111-4111-8111-111111111111",
  deploymentStatus: "pending",
  targetPlane: "neon",
  targetEnvironment: "test",
  targetInstance: "neon-1",
  publicationKey: "metadata.entity.invoice",
  sourceReleaseId: "22222222-2222-4222-8222-222222222222",
  sourceReleaseNo: 2,
  artifactUri: "object://releases/invoice/2.json",
  artifactHash: HASH,
  signatureAlgorithm: "EdDSA",
  signingKeyId: "publication-2026",
  signature: "signature",
};

const artifact = {
  manifest: { entity: "invoice", version: 2 },
  computedArtifactHash: HASH,
  signatureVerified: true,
  manifestValid: true,
  runtimeCompatible: true,
};

function release(status: AppliedRelease["status"]): AppliedRelease {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    publicationKey: bundle.publicationKey,
    deploymentId: bundle.deploymentId,
    sourceReleaseId: bundle.sourceReleaseId,
    sourceReleaseNo: 2,
    artifactHash: HASH,
    manifest: artifact.manifest,
    status,
  };
}

function fixtures() {
  let centralStatus: DeploymentStatus = "pending";
  let localStatus: AppliedRelease["status"] = "staged";
  let active: ActiveRelease | null = null;
  const authority: PublicationAuthorityRepository = {
    getDeployment: vi.fn(async () => ({ ...bundle, deploymentStatus: centralStatus })),
    transition: vi.fn(async (_id, status) => { centralStatus = status; }),
    acknowledge: vi.fn(async () => undefined),
  };
  const local: LocalPublicationRepository = {
    stage: vi.fn(async () => release(localStatus)),
    verify: vi.fn(async () => { localStatus = "verified"; return release("verified"); }),
    activate: vi.fn(async () => {
      localStatus = "active";
      active = { ...release("active"), activatedAt: "2026-01-01T00:00:00.000Z" };
      return active;
    }),
    findByDeployment: vi.fn(async () => release(localStatus)),
    active: vi.fn(async () => active),
    activeEntity: vi.fn(async () => null),
    rollback: vi.fn(async () => ({ ...release("active"), activatedAt: "2026-01-01T00:00:00.000Z" })),
  };
  return { authority, local, status: () => centralStatus, active: () => active };
}

describe("publication runtime orchestration", () => {
  it("stages, verifies, atomically activates, and acknowledges", async () => {
    const f = fixtures();
    const orchestrator = new PublicationOrchestrator(f.authority, f.local, { load: vi.fn(async () => artifact) });
    const result = await orchestrator.deploy(bundle.deploymentId);
    expect(result.status).toBe("active");
    expect(f.authority.transition).toHaveBeenCalledTimes(5);
    expect(f.authority.acknowledge).toHaveBeenCalledWith(expect.objectContaining({ activeReleaseHash: HASH }));
  });

  it("keeps serving the previous local active release when Athyper is unavailable", async () => {
    const f = fixtures();
    const previous = { ...release("active"), id: "44444444-4444-4444-8444-444444444444", sourceReleaseNo: 1, activatedAt: "2025-01-01T00:00:00.000Z" };
    f.local.active = vi.fn(async () => previous);
    f.authority.getDeployment = vi.fn(async () => { throw new Error("athyper unavailable"); });
    const orchestrator = new PublicationOrchestrator(f.authority, f.local, { load: vi.fn(async () => artifact) });
    await expect(orchestrator.deploy(bundle.deploymentId)).rejects.toThrow("athyper unavailable");
    await expect(orchestrator.activeRelease(bundle.publicationKey)).resolves.toEqual(previous);
    expect(f.local.stage).not.toHaveBeenCalled();
  });

  it("recovers after activation when acknowledgement temporarily fails", async () => {
    const f = fixtures();
    const acknowledge = vi.mocked(f.authority.acknowledge);
    acknowledge.mockRejectedValueOnce(new Error("authority timeout")).mockResolvedValueOnce(undefined);
    const orchestrator = new PublicationOrchestrator(f.authority, f.local, { load: vi.fn(async () => artifact) });
    await expect(orchestrator.deploy(bundle.deploymentId)).rejects.toThrow("authority timeout");
    expect(f.active()?.status).toBe("active");
    const recovered = await orchestrator.deploy(bundle.deploymentId);
    expect(recovered.id).toBe(f.active()?.id);
    expect(acknowledge).toHaveBeenCalledTimes(2);
    expect(f.local.activate).toHaveBeenCalledTimes(1);
  });

  it("rejects a bad artifact without changing the active head", async () => {
    const f = fixtures();
    f.local.verify = vi.fn(async () => release("rejected"));
    const orchestrator = new PublicationOrchestrator(f.authority, f.local, { load: vi.fn(async () => ({ ...artifact, computedArtifactHash: "b".repeat(64) })) });
    await expect(orchestrator.deploy(bundle.deploymentId)).rejects.toMatchObject({ code: "LOCAL_VERIFICATION_REJECTED" });
    expect(f.local.activate).not.toHaveBeenCalled();
    expect(f.status()).toBe("failed");
  });

  it("delegates rollback to the local atomic projection boundary", async () => {
    const f = fixtures();
    const orchestrator = new PublicationOrchestrator(f.authority, f.local, { load: vi.fn(async () => artifact) });
    await orchestrator.rollback(bundle.publicationKey, "33333333-3333-4333-8333-333333333333", { reason: "runtime_regression" });
    expect(f.local.rollback).toHaveBeenCalledWith(
      bundle.publicationKey,
      "33333333-3333-4333-8333-333333333333",
      { reason: "runtime_regression" },
    );
  });
});
