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
