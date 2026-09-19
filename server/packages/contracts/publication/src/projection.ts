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
  readonly descriptorKind: "entity_runtime" | "entity_case_runtime";
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

export const BUSINESS_PARTNER_DEFINITION_BUNDLE_SCHEMA_V1 =
  "athyper.business-partner-definition-bundle.v1" as const;

export interface BusinessPartnerDefinitionBundleV1 {
  readonly schema: typeof BUSINESS_PARTNER_DEFINITION_BUNDLE_SCHEMA_V1;
  readonly bundleCode: string;
  readonly semanticVersion: string;
  readonly requestSchemas: Readonly<Record<string, unknown>>;
  readonly fieldPolicies: Readonly<Record<string, unknown>>;
  readonly validationDeclarations: readonly Readonly<Record<string, unknown>>[];
  readonly duplicateRules: Readonly<Record<string, unknown>>;
  readonly formDescriptors: Readonly<Record<string, unknown>>;
  readonly viewDescriptors: Readonly<Record<string, unknown>>;
  readonly mappingContracts: Readonly<Record<string, unknown>>;
  readonly workflowDefinitions: Readonly<Record<string, unknown>>;
  readonly evidencePolicies: Readonly<Record<string, unknown>>;
  readonly readinessGates: Readonly<Record<string, unknown>>;
  readonly reasonCodeCatalog: Readonly<Record<string, string>>;
  readonly meshSafeSchemas: Readonly<Record<string, unknown>>;
  readonly compatibilityRules: Readonly<Record<string, unknown>>;
  readonly sourceContractHashes: Readonly<Record<string, string>>;
}

export interface BusinessPartnerDefinitionProjection {
  readonly id: string;
  readonly tenantId: string;
  readonly revisionId: string;
  readonly releaseId: string;
  readonly releaseNo: number;
  readonly publicationKey: string;
  readonly plane: PublicationPlane;
  readonly bundleCode: string;
  readonly semanticVersion: string;
  readonly bundleSchemaVersion: string;
  readonly bundleHash: string;
  readonly sourceBundleHash?: string;
  readonly bundle: BusinessPartnerDefinitionBundleV1;
  readonly compileReport?: Readonly<Record<string, unknown>>;
  readonly generatedAt: string;
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
  readonly descriptorKind: "entity_runtime" | "entity_case_runtime";
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
  findActiveBusinessPartnerDefinition?(publicationKey: string): Promise<BusinessPartnerDefinitionProjection | null>;
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
  readonly contractHash?: string;
  readonly descriptorSourceHash?: string;
  readonly contractSchemaVersion?: string;
  readonly descriptorSchemaVersion?: string;
  readonly payloadHash?: string;
  readonly payloadSchemaVersion?: string;
  readonly definitionBundleHash?: string;
  readonly definitionBundleSchemaVersion?: string;
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
