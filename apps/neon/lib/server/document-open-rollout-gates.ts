import type { DocumentOpenRolloutStage } from "@/lib/server/document-runtime-feature-flags";

export const DOCUMENT_OPEN_PROGRESS_METRIC_NAMES = {
  warmOpenP95Ms: "open_warm_p95_ms",
  coldOpenP95Ms: "open_cold_p95_ms",
  firstEditableFormP95Ms: "first_editable_form_p95_ms",
  warmInitiateP95Ms: "initiate_warm_p95_ms",
  coldInitiateP95Ms: "initiate_cold_p95_ms",
  sessionP95Ms: "session_p95_ms",
  sseConnectedP95Ms: "sse_connected_p95_ms",
  openRulesProjectionCount: "open_rules_projection_count",
  openChildCompiledProjectionCount: "open_child_compiled_projection_count",
  openCompatibilityFallbackCount: "open_compatibility_fallback_count",
  openPermissionMismatchCount: "open_permission_mismatch_count",
  openMissingFieldMaskCount: "open_missing_field_mask_count",
  openStaleRulesCount: "open_stale_rules_count",
  openIncorrectChildCapabilityCount: "open_incorrect_child_capability_count",
  openSectionTimeoutRate: "open_section_timeout_rate",
  openSectionDegradedRate: "open_section_degraded_rate",
  saveValidationFailureCount: "save_validation_failure_count",
  openWarmP50Ms: "open_warm_p50_ms",
  firstEditableFormP50Ms: "first_editable_form_p50_ms",
  warmInitiateP50Ms: "initiate_warm_p50_ms",
  sessionP50Ms: "session_p50_ms",
} as const;

export type DocumentOpenProgressMetricName = (typeof DOCUMENT_OPEN_PROGRESS_METRIC_NAMES)[keyof typeof DOCUMENT_OPEN_PROGRESS_METRIC_NAMES];

export const DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS = {
  openWarmP50Ms: 700,
  warmOpenP95Ms: 1_500,
  coldOpenP95Ms: 2_500,
  firstEditableFormP50Ms: 1_500,
  firstEditableFormP95Ms: 3_000,
  warmInitiateP50Ms: 400,
  warmInitiateP95Ms: 800,
  coldInitiateP95Ms: 1_500,
  sessionP50Ms: 100,
  sessionP95Ms: 300,
  sseConnectedP95Ms: 500,
  openRulesProjectionCount: 0,
  openChildCompiledProjectionCount: 0,
  openCompatibilityFallbackCount: 0,
  openPermissionMismatchCount: 0,
  openMissingFieldMaskCount: 0,
  openStaleRulesCount: 0,
  openIncorrectChildCapabilityCount: 0,
  openSectionTimeoutRate: 0,
  openSectionDegradedRate: 0,
  saveValidationFailureCount: 0,
};

export type DocumentOpenRolloutGateTargetName = keyof typeof DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS;

export interface DocumentOpenProgressSnapshot {
  metrics: Partial<Record<DocumentOpenProgressMetricName, number>>;
  minimumSamples?: number;
}

export interface DocumentOpenRolloutDecision {
  action: "advance" | "rollback" | "hold";
  nextStage: DocumentOpenRolloutStage;
  reasons: string[];
}

const STAGES: DocumentOpenRolloutStage[] = ["off", "rules_internal", "child_internal", "descriptor_5", "descriptor_25", "full"];
const REQUIRED_MIN_SAMPLES = 500;
const HOLD_ONLY_GATE_TARGETS: ReadonlySet<DocumentOpenRolloutGateTargetName> = new Set([
  "openCompatibilityFallbackCount",
]);

export function resolveNextDocumentOpenRolloutStage(
  currentStage: DocumentOpenRolloutStage,
  snapshot: DocumentOpenProgressSnapshot,
): DocumentOpenRolloutDecision {
  const sampleSize = snapshot.minimumSamples ?? 0;
  const reasons: string[] = [];

  for (const [key, target] of Object.entries(DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS) as Array<[DocumentOpenRolloutGateTargetName, number]>) {
    if (HOLD_ONLY_GATE_TARGETS.has(key)) continue;

    const metricName = DOCUMENT_OPEN_PROGRESS_METRIC_NAMES[key];
    const value = snapshot.metrics[metricName];
    if (typeof value === "number" && value > target) {
      reasons.push(`target_breach:${key}:${value}`);
    }
  }

  const hasFallback = (snapshot.metrics[DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.openCompatibilityFallbackCount] ?? 0) > 0;
  if (hasFallback) reasons.push("compatibility_fallback");

  if (sampleSize < REQUIRED_MIN_SAMPLES && reasons.length === 0) {
    reasons.push(`insufficient_samples:${sampleSize}/${REQUIRED_MIN_SAMPLES}`);
  }

  if (reasons.length > 0) {
    const severe = reasons.some((value) => value.startsWith("target_breach:"));
    return {
      action: severe ? "rollback" : "hold",
      nextStage: currentStage,
      reasons,
    };
  }

  const index = STAGES.indexOf(currentStage);
  if (index < 0 || index >= STAGES.length - 1) {
    return { action: "hold", nextStage: currentStage, reasons: [] };
  }

  const nextStage = STAGES[index + 1];
  if (!nextStage) return { action: "hold", nextStage: currentStage, reasons: [] };
  return { action: "advance", nextStage, reasons: [] };
}

export function isRolloutGateKey(name: string): name is DocumentOpenProgressMetricName {
  return Object.values(DOCUMENT_OPEN_PROGRESS_METRIC_NAMES).includes(name as DocumentOpenProgressMetricName);
}

export function parseDocumentOpenRolloutStage(name: string): DocumentOpenRolloutStage | null {
  const candidate = STAGES.includes(name as DocumentOpenRolloutStage);
  return candidate ? (name as DocumentOpenRolloutStage) : null;
}

export function buildRolloutProgressBucket(identity: string): number {
  let hash = 2166136261;
  for (const character of identity) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}
