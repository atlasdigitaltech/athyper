import type {
  ActiveReleaseProjection,
  AppliedReleaseProjection,
  LocalProjectionRepository,
  LoadedPublicationArtifact,
  PublicationArtifactDocumentV1,
  PublicationAuthorityRepository,
  PublicationDeploymentAcknowledgement,
  PublicationDeploymentBundle,
  PublicationDeploymentStatus,
} from "@athyper/server-contract-publication";
import { describe, expect, it } from "vitest";

import { PublicationOrchestrator } from "../publication-orchestrator.js";

const HASH = "a".repeat(64);
const CONTRACT_HASH = "b".repeat(64);
const APPLIED_ID = "33333333-3333-4333-8333-333333333333";
const bundle: PublicationDeploymentBundle = {
  deploymentId: "11111111-1111-4111-8111-111111111111",
  deploymentStatus: "pending",
  targetPlane: "neon",
  targetEnvironment: "test",
  targetInstance: "neon-1",
  publicationKey: "metadata.entity.invoice",
  sourceReleaseId: "22222222-2222-4222-8222-222222222222",
  sourceReleaseNo: 2,
  artifactUri: "s3://publication/releases/invoice/2.json",
  artifactHash: HASH,
  signatureAlgorithm: "Ed25519",
  signingKeyId: "publication-2026",
  signature: "secret-signature",
};

const artifactDocument = {
  envelope: {
    schema: "athyper.publication-artifact.v1",
    publicationKey: bundle.publicationKey,
    releaseId: bundle.sourceReleaseId,
    releaseNo: bundle.sourceReleaseNo,
    releaseKind: "publish",
    targetPlane: bundle.targetPlane,
    artifactKind: "entity_runtime",
    generatedAt: "2026-01-01T00:00:00.000Z",
    compatibilityLevel: "fully_compatible",
    payload: {
      entityContract: {
        id: "44444444-4444-4444-8444-444444444444",
        entityId: "55555555-5555-4555-8555-555555555555",
        entityCode: "invoice",
        releaseId: bundle.sourceReleaseId,
        revisionId: "66666666-6666-4666-8666-666666666666",
        releaseNo: 2,
        contractSchemaCode: "metadata.entity",
        contractSchemaVersion: "1.0.0",
        contractHash: CONTRACT_HASH,
        contract: { entityCode: "invoice" },
        publicationKey: bundle.publicationKey,
        signature: { algorithm: "Ed25519", keyId: "publication-2026", signature: "secret-signature" },
        publishedAt: "2026-01-01T00:00:00.000Z",
      },
      entityDescriptor: {
        id: "77777777-7777-4777-8777-777777777777",
        plane: "neon",
        descriptorKind: "entity_runtime",
        descriptorSchemaVersion: "1.0.0",
        sourceContractHash: CONTRACT_HASH,
        compiledHash: "c".repeat(64),
        descriptor: { operation_scope_bindings: [] },
        compilerVersion: "1.0.0",
        compatibilityLevel: "fully_compatible",
        generatedAt: "2026-01-01T00:00:00.000Z",
      },
    },
  },
  manifest: {
    artifactSchema: "athyper.publication-artifact.v1",
    mediaType: "application/vnd.athyper.publication-artifact.v1+json",
    publicationKey: bundle.publicationKey,
    releaseId: bundle.sourceReleaseId,
    releaseNo: 2,
    targetPlane: "neon",
    artifactKind: "entity_runtime",
    payloadSha256: CONTRACT_HASH,
    compiler: { name: "publication", version: "1.0.0" },
    contractSchemaVersion: "1.0.0",
    descriptorSchemaVersion: "1.0.0",
    signatureAlgorithm: "Ed25519",
    signingKeyId: "publication-2026",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  signature: "secret-signature",
} satisfies PublicationArtifactDocumentV1;

const loaded: LoadedPublicationArtifact = {
  document: artifactDocument,
  computedArtifactHash: HASH,
  verification: {
    signatureVerified: true,
    manifestValid: true,
    runtimeCompatible: true,
    targetPlane: "neon",
    contractHash: CONTRACT_HASH,
    descriptorSourceHash: CONTRACT_HASH,
    contractSchemaVersion: "1.0.0",
    descriptorSchemaVersion: "1.0.0",
  },
};

const CRASH_BOUNDARIES = [
  "authority:dispatched",
  "authority:received",
  "local:stage",
  "authority:staged",
  "local:verify",
  "authority:verified",
  "local:activate",
  "authority:activated",
  "authority:acknowledge",
] as const;

describe("Publication orchestrator", () => {
  it.each(CRASH_BOUNDARIES)("resumes after a crash at %s without duplicate mutation", async (boundary) => {
    const durable = fixture(boundary);
    const orchestrator = new PublicationOrchestrator(durable.authority, durable.local, durable.loader);

    await expect(orchestrator.deploy(bundle.deploymentId)).rejects.toMatchObject({
      category: "transient",
      retryable: true,
    });
    const active = await orchestrator.deploy(bundle.deploymentId);

    expect(active.status).toBe("active");
    expect(durable.status()).toBe("activated");
    expect(durable.activationMutations()).toBe(1);
    expect(durable.acknowledgementMutations()).toBe(1);
  });

  it("records permanent verification failure with sanitized evidence", async () => {
    const durable = fixture();
    durable.loader.load = async () => {
      throw Object.assign(new Error("signature secret-signature from s3://private-bucket"), {
        code: "ARTIFACT_SIGNATURE_INVALID",
      });
    };
    const orchestrator = new PublicationOrchestrator(durable.authority, durable.local, durable.loader);

    await expect(orchestrator.deploy(bundle.deploymentId)).rejects.toMatchObject({
      category: "permanent",
      code: "ARTIFACT_SIGNATURE_INVALID",
      retryable: false,
    });
    expect(durable.status()).toBe("failed");
    expect(durable.failureEvidence()).toEqual({
      category: "permanent",
      code: "ARTIFACT_SIGNATURE_INVALID",
      step: "load",
      retryable: false,
    });
    expect(JSON.stringify(durable.failureEvidence())).not.toContain("secret-signature");
    expect(JSON.stringify(durable.failureEvidence())).not.toContain("private-bucket");
  });

  it("leaves transient failures resumable instead of marking the deployment failed", async () => {
    const durable = fixture();
    durable.loader.load = async () => {
      throw Object.assign(new Error("MinIO unavailable"), { code: "ECONNREFUSED" });
    };
    const orchestrator = new PublicationOrchestrator(durable.authority, durable.local, durable.loader);

    await expect(orchestrator.deploy(bundle.deploymentId)).rejects.toMatchObject({
      category: "transient",
      code: "ECONNREFUSED",
      retryable: true,
    });
    expect(durable.status()).toBe("dispatched");
    expect(durable.failureEvidence()).toBeUndefined();
  });

  it("classifies a local database outage as transient before any mutation", async () => {
    const durable = fixture();
    durable.local.findByDeployment = async () => {
      throw Object.assign(new Error("database unavailable"), { code: "ECONNREFUSED" });
    };
    const orchestrator = new PublicationOrchestrator(durable.authority, durable.local, durable.loader);

    await expect(orchestrator.deploy(bundle.deploymentId)).rejects.toMatchObject({
      category: "transient",
      code: "ECONNREFUSED",
      step: "stage",
    });
    expect(durable.status()).toBe("pending");
  });

  it("classifies acknowledgement mismatch as a conflict without mutating the acknowledgement", async () => {
    const durable = fixture();
    durable.setAcknowledgementConflict();
    const orchestrator = new PublicationOrchestrator(durable.authority, durable.local, durable.loader);

    await expect(orchestrator.deploy(bundle.deploymentId)).rejects.toMatchObject({
      category: "conflict",
      code: "ACKNOWLEDGEMENT_CONFLICT",
      retryable: false,
    });
    expect(durable.status()).toBe("activated");
    expect(durable.activationMutations()).toBe(1);
    expect(durable.acknowledgementMutations()).toBe(0);
  });
});

function fixture(crashBoundary?: string) {
  let authorityStatus: PublicationDeploymentStatus = "pending";
  let localRelease: AppliedReleaseProjection | null = null;
  let active: ActiveReleaseProjection | null = null;
  let acknowledgement: PublicationDeploymentAcknowledgement | null = null;
  let activationMutations = 0;
  let acknowledgementMutations = 0;
  let failureEvidence: Readonly<Record<string, unknown>> | undefined;
  let acknowledgementConflict = false;
  let crash = crashBoundary;

  const crashAfter = (boundary: string) => {
    if (crash === boundary) {
      crash = undefined;
      throw Object.assign(new Error(`crash after ${boundary}`), { code: "ECONNRESET" });
    }
  };

  const release = (status: AppliedReleaseProjection["status"]): AppliedReleaseProjection => ({
    id: APPLIED_ID,
    publicationKey: bundle.publicationKey,
    deploymentId: bundle.deploymentId,
    sourceReleaseId: bundle.sourceReleaseId,
    sourceReleaseNo: bundle.sourceReleaseNo,
    artifactHash: bundle.artifactHash,
    status,
    stagedAt: "2026-01-01T00:00:00.000Z",
    ...(status === "verified" || status === "active" ? { verifiedAt: "2026-01-01T00:01:00.000Z" } : {}),
    ...(status === "active" ? { activatedAt: "2026-01-01T00:02:00.000Z" } : {}),
  });

  const authority: PublicationAuthorityRepository = {
    createRelease: unimplemented,
    transitionRelease: unimplemented,
    createArtifact: unimplemented,
    transitionArtifact: unimplemented,
    createDeployment: unimplemented,
    getRelease: async () => null,
    getDeployment: async () => ({ ...bundle, deploymentStatus: authorityStatus }),
    listRecoverableDeployments: async () => [],
    transitionDeployment: async (input) => {
      authorityStatus = input.status;
      if (input.status === "failed") failureEvidence = input.evidence;
      crashAfter(`authority:${input.status}`);
    },
    acknowledge: async (input) => {
      if (acknowledgementConflict) {
        throw Object.assign(new Error("ack mismatch"), { code: "ACKNOWLEDGEMENT_CONFLICT" });
      }
      acknowledgement ??= {
        id: "88888888-8888-4888-8888-888888888888",
        deploymentId: input.deploymentId,
        targetInstance: input.targetInstance,
        activeReleaseHash: input.activeReleaseHash,
        localAppliedReleaseId: input.localAppliedReleaseId,
        acknowledgedAt: "2026-01-01T00:03:00.000Z",
        evidence: input.evidence,
      };
      if (acknowledgementMutations === 0) acknowledgementMutations++;
      crashAfter("authority:acknowledge");
      return acknowledgement;
    },
  };

  const local: LocalProjectionRepository = {
    stage: async () => {
      localRelease ??= release("staged");
      crashAfter("local:stage");
      return localRelease;
    },
    verify: async () => {
      localRelease = release("verified");
      crashAfter("local:verify");
      return localRelease;
    },
    activate: async () => {
      if (!active) {
        activationMutations++;
        localRelease = release("active");
        active = { ...localRelease, status: "active", activatedAt: localRelease.activatedAt! };
      }
      crashAfter("local:activate");
      return active;
    },
    findByDeployment: async () => localRelease,
    findActive: async () => active,
    findActiveEntity: async () => null,
    rollback: unimplemented,
  };

  return {
    authority,
    local,
    loader: { load: async () => loaded },
    status: () => authorityStatus,
    activationMutations: () => activationMutations,
    acknowledgementMutations: () => acknowledgementMutations,
    failureEvidence: () => failureEvidence,
    setAcknowledgementConflict: () => { acknowledgementConflict = true; },
  };
}

async function unimplemented(): Promise<never> {
  throw new Error("not used by orchestrator test");
}
