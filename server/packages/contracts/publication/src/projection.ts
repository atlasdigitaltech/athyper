export type PublicationPlane = "studio" | "neon" | "mesh";
export type PublicationCompatibilityLevel =
  | "breaking"
  | "backward_compatible"
  | "forward_compatible"
  | "fully_compatible";

export interface ProjectionSignatureEvidence {
  readonly algorithm: string;
  readonly keyId: string;
  readonly signature: string;
}

export interface EntityContractProjection {
  readonly id: string;
  readonly tenantId?: string;
  readonly entityId: string;
  readonly entityCode: string;
  readonly releaseId: string;
  readonly revisionId: string;
  readonly releaseNo: number;
  readonly contractSchemaCode: string;
  readonly contractSchemaVersion: string;
  readonly contractHash: string;
  readonly contract: Readonly<Record<string, unknown>>;
  readonly publicationKey: string;
  readonly signature: ProjectionSignatureEvidence;
  readonly publishedAt: string;
}

export interface EntityDescriptorProjection {
  readonly id: string;
  readonly plane: PublicationPlane;
  readonly descriptorKind: "entity_runtime";
  readonly descriptorSchemaVersion: string;
  readonly sourceContractHash: string;
  readonly compiledHash: string;
  readonly descriptor: Readonly<Record<string, unknown>>;
  readonly compilerVersion: string;
  readonly compatibilityLevel: PublicationCompatibilityLevel;
  readonly generatedAt: string;
}

export interface EntityRuntimeProjection {
  readonly entityContract: EntityContractProjection;
  readonly entityDescriptor: EntityDescriptorProjection;
}

export type AppliedReleaseStatus = "staged" | "verified" | "active" | "rejected" | "superseded";

export interface AppliedReleaseProjection {
  readonly id: string;
  readonly publicationKey: string;
  readonly deploymentId: string;
  readonly sourceReleaseId: string;
  readonly sourceReleaseNo: number;
  readonly artifactHash: string;
  readonly status: AppliedReleaseStatus;
  readonly stagedAt: string;
  readonly verifiedAt?: string;
  readonly activatedAt?: string;
  readonly failureCode?: string;
}

export interface ActiveReleaseProjection extends AppliedReleaseProjection {
  readonly status: "active";
  readonly activatedAt: string;
}

export interface ActiveEntityProjection {
  readonly entityContractId: string;
  readonly entityDescriptorId: string;
  readonly tenantId?: string;
  readonly entityId: string;
  readonly entityCode: string;
  readonly releaseId: string;
  readonly releaseNo: number;
  readonly contractHash: string;
  readonly contract: Readonly<Record<string, unknown>>;
  readonly plane: PublicationPlane;
  readonly descriptorKind: "entity_runtime";
  readonly compiledHash: string;
  readonly descriptor: Readonly<Record<string, unknown>>;
  readonly activatedAt: string;
}

export interface LocalProjectionRepository {
  stage(input: StageReleaseInput): Promise<AppliedReleaseProjection>;
  verify(input: VerifyReleaseInput): Promise<AppliedReleaseProjection>;
  activate(input: ActivateReleaseInput): Promise<ActiveReleaseProjection>;
  findByDeployment(deploymentId: string): Promise<AppliedReleaseProjection | null>;
  findActive(publicationKey: string): Promise<ActiveReleaseProjection | null>;
  findActiveEntity(publicationKey: string): Promise<ActiveEntityProjection | null>;
  rollback(input: RollbackReleaseInput): Promise<ActiveReleaseProjection>;
}

export interface StageReleaseInput {
  readonly deployment: import("./deployment.js").PublicationDeploymentBundle;
  readonly artifact: import("./artifact.js").PublicationArtifactDocumentV1;
}

export interface VerifyReleaseInput {
  readonly appliedReleaseId: string;
  readonly computedArtifactHash: string;
  readonly evidence: PublicationVerificationEvidence;
}

export interface PublicationVerificationEvidence {
  readonly signatureVerified: boolean;
  readonly manifestValid: boolean;
  readonly runtimeCompatible: boolean;
  readonly targetPlane: PublicationPlane;
  readonly contractHash: string;
  readonly descriptorSourceHash: string;
  readonly contractSchemaVersion: string;
  readonly descriptorSchemaVersion: string;
  readonly signatureAlgorithm?: string;
  readonly signingKeyId?: string;
}

export interface ActivateReleaseInput {
  readonly appliedReleaseId: string;
  readonly evidence?: Readonly<Record<string, unknown>>;
}

export interface RollbackReleaseInput {
  readonly publicationKey: string;
  readonly targetAppliedReleaseId: string;
  readonly evidence?: Readonly<Record<string, unknown>>;
}
