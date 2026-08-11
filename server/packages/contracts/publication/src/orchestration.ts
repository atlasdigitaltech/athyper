import type { PublicationArtifactDocumentV1 } from "./artifact.js";
import type { PublicationDeploymentBundle } from "./deployment.js";
import type { PublicationVerificationEvidence } from "./projection.js";

export interface LoadedPublicationArtifact {
  readonly document: PublicationArtifactDocumentV1;
  readonly computedArtifactHash: string;
  readonly verification: PublicationVerificationEvidence;
}

export interface PublicationArtifactLoader {
  load(deployment: PublicationDeploymentBundle): Promise<LoadedPublicationArtifact>;
}

export type PublicationFailureCategory = "permanent" | "transient" | "conflict";

export interface PublicationFailureEvidence {
  readonly category: PublicationFailureCategory;
  readonly code: string;
  readonly step: PublicationOrchestrationStep;
  readonly retryable: boolean;
}

export type PublicationOrchestrationStep =
  | "load"
  | "stage"
  | "verify"
  | "activate"
  | "acknowledge";
