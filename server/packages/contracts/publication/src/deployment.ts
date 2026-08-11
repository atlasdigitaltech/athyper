import type { PublicationPlane } from "./projection.js";

export type PublicationDeploymentStatus =
  | "pending"
  | "dispatched"
  | "received"
  | "staged"
  | "verified"
  | "activated"
  | "failed"
  | "rolled_back";

export interface PublicationDeploymentBundle {
  readonly deploymentId: string;
  readonly deploymentStatus: PublicationDeploymentStatus;
  readonly targetPlane: PublicationPlane;
  readonly targetEnvironment: string;
  readonly targetInstance: string;
  readonly publicationKey: string;
  readonly sourceReleaseId: string;
  readonly sourceReleaseNo: number;
  readonly artifactUri: string;
  readonly artifactHash: string;
  readonly signatureAlgorithm: string;
  readonly signingKeyId: string;
  readonly signature: string;
}

export interface PublicationDeploymentAcknowledgement {
  readonly id: string;
  readonly deploymentId: string;
  readonly targetInstance: string;
  readonly activeReleaseHash: string;
  readonly localAppliedReleaseId: string;
  readonly acknowledgedAt: string;
  readonly evidence?: Readonly<Record<string, unknown>>;
}

export interface AcknowledgeDeploymentInput {
  readonly deploymentId: string;
  readonly targetInstance: string;
  readonly activeReleaseHash: string;
  readonly localAppliedReleaseId: string;
  readonly evidence?: Readonly<Record<string, unknown>>;
}
