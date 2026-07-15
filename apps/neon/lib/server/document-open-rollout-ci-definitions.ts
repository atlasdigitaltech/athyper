import type { DocumentOpenProgressMetricName } from "@/lib/server/document-open-rollout-gates";
import { DOCUMENT_OPEN_PROGRESS_METRIC_NAMES, DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS } from "@/lib/server/document-open-rollout-gates";

export interface DocumentOpenCiGateDefinition {
  name: string;
  metricName: DocumentOpenProgressMetricName;
  target: number;
  higherIsBetter: boolean;
}

export const DOCUMENT_OPEN_CI_GATE_DEFINITIONS: readonly DocumentOpenCiGateDefinition[] = [
  {
    name: "open-warm-p95-ms",
    metricName: DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.warmOpenP95Ms,
    target: DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS.warmOpenP95Ms,
    higherIsBetter: false,
  },
  {
    name: "open-warm-p50-ms",
    metricName: DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.openWarmP50Ms,
    target: DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS.openWarmP50Ms,
    higherIsBetter: false,
  },
  {
    name: "open-cold-p95-ms",
    metricName: DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.coldOpenP95Ms,
    target: DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS.coldOpenP95Ms,
    higherIsBetter: false,
  },
  {
    name: "first-editable-form-p95-ms",
    metricName: DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.firstEditableFormP95Ms,
    target: DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS.firstEditableFormP95Ms,
    higherIsBetter: false,
  },
  {
    name: "first-editable-form-p50-ms",
    metricName: DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.firstEditableFormP50Ms,
    target: DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS.firstEditableFormP50Ms,
    higherIsBetter: false,
  },
  {
    name: "initiate-warm-p50-ms",
    metricName: DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.warmInitiateP50Ms,
    target: DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS.warmInitiateP50Ms,
    higherIsBetter: false,
  },
  {
    name: "initiate-warm-p95-ms",
    metricName: DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.warmInitiateP95Ms,
    target: DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS.warmInitiateP95Ms,
    higherIsBetter: false,
  },
  {
    name: "initiate-cold-p95-ms",
    metricName: DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.coldInitiateP95Ms,
    target: DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS.coldInitiateP95Ms,
    higherIsBetter: false,
  },
  {
    name: "session-p50-ms",
    metricName: DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.sessionP50Ms,
    target: DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS.sessionP50Ms,
    higherIsBetter: false,
  },
  {
    name: "session-p95-ms",
    metricName: DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.sessionP95Ms,
    target: DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS.sessionP95Ms,
    higherIsBetter: false,
  },
  {
    name: "sse-connected-p95-ms",
    metricName: DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.sseConnectedP95Ms,
    target: DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS.sseConnectedP95Ms,
    higherIsBetter: false,
  },
  {
    name: "open-rules-projection-count",
    metricName: DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.openRulesProjectionCount,
    target: DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS.openRulesProjectionCount,
    higherIsBetter: false,
  },
  {
    name: "open-child-compiled-projection-count",
    metricName: DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.openChildCompiledProjectionCount,
    target: DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS.openChildCompiledProjectionCount,
    higherIsBetter: false,
  },
  {
    name: "open-compatibility-fallback-count",
    metricName: DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.openCompatibilityFallbackCount,
    target: DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS.openCompatibilityFallbackCount,
    higherIsBetter: false,
  },
  {
    name: "open-permission-mismatch-count",
    metricName: DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.openPermissionMismatchCount,
    target: DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS.openPermissionMismatchCount,
    higherIsBetter: false,
  },
  {
    name: "open-missing-field-mask-count",
    metricName: DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.openMissingFieldMaskCount,
    target: DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS.openMissingFieldMaskCount,
    higherIsBetter: false,
  },
  {
    name: "open-stale-rules-count",
    metricName: DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.openStaleRulesCount,
    target: DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS.openStaleRulesCount,
    higherIsBetter: false,
  },
  {
    name: "open-incorrect-child-capability-count",
    metricName: DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.openIncorrectChildCapabilityCount,
    target: DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS.openIncorrectChildCapabilityCount,
    higherIsBetter: false,
  },
  {
    name: "open-section-timeout-rate",
    metricName: DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.openSectionTimeoutRate,
    target: DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS.openSectionTimeoutRate,
    higherIsBetter: false,
  },
  {
    name: "open-section-degraded-rate",
    metricName: DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.openSectionDegradedRate,
    target: DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS.openSectionDegradedRate,
    higherIsBetter: false,
  },
  {
    name: "save-validation-failure-count",
    metricName: DOCUMENT_OPEN_PROGRESS_METRIC_NAMES.saveValidationFailureCount,
    target: DOCUMENT_OPEN_ROLLOUT_GATE_TARGETS.saveValidationFailureCount,
    higherIsBetter: false,
  },
] as const;
