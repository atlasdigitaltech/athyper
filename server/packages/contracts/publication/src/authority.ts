import type {
  AcknowledgeDeploymentInput,
  PublicationDeploymentAcknowledgement,
  PublicationDeploymentBundle,
  PublicationDeploymentStatus,
} from "./deployment.js";

export type PublicationReleaseStatus =
  "preparing" | "approved" | "published" | "withdrawn";
export type PublicationArtifactStatus = "compiled" | "validated" | "signed";

export interface PublicationRelease {
  readonly id: string;
  readonly tenantId: string;
  readonly publicationKey: string;
  readonly releaseNo: number;
  readonly releaseKind: "publish" | "rollback";
  readonly status: PublicationReleaseStatus;
  readonly createdAt: string;
  readonly approvedAt?: string;
  readonly publishedAt?: string;
  readonly withdrawnAt?: string;
}

export interface CreatePublicationReleaseInput {
  readonly id: string;
  readonly tenantId: string;
  readonly entityReleaseId?: string;
  readonly businessPartnerDefinitionRevisionId?: string;
  readonly publicationKey: string;
  readonly releaseNo: number;
  readonly releaseKind: "publish" | "rollback";
  readonly compatibilityLevel: import("./projection.js").PublicationCompatibilityLevel;
  readonly releaseHash: string;
  readonly manifestHash: string;
  readonly minimumRuntimeVersion?: string;
  readonly actorId: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CreatePublicationArtifactInput {
  readonly id: string;
  readonly releaseId: string;
  readonly plane: import("./projection.js").PublicationPlane;
  readonly artifactKind: import("./artifact.js").PublicationArtifactKind;
  readonly artifactUri: string;
  readonly contentHash: string;
  readonly actorId: string;
}

export interface CreatePublicationDeploymentInput {
  readonly commandId: string;
  readonly artifactId: string;
  readonly targetPlane: import("./projection.js").PublicationPlane;
  readonly targetEnvironment: string;
  readonly targetInstance: string;
  readonly attempt: number;
  readonly correlationId?: string;
  readonly actorId: string;
}

export interface PublicationAuthorityRepository {
  createRelease(
    input: CreatePublicationReleaseInput,
  ): Promise<PublicationRelease>;
  transitionRelease(input: {
    readonly releaseId: string;
    readonly status: PublicationReleaseStatus;
    readonly actorId: string;
    readonly correlationId?: string;
    readonly evidence?: Readonly<Record<string, unknown>>;
  }): Promise<PublicationRelease>;
  createArtifact(input: CreatePublicationArtifactInput): Promise<{
    readonly id: string;
    readonly status: PublicationArtifactStatus;
  }>;
  transitionArtifact(input: {
    readonly artifactId: string;
    readonly status: PublicationArtifactStatus;
    readonly signatureAlgorithm?: string;
    readonly signingKeyId?: string;
    readonly signature?: string;
  }): Promise<{
    readonly id: string;
    readonly status: PublicationArtifactStatus;
  }>;
  createDeployment(
    input: CreatePublicationDeploymentInput,
  ): Promise<PublicationDeploymentBundle>;
  getRelease(releaseId: string): Promise<PublicationRelease | null>;
  getDeployment(
    deploymentId: string,
  ): Promise<PublicationDeploymentBundle | null>;
  listRecoverableDeployments(
    limit: number,
  ): Promise<readonly PublicationDeploymentBundle[]>;
  transitionDeployment(input: {
    readonly deploymentId: string;
    readonly status: PublicationDeploymentStatus;
    readonly evidence?: Readonly<Record<string, unknown>>;
  }): Promise<void>;
  acknowledge(
    input: AcknowledgeDeploymentInput,
  ): Promise<PublicationDeploymentAcknowledgement>;
}
