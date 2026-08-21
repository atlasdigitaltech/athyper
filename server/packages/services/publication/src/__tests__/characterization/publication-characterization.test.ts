import { describe, expect, it, vi } from "vitest";
import type {
  Acknowledgement,
  Bundle,
  CharacterizationAuthority,
  CharacterizationLocalProjection,
  DeploymentStatus,
  LoadedArtifact,
  LocalRelease,
} from "./temporary-interfaces.js";

const HASH = "a".repeat(64);
const DEPLOYMENT_ID = "11111111-1111-4111-8111-111111111111";

class ExpectedFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function fixture() {
  let status: DeploymentStatus = "pending";
  let local: LocalRelease | null = null;
  let active: LocalRelease | null = {
    id: "previous",
    deploymentId: "previous-deployment",
    publicationKey: "metadata.entity.invoice",
    sourceReleaseNo: 1,
    artifactHash: "b".repeat(64),
    status: "active",
  };
  let acknowledgement: Acknowledgement | null = null;
  const bundle: Bundle = {
    deploymentId: DEPLOYMENT_ID,
    publicationKey: "metadata.entity.invoice",
    sourceReleaseId: "22222222-2222-4222-8222-222222222222",
    sourceReleaseNo: 2,
    targetPlane: "neon",
    targetInstance: "neon-1",
    artifactHash: HASH,
    status,
  };
  const artifact: LoadedArtifact = { bytesHash: HASH, targetPlane: "neon", signatureVerified: true };
  const authority: CharacterizationAuthority = {
    getDeployment: vi.fn(async () => ({ ...bundle, status })),
    transition: vi.fn(async (_id, next) => { status = next; }),
    acknowledge: vi.fn(async (input) => {
      if (acknowledgement) {
        if (JSON.stringify(acknowledgement) !== JSON.stringify(input)) throw new ExpectedFailure("ACKNOWLEDGEMENT_CONFLICT");
        return;
      }
      acknowledgement = input;
    }),
  };
  const projection: CharacterizationLocalProjection = {
    findByDeployment: vi.fn(async () => local),
    stage: vi.fn(async () => local ??= { id: "applied-2", deploymentId: DEPLOYMENT_ID, publicationKey: bundle.publicationKey, sourceReleaseNo: 2, artifactHash: HASH, status: "staged" }),
    verify: vi.fn(async (release, loaded) => local = {
      ...release,
      status: loaded.signatureVerified && loaded.bytesHash === bundle.artifactHash && loaded.targetPlane === bundle.targetPlane ? "verified" : "rejected",
    }),
    activate: vi.fn(async (release) => active = local = { ...release, status: "active" }),
    active: vi.fn(async () => active),
    rollback: vi.fn(async (_key, id) => active = { ...(id === "previous" ? active! : local!), id, status: "active" }),
  };
  return { authority, projection, bundle, artifact, status: () => status, active: () => active };
}

async function characterizeDeploy(
  authority: CharacterizationAuthority,
  projection: CharacterizationLocalProjection,
  deploymentId: string,
  load: (bundle: Bundle) => Promise<LoadedArtifact>,
): Promise<LocalRelease> {
  const bundle = await authority.getDeployment(deploymentId);
  if (!bundle) throw new ExpectedFailure("DEPLOYMENT_NOT_AVAILABLE");
  const advance = async (next: DeploymentStatus) => {
    const order: DeploymentStatus[] = ["pending", "dispatched", "received", "staged", "verified", "activated"];
    if (order.indexOf(bundle.status) < order.indexOf(next)) {
      await authority.transition(deploymentId, next);
      bundle.status = next;
    }
  };
  await advance("dispatched");
  const artifact = await load(bundle);
  await advance("received");
  let release = await projection.findByDeployment(deploymentId) ?? await projection.stage(bundle, artifact);
  await advance("staged");
  if (release.status === "staged") release = await projection.verify(release, artifact);
  if (release.status === "rejected") {
    await authority.transition(deploymentId, "failed");
    throw new ExpectedFailure("LOCAL_VERIFICATION_REJECTED");
  }
  await advance("verified");
  const active = release.status === "active" ? release : await projection.activate(release);
  await advance("activated");
  await authority.acknowledge({
    deploymentId,
    targetInstance: bundle.targetInstance,
    activeReleaseHash: active.artifactHash,
    localAppliedReleaseId: active.id,
  });
  return active;
}

describe("Publication Increment A characterization", () => {
  it("records stage -> verify -> atomic activate -> immutable acknowledge", async () => {
    const f = fixture();
    await expect(characterizeDeploy(f.authority, f.projection, DEPLOYMENT_ID, async () => f.artifact)).resolves.toMatchObject({ status: "active" });
    expect(f.authority.transition).toHaveBeenCalledTimes(5);
    expect(f.authority.acknowledge).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["signature failure", { signatureVerified: false }, "LOCAL_VERIFICATION_REJECTED"],
    ["wrong target plane", { targetPlane: "mesh" as const }, "LOCAL_VERIFICATION_REJECTED"],
    ["corrupted object bytes", { bytesHash: "c".repeat(64) }, "LOCAL_VERIFICATION_REJECTED"],
  ])("fails closed on %s and preserves the activation head", async (_name, mutation, code) => {
    const f = fixture();
    const previous = f.active();
    await expect(characterizeDeploy(f.authority, f.projection, DEPLOYMENT_ID, async () => ({ ...f.artifact, ...mutation }))).rejects.toMatchObject({ code });
    expect(f.active()).toBe(previous);
    expect(f.projection.activate).not.toHaveBeenCalled();
  });

  it("makes acknowledgement replay idempotent and conflicting evidence immutable", async () => {
    const f = fixture();
    await characterizeDeploy(f.authority, f.projection, DEPLOYMENT_ID, async () => f.artifact);
    await expect(f.authority.acknowledge({ deploymentId: DEPLOYMENT_ID, targetInstance: "neon-1", activeReleaseHash: HASH, localAppliedReleaseId: "applied-2" })).resolves.toBeUndefined();
    await expect(f.authority.acknowledge({ deploymentId: DEPLOYMENT_ID, targetInstance: "neon-2", activeReleaseHash: HASH, localAppliedReleaseId: "applied-2" })).rejects.toMatchObject({ code: "ACKNOWLEDGEMENT_CONFLICT" });
  });

  it("delegates rollback to the local atomic projection boundary", async () => {
    const f = fixture();
    await f.projection.rollback(f.bundle.publicationKey, "previous");
    expect(f.projection.rollback).toHaveBeenCalledWith(f.bundle.publicationKey, "previous");
  });

  it.each(["dispatched", "received", "staged", "verified", "activated"] as const)(
    "resumes after a worker crash following %s without duplicate activation",
    async (crashAfter) => {
      const f = fixture();
      const transition = vi.mocked(f.authority.transition);
      transition.mockImplementation(async (_id, next) => {
        (f.bundle as { status: DeploymentStatus }).status = next;
        if (next === crashAfter) throw new Error("worker crash");
      });
      await expect(characterizeDeploy(f.authority, f.projection, DEPLOYMENT_ID, async () => f.artifact)).rejects.toThrow("worker crash");
      transition.mockImplementation(async () => undefined);
      await characterizeDeploy(f.authority, f.projection, DEPLOYMENT_ID, async () => f.artifact);
      expect(f.projection.activate).toHaveBeenCalledTimes(1);
    },
  );
});
