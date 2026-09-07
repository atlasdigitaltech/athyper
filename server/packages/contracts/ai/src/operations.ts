import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { AtlasProviderCredentialLease, AtlasProviderId } from "./model.js";

export interface AtlasCredentialCiphertext { readonly payload: string; readonly keyVersion: number }
export interface AtlasCredentialCipher {
  encrypt(input: { readonly tenantId: string; readonly plaintext: string }): Promise<AtlasCredentialCiphertext>;
  decrypt(input: { readonly tenantId: string; readonly ciphertext: string; readonly keyVersion: number }): Promise<string>;
}
export interface AtlasCredentialInvalidation { publish(input: { readonly tenantId: string; readonly providerId: AtlasProviderId; readonly rotationEpoch: number }): Promise<void> }
export interface AtlasCredentialMetadata { readonly credentialId: string; readonly providerId: AtlasProviderId; readonly rotationEpoch: number; readonly keyVersion: number; readonly status: "active" | "superseded" | "revoked"; readonly activatedAt: string; readonly revokedAt?: string }
export interface AtlasCredentialRepository {
  rotate(input: { readonly context: VerifiedRequestContext; readonly providerId: AtlasProviderId; readonly ciphertext: AtlasCredentialCiphertext; readonly credentialId: string; readonly at: string }): Promise<AtlasCredentialMetadata>;
  revoke(input: { readonly context: VerifiedRequestContext; readonly providerId: AtlasProviderId; readonly at: string }): Promise<AtlasCredentialMetadata | null>;
  readActiveForResolution(input: { readonly tenantId: string; readonly providerId: AtlasProviderId }): Promise<{ readonly metadata: AtlasCredentialMetadata; readonly encryptedSecret: string } | null>;
  currentEpoch(input: { readonly tenantId: string; readonly providerId: AtlasProviderId }): Promise<{ readonly rotationEpoch: number; readonly revoked: boolean } | null>;
  health(): Promise<{ readonly healthy: boolean; readonly message?: string }>;
}
/** Write-only administration plus internal lease resolution. There is deliberately no secret-read API. */
export interface AtlasCredentialAdministration {
  createOrRotate(input: { readonly context: VerifiedRequestContext; readonly providerId: AtlasProviderId; readonly secret: string }): Promise<AtlasCredentialMetadata>;
  revoke(input: { readonly context: VerifiedRequestContext; readonly providerId: AtlasProviderId }): Promise<AtlasCredentialMetadata | null>;
}
export interface AtlasTenantCredentialResolver { resolveTenant(input: { readonly tenantId: string; readonly providerId: AtlasProviderId; readonly ownerId: string }): Promise<AtlasProviderCredentialLease | null>; invalidate(input: { readonly tenantId: string; readonly providerId: AtlasProviderId }): void }

export type AtlasKnowledgeSourceStatus = "active" | "disabled" | "deleted";
export type AtlasKnowledgeRevisionStatus = "pending" | "indexing" | "ready" | "failed" | "superseded" | "deleted";
export interface AtlasKnowledgeSource { readonly id: string; readonly tenantId: string; readonly sourceKind: string; readonly sourceId: string; readonly entityCode?: string; readonly permissionCode: string; readonly status: AtlasKnowledgeSourceStatus; readonly createdAt: string }
export interface AtlasKnowledgeChunkInput { readonly ordinal: number; readonly characterStart: number; readonly characterEnd: number; readonly contentHash: string; readonly text: string }
export interface AtlasKnowledgeCitation { readonly sourceId: string; readonly sourceVersionId: string; readonly revisionId: string; readonly chunkId: string; readonly contentHash: string; readonly characterStart: number; readonly characterEnd: number }
export interface AtlasKnowledgeIndex { index(input: { readonly tenantId: string; readonly source: AtlasKnowledgeSource; readonly revisionId: string; readonly sourceVersionId: string; readonly chunks: readonly AtlasKnowledgeChunkInput[] }): Promise<readonly { readonly ordinal: number; readonly indexReference: string; readonly embeddingModel: string }[]>; search(input: { readonly tenantId: string; readonly query: string; readonly limit: number }): Promise<readonly { readonly citation: AtlasKnowledgeCitation; readonly permissionCode: string; readonly score: number }[]>; remove(input: { readonly tenantId: string; readonly revisionIds: readonly string[] }): Promise<void>; health(): Promise<{ readonly healthy: boolean; readonly message?: string }> }
export interface AtlasKnowledgeRepository {
  registerSource(input: { readonly context: VerifiedRequestContext; readonly sourceId: string; readonly sourceKind: string; readonly entityCode?: string; readonly permissionCode: string; readonly id: string; readonly at: string }): Promise<AtlasKnowledgeSource>;
  beginRevision(input: { readonly context: VerifiedRequestContext; readonly sourceId: string; readonly revisionId: string; readonly sourceVersionId: string; readonly contentHash: string; readonly chunks: readonly Omit<AtlasKnowledgeChunkInput, "text">[]; readonly at: string }): Promise<{ readonly revisionId: string; readonly replayed: boolean; readonly source: AtlasKnowledgeSource }>;
  markReady(input: { readonly context: VerifiedRequestContext; readonly sourceId: string; readonly revisionId: string; readonly indexed: readonly { readonly ordinal: number; readonly indexReference: string; readonly embeddingModel: string }[]; readonly at: string }): Promise<void>;
  markFailed(input: { readonly context: VerifiedRequestContext; readonly revisionId: string; readonly at: string }): Promise<void>;
  retract(input: { readonly context: VerifiedRequestContext; readonly sourceId: string; readonly sourceKind?: string; readonly delete: boolean; readonly at: string }): Promise<readonly string[]>;
  health(): Promise<{ readonly healthy: boolean; readonly message?: string }>;
}

export type AtlasActionAutonomy = "disabled" | "suggest" | "assist" | "auto";
export interface AtlasActionPolicy { readonly id: string; readonly tenantId: string; readonly actionCode: string; readonly docClass: string | null; readonly autonomyLevel: AtlasActionAutonomy; readonly minConfidenceForAuto: number | null; readonly requiresHumanConfirmation: boolean; readonly revision: string }
export interface AtlasConfidenceThreshold { readonly id: string; readonly tenantId: string; readonly actionCode: string; readonly docClass: string | null; readonly modelId: string | null; readonly minForSuggest: number; readonly minForAssist: number; readonly minForAuto: number; readonly driftAlertBelow: number | null; readonly driftWindowHours: number; readonly revision: string }
export interface AtlasPolicyInvalidation { publish(input: { readonly tenantId: string; readonly domain: "action_policy" | "confidence_threshold"; readonly revision: string }): Promise<void> }
export interface AtlasPolicyAdministration {
  putActionPolicy(input: { readonly context: VerifiedRequestContext; readonly policy: Omit<AtlasActionPolicy, "id" | "tenantId" | "revision">; readonly expectedRevision?: string }): Promise<AtlasActionPolicy>;
  putConfidenceThreshold(input: { readonly context: VerifiedRequestContext; readonly threshold: Omit<AtlasConfidenceThreshold, "id" | "tenantId" | "revision">; readonly expectedRevision?: string }): Promise<AtlasConfidenceThreshold>;
}

export interface AtlasInferenceEvidence { readonly inferenceId: string; readonly tenantId: string; readonly inferenceType: "action" | "prediction"; readonly modelId: string; readonly modelVersion: string; readonly actionCode?: string; readonly predictionType?: string; readonly confidence?: number; readonly transactionId?: string; readonly correlationId?: string; readonly modelRevision: string; readonly promptRevision: string; readonly policyRevision: string; readonly createdBy: string; readonly createdAt: string }
export interface AtlasFeedbackEvidence { readonly feedbackId: string; readonly tenantId: string; readonly feedbackType: string; readonly targetId?: string; readonly verdict: "correct" | "wrong" | "partial" | "missing"; readonly reasonCode?: string; readonly submittedBy: string; readonly submittedAt: string }
export interface AtlasCalibrationEvidence { readonly calibrationId: string; readonly tenantId: string; readonly calibrationType: string; readonly thresholdBefore?: number; readonly thresholdAfter?: number; readonly trigger: string; readonly metricName?: string; readonly metricValue?: number; readonly sampleCount?: number; readonly modelRevision: string; readonly promptRevision: string; readonly policyRevision: string; readonly createdBy: string; readonly createdAt: string }
export interface AtlasMonitoringLedger { appendInference(input: AtlasInferenceEvidence): Promise<void>; appendFeedback(input: AtlasFeedbackEvidence): Promise<void>; appendCalibration(input: AtlasCalibrationEvidence): Promise<void> }
export interface AtlasDriftBaseline { readonly baselineId: string; readonly tenantId: string; readonly actionCode: string; readonly docClass: string | null; readonly modelId: string; readonly sampleSize: number; readonly meanConfidence: number; readonly stdDevConfidence: number; readonly p5Confidence?: number; readonly p95Confidence?: number; readonly modelRevision: string; readonly promptRevision: string; readonly policyRevision: string; readonly createdBy: string; readonly at: string }
export interface AtlasDriftAlertPublisher { publish(input: { readonly tenantId: string; readonly actionCode: string; readonly modelId: string; readonly metricValue: number; readonly baselineValue: number; readonly sampleCount: number; readonly modelRevision: string; readonly promptRevision: string; readonly policyRevision: string }): Promise<void> }
export interface AtlasCalibrationDashboardItem { readonly calibrationType: string; readonly metricName: string | null; readonly changes: number; readonly sampleCount: number; readonly latestMetricValue: number | null; readonly latestThresholdBefore: number | null; readonly latestThresholdAfter: number | null; readonly latestAt: string }
export interface AtlasDriftDashboardItem { readonly actionCode: string; readonly docClass: string | null; readonly modelId: string; readonly checks: number; readonly alerts: number; readonly latestMetricValue: number | null; readonly latestBaselineValue: number | null; readonly latestSampleCount: number; readonly latestAt: string }
export interface AtlasMonitoringDashboard {
  calibration(input: { readonly context: VerifiedRequestContext; readonly windowHours: number }): Promise<{ readonly windowHours: number; readonly items: readonly AtlasCalibrationDashboardItem[] }>;
  drift(input: { readonly context: VerifiedRequestContext; readonly windowHours: number }): Promise<{ readonly windowHours: number; readonly items: readonly AtlasDriftDashboardItem[] }>;
}
