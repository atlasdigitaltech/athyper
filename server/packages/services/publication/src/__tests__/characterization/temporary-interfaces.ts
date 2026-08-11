export type Plane = "studio" | "neon" | "mesh";
export type DeploymentStatus =
  | "pending"
  | "dispatched"
  | "received"
  | "staged"
  | "verified"
  | "activated"
  | "failed"
  | "rolled_back";
export type LocalStatus = "staged" | "verified" | "active" | "rejected" | "superseded";

export interface Bundle {
  deploymentId: string;
  publicationKey: string;
  sourceReleaseId: string;
  sourceReleaseNo: number;
  targetPlane: Plane;
  targetInstance: string;
  artifactHash: string;
  status: DeploymentStatus;
}

export interface LoadedArtifact {
  bytesHash: string;
  targetPlane: Plane;
  signatureVerified: boolean;
}

export interface LocalRelease {
  id: string;
  deploymentId: string;
  publicationKey: string;
  sourceReleaseNo: number;
  artifactHash: string;
  status: LocalStatus;
}

export interface Acknowledgement {
  deploymentId: string;
  targetInstance: string;
  activeReleaseHash: string;
  localAppliedReleaseId: string;
}

export interface CharacterizationAuthority {
  getDeployment(id: string): Promise<Bundle | null>;
  transition(id: string, status: DeploymentStatus): Promise<void>;
  acknowledge(input: Acknowledgement): Promise<void>;
}

export interface CharacterizationLocalProjection {
  findByDeployment(id: string): Promise<LocalRelease | null>;
  stage(bundle: Bundle, artifact: LoadedArtifact): Promise<LocalRelease>;
  verify(release: LocalRelease, artifact: LoadedArtifact): Promise<LocalRelease>;
  activate(release: LocalRelease): Promise<LocalRelease>;
  active(publicationKey: string): Promise<LocalRelease | null>;
  rollback(publicationKey: string, releaseId: string): Promise<LocalRelease>;
}
