export type DeploymentStatus =
  | "pending" | "dispatched" | "received" | "staged"
  | "verified" | "activated" | "failed" | "rolled_back";

export type AppliedReleaseStatus = "staged" | "verified" | "active" | "rejected" | "superseded";
export type PublicationPlane = "athyper" | "neon" | "mesh";

export interface EntityContractProjection {
  id: string;
  tenant_id: string | null;
  entity_id: string;
  entity_code: string;
  release_id: string;
  revision_id: string;
  release_no: number;
  contract_schema_code: string;
  contract_schema_version: string;
  contract_hash: string;
  contract_json: Record<string, unknown>;
  publication_key: string;
  signature_algorithm: string;
  signing_key_id: string;
  signature: string;
  published_at: string;
}

export interface EntityDescriptorProjection {
  id: string;
  plane_code: PublicationPlane;
  descriptor_kind: "admin_preview" | "entity_runtime";
  descriptor_schema_version: string;
  source_contract_hash: string;
  compiled_hash: string;
  compiled_json: Record<string, unknown>;
  compiler_version: string;
  compatibility_level: "breaking" | "backward_compatible" | "forward_compatible" | "fully_compatible";
  generated_at: string;
}

export interface EntityRuntimeProjection {
  contract: EntityContractProjection;
  descriptor: EntityDescriptorProjection;
}

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
  entityProjection?: EntityRuntimeProjection;
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

export interface ActiveEntityProjection {
  entityContractId: string;
  entityDescriptorId: string;
  tenantId: string | null;
  entityId: string;
  entityCode: string;
  releaseId: string;
  releaseNo: number;
  contractHash: string;
  contract: Record<string, unknown>;
  plane: PublicationPlane;
  descriptorKind: string;
  compiledHash: string;
  descriptor: Record<string, unknown>;
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
  activeEntity(publicationKey: string, descriptorKind?: string): Promise<ActiveEntityProjection | null>;
  rollback(publicationKey: string, targetAppliedReleaseId: string, evidence?: Record<string, unknown>): Promise<ActiveRelease>;
}
