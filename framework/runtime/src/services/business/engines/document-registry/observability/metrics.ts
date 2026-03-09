/**
 * Document Registry Metrics
 *
 * Counters, gauges, and histograms for the financial document registry:
 *   - Trigger sync operations (success/failure)
 *   - Compliance view hit counts
 *   - Multi-book bridge completeness
 *   - Status mapping failures
 *   - Delete guard violations
 *   - Query latency
 *
 * Follows the GovernanceMetrics pattern — thin wrapper over MetricsRegistry.
 * All metrics are scraped by Prometheus via the standard /health/metrics endpoint.
 */

import type { MetricsRegistry, MetricLabels, HealthCheckResult } from "@athyper/core";

// ============================================================================
// Metric names
// ============================================================================

const METRIC = {
  // Trigger sync
  triggerSyncTotal: "fin_doc_registry_trigger_sync_total",
  triggerSyncFailed: "fin_doc_registry_trigger_sync_failed_total",
  triggerSyncLatency: "fin_doc_registry_trigger_sync_latency_ms",

  // Status mapping
  statusMappingFallback: "fin_doc_registry_status_mapping_fallback_total",

  // Delete guard
  deleteGuardBlocked: "fin_doc_registry_delete_guard_blocked_total",
  deleteGuardAllowed: "fin_doc_registry_delete_guard_allowed_total",

  // Multi-book bridge
  bridgePostingTotal: "fin_doc_registry_bridge_posting_total",
  bridgeIncomplete: "fin_doc_registry_bridge_incomplete",

  // Compliance views
  compliancePostingInconsistency: "fin_doc_registry_compliance_posting_inconsistency",
  complianceApprovedNotPosted: "fin_doc_registry_compliance_approved_not_posted",
  compliancePostedWithoutApproval: "fin_doc_registry_compliance_posted_without_approval",
  complianceClosedPeriodViolation: "fin_doc_registry_compliance_closed_period_violation",
  complianceEntityMismatch: "fin_doc_registry_compliance_entity_mismatch",
  complianceApprovedWithoutScoring: "fin_doc_registry_compliance_approved_without_scoring",

  // Query performance
  queryLatency: "fin_doc_registry_query_latency_ms",
  queryTotal: "fin_doc_registry_query_total",

  // Registry size
  registryDocuments: "fin_doc_registry_documents",
} as const;

// ============================================================================
// DocumentRegistryMetrics
// ============================================================================

export class DocumentRegistryMetrics {
  constructor(private readonly registry: MetricsRegistry) {}

  // -- Trigger sync -----------------------------------------------------------

  triggerSyncSuccess(labels: { tenant: string; doc_type: string }): void {
    this.registry.incrementCounter(METRIC.triggerSyncTotal, 1, labels as MetricLabels);
  }

  triggerSyncFailure(labels: { tenant: string; doc_type: string; error: string }): void {
    this.registry.incrementCounter(METRIC.triggerSyncFailed, 1, labels as MetricLabels);
  }

  triggerSyncLatency(durationMs: number, labels: { doc_type: string }): void {
    this.registry.recordHistogram(METRIC.triggerSyncLatency, durationMs, labels as MetricLabels);
  }

  // -- Status mapping ---------------------------------------------------------

  statusMappingFallback(labels: { doc_type: string; source_status: string }): void {
    this.registry.incrementCounter(METRIC.statusMappingFallback, 1, labels as MetricLabels);
  }

  // -- Delete guard -----------------------------------------------------------

  deleteGuardBlocked(labels: { tenant: string; status: string }): void {
    this.registry.incrementCounter(METRIC.deleteGuardBlocked, 1, labels as MetricLabels);
  }

  deleteGuardAllowed(labels: { tenant: string }): void {
    this.registry.incrementCounter(METRIC.deleteGuardAllowed, 1, labels as MetricLabels);
  }

  // -- Multi-book bridge ------------------------------------------------------

  bridgePostingRecorded(labels: { tenant: string; book_code: string }): void {
    this.registry.incrementCounter(METRIC.bridgePostingTotal, 1, labels as MetricLabels);
  }

  bridgeIncompleteCount(count: number): void {
    this.registry.setGauge(METRIC.bridgeIncomplete, count);
  }

  // -- Compliance gauges (set by periodic scan) -------------------------------

  compliancePostingInconsistency(count: number, labels: { entity_code: string }): void {
    this.registry.setGauge(METRIC.compliancePostingInconsistency, count, labels as MetricLabels);
  }

  complianceApprovedNotPosted(count: number, labels: { entity_code: string }): void {
    this.registry.setGauge(METRIC.complianceApprovedNotPosted, count, labels as MetricLabels);
  }

  compliancePostedWithoutApproval(count: number, labels: { entity_code: string }): void {
    this.registry.setGauge(METRIC.compliancePostedWithoutApproval, count, labels as MetricLabels);
  }

  complianceClosedPeriodViolation(count: number, labels: { entity_code: string }): void {
    this.registry.setGauge(METRIC.complianceClosedPeriodViolation, count, labels as MetricLabels);
  }

  complianceEntityMismatch(count: number): void {
    this.registry.setGauge(METRIC.complianceEntityMismatch, count);
  }

  complianceApprovedWithoutScoring(count: number, labels: { entity_code: string }): void {
    this.registry.setGauge(METRIC.complianceApprovedWithoutScoring, count, labels as MetricLabels);
  }

  // -- Query performance ------------------------------------------------------

  queryExecuted(labels: { operation: string }): void {
    this.registry.incrementCounter(METRIC.queryTotal, 1, labels as MetricLabels);
  }

  queryLatency(durationMs: number, labels: { operation: string }): void {
    this.registry.recordHistogram(METRIC.queryLatency, durationMs, labels as MetricLabels);
  }

  // -- Registry size ----------------------------------------------------------

  registryDocuments(count: number, labels: { entity_code: string }): void {
    this.registry.setGauge(METRIC.registryDocuments, count, labels as MetricLabels);
  }
}

// ============================================================================
// Health check factory
// ============================================================================

/**
 * Create a document registry health checker.
 *
 * Health thresholds:
 *   - Posting inconsistencies  >= 50  → degraded
 *   - Posting inconsistencies  >= 200 → unhealthy
 *   - Bridge incomplete        >= 10  → degraded
 *   - Approved without scoring >= 100 → degraded
 */
export function createDocumentRegistryHealthChecker(deps: {
  getPostingInconsistencyCount: () => Promise<number>;
  getBridgeIncompleteCount: () => Promise<number>;
  getApprovedWithoutScoringCount: () => Promise<number>;
}): () => Promise<HealthCheckResult> {
  return async (): Promise<HealthCheckResult> => {
    try {
      const [inconsistencies, bridgeIncomplete, noScoring] = await Promise.all([
        deps.getPostingInconsistencyCount(),
        deps.getBridgeIncompleteCount(),
        deps.getApprovedWithoutScoringCount(),
      ]);

      let status: "healthy" | "degraded" | "unhealthy" = "healthy";
      const details: Record<string, unknown> = {
        postingInconsistencies: inconsistencies,
        bridgeIncomplete,
        approvedWithoutScoring: noScoring,
      };

      if (inconsistencies >= 200) {
        status = "unhealthy";
      } else if (inconsistencies >= 50 || bridgeIncomplete >= 10 || noScoring >= 100) {
        status = "degraded";
      }

      return {
        status,
        message: `Posting inconsistencies: ${inconsistencies}, bridge incomplete: ${bridgeIncomplete}, no scoring: ${noScoring}`,
        details,
        timestamp: new Date(),
      };
    } catch (err) {
      return {
        status: "unhealthy",
        message: err instanceof Error ? err.message : "Document registry health check failed",
        timestamp: new Date(),
      };
    }
  };
}
