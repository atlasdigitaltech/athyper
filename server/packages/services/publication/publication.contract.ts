export type DeploymentStatus =
  | "pending" | "dispatched" | "received" | "staged"
  | "verified" | "activated" | "failed" | "rolled_back";

export type AppliedReleaseStatus = "staged" | "verified" | "active" | "rejected" | "superseded";
export type PublicationPlane = "athyper" | "neon" | "mesh";

export interface DeploymentBundle {
  deploymentId: string;
  deploymentStatus: DeploymentStatus;
  targetPlane: PublicationPlane;
  targetEnvironment: string;
  targetInstance: string;
  publicationKey: string;
  sourceReleaseId: string;
  sourceReleaseNo: number;
  artifactUri: string;
  artifactHash: string;
  signatureAlgorithm: string;
  signingKeyId: string;
  signature: string;
}

export interface LoadedPublicationArtifact {
  manifest: Record<string, unknown>;
  computedArtifactHash: string;
  signatureVerified: boolean;
  manifestValid: boolean;
  runtimeCompatible: boolean;
  evidence?: Record<string, unknown>;
}

export interface AppliedRelease {
  id: string;
  publicationKey: string;
  deploymentId: string;
  sourceReleaseId: string;
  sourceReleaseNo: number;
  artifactHash: string;
  manifest: Record<string, unknown>;
  status: AppliedReleaseStatus;
}

export interface ActiveRelease extends AppliedRelease {
  activatedAt: string;
}

export interface PublicationArtifactLoader {
  load(bundle: DeploymentBundle): Promise<LoadedPublicationArtifact>;
}

export interface PublicationAuthorityRepository {
  getDeployment(deploymentId: string): Promise<DeploymentBundle | null>;
  transition(deploymentId: string, status: DeploymentStatus, evidence?: Record<string, unknown>): Promise<void>;
  acknowledge(input: {
    deploymentId: string;
    targetInstance: string;
    activeReleaseHash: string;
    localAppliedReleaseId: string;
    evidence?: Record<string, unknown>;
  }): Promise<void>;
}

export interface LocalPublicationRepository {
  stage(bundle: DeploymentBundle, artifact: LoadedPublicationArtifact): Promise<AppliedRelease>;
  verify(appliedReleaseId: string, artifact: LoadedPublicationArtifact): Promise<AppliedRelease>;
  activate(appliedReleaseId: string, evidence?: Record<string, unknown>): Promise<ActiveRelease>;
  findByDeployment(deploymentId: string): Promise<AppliedRelease | null>;
  active(publicationKey: string): Promise<ActiveRelease | null>;
}
