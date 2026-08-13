import type { PublicationPlane } from "./projection.js";

export type PublicationDeliveryOperationalStatus = "pending" | "healthy" | "failed" | "dead_letter" | "replay_requested";

export interface PublicationDeadLetter {
  readonly deliveryId: string;
  readonly deploymentId: string;
  readonly targetPlane: PublicationPlane;
  readonly targetInstance: string;
  readonly status: PublicationDeliveryOperationalStatus;
  readonly attempts: number;
  readonly failureCode: string;
  readonly failedAt: string;
  readonly artifactHash: string;
}

export interface PublicationDestinationHealth {
  readonly targetPlane: PublicationPlane;
  readonly targetInstance: string;
  readonly status: "healthy" | "degraded" | "unavailable" | "unknown";
  readonly checkedAt: string;
  readonly consecutiveFailures: number;
  readonly acknowledgementLagMs?: number;
  readonly evidence?: Readonly<Record<string, unknown>>;
}

export interface PublicationArtifactProvenance {
  readonly deploymentId: string;
  readonly releaseId: string;
  readonly releaseNo: number;
  readonly publicationKey: string;
  readonly targetPlane: PublicationPlane;
  readonly artifactUri: string;
  readonly artifactHash: string;
  readonly compilerName: string;
  readonly compilerVersion: string;
  readonly signingKeyId: string;
  readonly signatureAlgorithm: string;
  readonly compiledAt: string;
}

export interface PublicationOperationsRepository {
  getDeadLetter(tenantId: string, deliveryId: string): Promise<PublicationDeadLetter | null>;
  listDeadLetters(input: { readonly tenantId: string; readonly plane?: PublicationPlane; readonly targetInstance?: string; readonly limit: number; readonly cursor?: string }): Promise<{ readonly items: readonly PublicationDeadLetter[]; readonly nextCursor?: string }>;
  getDestinationHealth(tenantId: string, targetPlane: PublicationPlane, targetInstance: string): Promise<PublicationDestinationHealth>;
  createReplayDeployment(input: { readonly tenantId: string; readonly deliveryId: string; readonly replayCommandId: string; readonly actorId: string; readonly requestedAt: string }): Promise<{ readonly deploymentId: string; readonly targetPlane: PublicationPlane }>;
  recordReplayRequested(input: { readonly tenantId: string; readonly deliveryId: string; readonly replayDeploymentId: string; readonly replayJobId: string; readonly actorId: string; readonly reason: string; readonly requestedAt: string }): Promise<void>;
  getArtifactProvenance(tenantId: string, deploymentId: string): Promise<PublicationArtifactProvenance | null>;
}

export interface PublicationSigningKeyVersion {
  readonly keyId: string;
  readonly status: "staged" | "active" | "retiring" | "retired";
  readonly activatesAt: string;
  readonly retiresAt?: string;
}

export interface PublicationSigningKeyRegistry {
  list(): Promise<readonly PublicationSigningKeyVersion[]>;
  stage(input: { readonly keyId: string; readonly activatesAt: string }): Promise<PublicationSigningKeyVersion>;
  activate(input: { readonly keyId: string; readonly previousKeyId?: string; readonly previousKeyRetiresAt?: string }): Promise<void>;
}

export interface PublicationCanaryAssessment {
  readonly decision: "promote" | "hold" | "rollback";
  readonly sampledDestinations: number;
  readonly healthyDestinations: number;
  readonly failedDestinations: number;
  readonly reasons: readonly string[];
}
