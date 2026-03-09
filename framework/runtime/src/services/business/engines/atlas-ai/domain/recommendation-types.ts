// framework/runtime/src/services/business/engines/atlas-ai/domain/recommendation-types.ts
//
// Atlas Phase 4 — Recommended Actions domain types.
//
// Atlas recommendations are deterministic, advisory, evidence-backed
// suggestions computed from anomalies, predictions, risk signals,
// and close progress. They are ephemeral (computed on-demand, not
// persisted) and NEVER auto-execute workflow state changes.
//
// Distinct from the close-recommendation-engine in the posting-engine
// which handles operational workflow automation (start tasks, rerun
// handlers, escalate signals). Atlas recommendations are intelligence-
// driven advice: "what should we investigate / resolve / escalate?"

// ---------------------------------------------------------------------------
// Recommendation types
// ---------------------------------------------------------------------------

export type AtlasRecommendationType =
  | "ANOMALY_RESPONSE"          // investigate / resolve / escalate an anomaly
  | "RELEASE_GATE"              // action needed before a gate can clear
  | "RECON_FOLLOWUP"            // reconciliation action needed
  | "CLOSE_DURATION"            // close timeline concern
  | "RISK_MITIGATION";          // general risk reduction advice

export type AtlasRecommendationPriority =
  | "CRITICAL"                  // blocks release, immediate action required
  | "HIGH"                      // should be resolved before close
  | "MEDIUM"                    // recommended but not blocking
  | "LOW";                      // advisory, can be deferred

export type AtlasOwnerRole =
  | "CONTROLLER"
  | "ACCOUNTANT"
  | "CLOSE_MANAGER"
  | "CFO"
  | "RECONCILIATION_ANALYST";

// ---------------------------------------------------------------------------
// Linked evidence — what data backs this recommendation
// ---------------------------------------------------------------------------

export interface AtlasLinkedEvidence {
  /** Type of evidence (anomaly, risk signal, prediction, recon session, etc.) */
  evidenceType: "anomaly" | "risk_signal" | "prediction" | "recon_session" | "close_task" | "gl_consistency";
  /** Human label */
  label: string;
  /** Reference ID (anomaly UUID, signal UUID, etc.) — null for computed evidence */
  referenceId: string | null;
  /** Additional context (z-score, severity, account code, etc.) */
  detail: string | null;
}

// ---------------------------------------------------------------------------
// Recommendation output
// ---------------------------------------------------------------------------

export interface AtlasRecommendation {
  /** Unique key for deduplication (deterministic from inputs) */
  key: string;
  type: AtlasRecommendationType;
  priority: AtlasRecommendationPriority;
  /** Human-readable recommendation text */
  title: string;
  /** Why this recommendation was generated */
  rationale: string;
  /** Who should act on this */
  suggestedOwnerRole: AtlasOwnerRole;
  /** Evidence backing the recommendation */
  linkedEvidence: AtlasLinkedEvidence[];
  /** Estimated impact if unresolved (human-readable) */
  estimatedImpact: string | null;
}

// ---------------------------------------------------------------------------
// Recommendation provenance — mirrors NarrativeProvenance pattern
// ---------------------------------------------------------------------------

export interface RecommendationProvenance {
  /** Generator identifier */
  generator: "atlas.recommendation.deterministic";
  /** Semver for the rule engine — bump when rules change behavior */
  generatorVersion: string;
  /** Always true — recommendations are rule-based, not ML */
  deterministic: true;
  /** Total number of linked evidence items across all recommendations */
  evidenceCount: number;
  /** Flat list of evidence identifiers for drilldown / explainability */
  evidenceKeys: string[];
  /** Deterministic fingerprint of the recommendation set (type+key+entity+period) */
  recommendationHash: string;
  /** ISO-8601 timestamp */
  generatedAt: string;
}

/** Current rule engine version — bump on rule behavior changes */
export const RECOMMENDATION_ENGINE_VERSION = "1.0.0";

/** Build a flat evidence key from a recommendation */
function buildEvidenceKey(rec: AtlasRecommendation, ev: AtlasLinkedEvidence): string {
  const ref = ev.referenceId ?? rec.key;
  return `${ev.evidenceType.toUpperCase()}:${ref}`;
}

/**
 * Simple deterministic string hash (djb2).
 * Not cryptographic — used for stability fingerprinting only.
 */
function djb2Hash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Build provenance from a recommendation set */
export function buildRecommendationProvenance(
  recommendations: AtlasRecommendation[],
  context?: { entityCode?: string; fiscalYear?: number; periodNumber?: number },
): RecommendationProvenance {
  // Evidence keys — deduplicated, sorted for stability
  const evidenceKeys = Array.from(new Set(
    recommendations.flatMap(r => r.linkedEvidence.map(ev => buildEvidenceKey(r, ev))),
  )).sort();

  // Recommendation hash — deterministic fingerprint from sorted rec keys + context
  const hashInput = [
    context?.entityCode ?? "",
    String(context?.fiscalYear ?? ""),
    String(context?.periodNumber ?? ""),
    ...recommendations.map(r => `${r.type}:${r.key}`).sort(),
  ].join("|");

  return {
    generator: "atlas.recommendation.deterministic",
    generatorVersion: RECOMMENDATION_ENGINE_VERSION,
    deterministic: true,
    evidenceCount: recommendations.reduce((n, r) => n + r.linkedEvidence.length, 0),
    evidenceKeys,
    recommendationHash: djb2Hash(hashInput),
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Recommendation compute input (reuses NarrativeInput shape)
// ---------------------------------------------------------------------------

export interface RecommendationComputeInput {
  tenantId: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

export interface RecommendationComputeResult {
  recommendations: AtlasRecommendation[];
  provenance: RecommendationProvenance;
  computedAt: string;
}
