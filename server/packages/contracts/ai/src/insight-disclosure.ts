import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { AtlasEvaluationState, AtlasInsightScope, AtlasInsightCoverage, AtlasInsightEvidence, AtlasInsightFinding, AtlasInsightAction } from "./insights.js";

/** Internal only. A claim is an owner-registered disclosure permission, not browser metadata. */
export interface AtlasDisclosureCandidate<T> {
  readonly state: AtlasEvaluationState;
  readonly claims: readonly string[];
  readonly value: T;
}
export interface AtlasInsightDisclosurePolicy {
  authorize(input: {
    readonly context: VerifiedRequestContext;
    readonly claim: string;
  }): Promise<boolean>;
  actionRegistered(actionId: string): boolean;
}
export interface AtlasInsightOwnerProjection {
  /** Broader protected-input evaluations are deliberately unsupported in v1. */
  readonly evaluationMode: "user_scoped";
  readonly scope: AtlasDisclosureCandidate<AtlasInsightScope>;
  readonly coverage: AtlasDisclosureCandidate<AtlasInsightCoverage>;
  readonly evaluatedAt: string;
  readonly freshness: "current" | "stale";
  readonly evidence: readonly AtlasDisclosureCandidate<AtlasInsightEvidence>[];
  readonly findings: readonly AtlasDisclosureCandidate<AtlasInsightFinding>[];
  readonly actions: readonly AtlasDisclosureCandidate<AtlasInsightAction>[];
}

/** Narrow master-data owner port; no BP360 envelopes enter the AI runtime. */
export interface AtlasBusinessPartnerInsightRequest {
  readonly context: VerifiedRequestContext;
  readonly recordId: string;
  readonly role?: "supplier" | "customer";
  readonly operatingOrganizationId?: string;
  readonly companyCodeId?: string;
  readonly operation?: "order" | "invoice" | "payment";
  readonly businessDate?: string;
  readonly kind: "brief" | "readiness" | "eligibility";
}
export interface AtlasBusinessPartnerInsightOwner {
  read(input: AtlasBusinessPartnerInsightRequest): Promise<AtlasInsightOwnerProjection>;
  readContacts?(input: {readonly context: VerifiedRequestContext; readonly recordId: string}): Promise<AtlasBusinessPartnerContacts>;
  readAddresses?(input: {readonly context: VerifiedRequestContext; readonly recordId: string}): Promise<AtlasBusinessPartnerAddresses>;

}

/** Bounded, owner-authorized saved address projection; no raw section DTO. */
export interface AtlasBusinessPartnerAddresses {
  readonly recordId: string;
  readonly status: "ready" | "empty" | "unavailable";
  readonly unavailableReason?: "missing_scope" | "denied" | "reader_unavailable";
 readonly addresses: readonly Readonly<Record<string, string | boolean>>[];
  readonly hasMore: boolean;
}

export interface AtlasBusinessPartnerContacts {
 readonly recordId: string;
 readonly status: "ready" | "empty" | "unavailable";
 readonly unavailableReason?: "missing_scope" | "denied" | "reader_unavailable";
 readonly contacts: readonly Readonly<Record<string, string | boolean>>[];
 readonly hasMore: boolean;
}
