import type {
  ActiveEntityProjection,
  ActiveReleaseProjection,
  AppliedReleaseProjection,
  LocalProjectionRepository,
  PublicationArtifactLoader,
  PublicationAuthorityRepository,
  PublicationDeploymentBundle,
  PublicationDeploymentStatus,
  PublicationFailureCategory,
  PublicationFailureEvidence,
  PublicationOrchestrationStep,
} from "@athyper/server-contract-publication";

const PROGRESS: readonly PublicationDeploymentStatus[] = [
  "pending",
  "dispatched",
  "received",
  "staged",
  "verified",
  "activated",
];

const PERMANENT_CODES = new Set([
  "ARTIFACT_INVALID",
  "ARTIFACT_SCHEMA_REQUIRED",
  "ARTIFACT_SCHEMA_UNSUPPORTED",
  "ARTIFACT_PAYLOAD_INVALID",
  "ARTIFACT_PLANE_INVALID",
  "ARTIFACT_COORDINATES_INVALID",
  "ARTIFACT_HASH_MISMATCH",
  "ARTIFACT_SIGNATURE_INVALID",
  "ARTIFACT_MANIFEST_INVALID",
  "RUNTIME_INCOMPATIBLE",
  "TARGET_PLANE_MISMATCH",
  "PROJECTION_HASH_MISMATCH",
  "PROJECTION_SCHEMA_VERSION_MISMATCH",
  "ENTITY_PROJECTION_REQUIRED",
]);

const CONFLICT_CODES = new Set([
  "ACTIVATION_REGRESSION",
  "RELEASE_SEQUENCE_NOT_FORWARD",
  "LOCAL_ACTIVATION_HEAD_MISMATCH",
  "ACKNOWLEDGEMENT_CONFLICT",
  "DEPLOYMENT_TERMINAL",
]);

export class PublicationOrchestrationError extends Error {
  readonly retryable: boolean;

  constructor(
    readonly category: PublicationFailureCategory,
    readonly code: string,
    readonly step: PublicationOrchestrationStep,
    message = code,
    options?: { readonly cause?: unknown },
  ) {
    super(message, options);
    this.name = "PublicationOrchestrationError";
    this.retryable = category === "transient";
  }

  evidence(): PublicationFailureEvidence {
    return {
      category: this.category,
      code: safeCode(this.code),
      step: this.step,
      retryable: this.retryable,
    };
  }
}

export class PublicationOrchestrator {
  constructor(
    private readonly authority: PublicationAuthorityRepository,
    private readonly local: LocalProjectionRepository,
    private readonly loader: PublicationArtifactLoader,
  ) {}

  activeRelease(publicationKey: string): Promise<ActiveReleaseProjection | null> {
    return this.local.findActive(publicationKey);
  }

  activeEntity(publicationKey: string): Promise<ActiveEntityProjection | null> {
    return this.local.findActiveEntity(publicationKey);
  }

  async deploy(deploymentId: string): Promise<ActiveReleaseProjection> {
    const deployment = await this.loadDeployment(deploymentId);
    assertDeployable(deployment);

    let authorityStatus = deployment.deploymentStatus;
    let localRelease: AppliedReleaseProjection | null = null;
    let loaded: Awaited<ReturnType<PublicationArtifactLoader["load"]>> | undefined;
    let currentStep: PublicationOrchestrationStep = "stage";

    const advance = async (
      status: PublicationDeploymentStatus,
      evidence: Readonly<Record<string, unknown>> = {},
    ): Promise<void> => {
      if (progress(authorityStatus) >= progress(status)) return;
      await this.authority.transitionDeployment({ deploymentId, status, evidence });
      authorityStatus = status;
    };

    try {
      localRelease = await this.local.findByDeployment(deploymentId);
      await advance("dispatched", { orchestrator: "publication.v1" });

      if (!localRelease) {
        currentStep = "load";
        loaded = await this.loader.load(deployment);
        await advance("received", { artifactLoaded: true });
        currentStep = "stage";
        localRelease = await this.local.stage({ deployment, artifact: loaded.document });
      }
      assertLocalCoordinates(deployment, localRelease);
      await advance("received", { artifactLoaded: true });
      await advance("staged", { localAppliedReleaseId: localRelease.id });

      if (localRelease.status === "rejected") {
        throw permanent(localRelease.failureCode ?? "LOCAL_VERIFICATION_REJECTED", "verify");
      }
      if (localRelease.status === "staged") {
        currentStep = "load";
        loaded ??= await this.loader.load(deployment);
        currentStep = "verify";
        localRelease = await this.local.verify({
          appliedReleaseId: localRelease.id,
          computedArtifactHash: loaded.computedArtifactHash,
          evidence: loaded.verification,
        });
      }
      if (localRelease.status === "rejected") {
        throw permanent(localRelease.failureCode ?? "LOCAL_VERIFICATION_REJECTED", "verify");
      }
      if (!isVerified(localRelease)) {
        throw conflict("LOCAL_RELEASE_NOT_VERIFIED", "verify");
      }
      await advance("verified", { localAppliedReleaseId: localRelease.id });

      let active = await this.local.findActive(deployment.publicationKey);
      if (localRelease.status !== "active") {
        currentStep = "activate";
        active = await this.local.activate({
          appliedReleaseId: localRelease.id,
          evidence: { deploymentId },
        });
      }
      if (!active || active.id !== localRelease.id || active.artifactHash !== deployment.artifactHash) {
        throw conflict("LOCAL_ACTIVATION_HEAD_MISMATCH", "activate");
      }
      await advance("activated", { localAppliedReleaseId: active.id });

      currentStep = "acknowledge";
      await this.authority.acknowledge({
        deploymentId,
        targetInstance: deployment.targetInstance,
        activeReleaseHash: active.artifactHash,
        localAppliedReleaseId: active.id,
        evidence: { sourceReleaseNo: active.sourceReleaseNo },
      });
      return active;
    } catch (error) {
      const failure = classifyPublicationFailure(error, currentStep);
      if (failure.category === "permanent" && authorityStatus !== "activated") {
        await this.authority.transitionDeployment({
          deploymentId,
          status: "failed",
          evidence: { ...failure.evidence() },
        });
      }
      throw failure;
    }
  }

  private async loadDeployment(deploymentId: string): Promise<PublicationDeploymentBundle> {
    try {
      const deployment = await this.authority.getDeployment(deploymentId);
      if (!deployment) throw permanent("DEPLOYMENT_NOT_AVAILABLE", "load");
      return deployment;
    } catch (error) {
      throw classifyPublicationFailure(error, "load");
    }
  }
}

export function classifyPublicationFailure(
  error: unknown,
  step: PublicationOrchestrationStep,
): PublicationOrchestrationError {
  if (error instanceof PublicationOrchestrationError) return error;
  const code = errorCode(error);
  if (CONFLICT_CODES.has(code)) return conflict(code, step, error);
  if (PERMANENT_CODES.has(code) || Reflect.get(asObject(error), "retryable") === false) {
    return permanent(code, step, error);
  }
  return new PublicationOrchestrationError("transient", code, step, "Publication dependency unavailable", {
    cause: error,
  });
}

function assertDeployable(deployment: PublicationDeploymentBundle): void {
  if (deployment.deploymentStatus === "failed" || deployment.deploymentStatus === "rolled_back") {
    throw conflict("DEPLOYMENT_TERMINAL", "load");
  }
}

function assertLocalCoordinates(
  deployment: PublicationDeploymentBundle,
  release: AppliedReleaseProjection,
): void {
  if (
    release.deploymentId !== deployment.deploymentId
    || release.publicationKey !== deployment.publicationKey
    || release.sourceReleaseId !== deployment.sourceReleaseId
    || release.sourceReleaseNo !== deployment.sourceReleaseNo
    || release.artifactHash !== deployment.artifactHash
  ) throw conflict("LOCAL_RELEASE_COORDINATE_MISMATCH", "stage");
}

function isVerified(release: AppliedReleaseProjection): boolean {
  return release.status === "verified" || release.status === "active";
}

function progress(status: PublicationDeploymentStatus): number {
  return PROGRESS.indexOf(status);
}

function permanent(code: string, step: PublicationOrchestrationStep, cause?: unknown) {
  return new PublicationOrchestrationError("permanent", safeCode(code), step, "Publication artifact rejected", { cause });
}

function conflict(code: string, step: PublicationOrchestrationStep, cause?: unknown) {
  return new PublicationOrchestrationError("conflict", safeCode(code), step, "Publication state conflict", { cause });
}

function errorCode(error: unknown): string {
  const candidate = Reflect.get(asObject(error), "code");
  if (typeof candidate === "string" && candidate.length > 0) return safeCode(candidate);
  return error instanceof TypeError ? "INVALID_PUBLICATION_INPUT" : "PUBLICATION_DEPENDENCY_UNAVAILABLE";
}

function safeCode(code: string): string {
  const normalized = code.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 96);
  return normalized || "PUBLICATION_FAILURE";
}

function asObject(value: unknown): object {
  return value !== null && (typeof value === "object" || typeof value === "function") ? value : {};
}
