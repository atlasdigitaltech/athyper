import type {
  ActiveRelease,
  DeploymentBundle,
  DeploymentStatus,
  LocalPublicationRepository,
  PublicationArtifactLoader,
  PublicationAuthorityRepository,
} from "./publication.contract.js";

const PROGRESS: DeploymentStatus[] = [
  "pending", "dispatched", "received", "staged", "verified", "activated",
];

export class PublicationOrchestrationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "PublicationOrchestrationError";
  }
}

export class PublicationOrchestrator {
  constructor(
    private readonly authority: PublicationAuthorityRepository,
    private readonly local: LocalPublicationRepository,
    private readonly loader: PublicationArtifactLoader,
  ) {}

  activeRelease(publicationKey: string): Promise<ActiveRelease | null> {
    return this.local.active(publicationKey);
  }

  async deploy(deploymentId: string): Promise<ActiveRelease> {
    const bundle = await this.authority.getDeployment(deploymentId);
    if (!bundle) throw new PublicationOrchestrationError("DEPLOYMENT_NOT_AVAILABLE", deploymentId);
    if (bundle.deploymentStatus === "failed" || bundle.deploymentStatus === "rolled_back") {
      throw new PublicationOrchestrationError("DEPLOYMENT_TERMINAL", bundle.deploymentStatus);
    }

    let status = bundle.deploymentStatus;
    const advance = async (next: DeploymentStatus, evidence: Record<string, unknown> = {}) => {
      if (PROGRESS.indexOf(status) >= PROGRESS.indexOf(next)) return;
      await this.authority.transition(deploymentId, next, evidence);
      status = next;
    };

    await advance("dispatched", { orchestrator: "publication-runtime" });
    const artifact = await this.loader.load(bundle);
    await advance("received", { artifact_uri: bundle.artifactUri });

    const staged = await this.local.stage(bundle, artifact);
    await advance("staged", { local_applied_release_id: staged.id });

    const verified = staged.status === "staged" ? await this.local.verify(staged.id, artifact) : staged;
    if (verified.status === "rejected") {
      await this.authority.transition(deploymentId, "failed", { code: "LOCAL_VERIFICATION_REJECTED" });
      throw new PublicationOrchestrationError("LOCAL_VERIFICATION_REJECTED", deploymentId);
    }
    if (verified.status !== "verified" && verified.status !== "active") {
      throw new PublicationOrchestrationError("LOCAL_RELEASE_NOT_VERIFIED", verified.status);
    }
    await advance("verified", { local_applied_release_id: verified.id });

    const active = verified.status === "active"
      ? await this.local.active(bundle.publicationKey)
      : await this.local.activate(verified.id, { deployment_id: deploymentId });
    if (!active || active.id !== verified.id) {
      throw new PublicationOrchestrationError("LOCAL_ACTIVATION_HEAD_MISMATCH", deploymentId);
    }

    await advance("activated", { local_applied_release_id: active.id });
    await this.authority.acknowledge({
      deploymentId,
      targetInstance: bundle.targetInstance,
      activeReleaseHash: active.artifactHash,
      localAppliedReleaseId: active.id,
      evidence: { source_release_no: active.sourceReleaseNo },
    });
    return active;
  }
}
