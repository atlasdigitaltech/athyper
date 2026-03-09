/**
 * Governance Metrics
 *
 * Counters, gauges, and histograms for the governance subsystem:
 *   - Archive lifecycle operations
 *   - Legal hold create/release events
 *   - Purge certificate issuance
 *   - Quota enforcement decisions
 *   - Privacy guard outcomes
 *   - Explainability API usage
 *
 * Follows the AuditMetrics pattern — thin wrapper over MetricsRegistry.
 * All metrics are scraped by Prometheus via the standard /health/metrics endpoint.
 */

import type { MetricsRegistry, MetricLabels, HealthCheckResult } from "@athyper/core";

// ============================================================================
// Metric names
// ============================================================================

const METRIC = {
  // Archive lifecycle
  archiveJobsQueued: "gov_archive_jobs_queued_total",
  archiveJobsCompleted: "gov_archive_jobs_completed_total",
  archiveJobsFailed: "gov_archive_jobs_failed_total",
  archiveJobBacklog: "gov_archive_job_backlog",
  archiveJobDuration: "gov_archive_job_duration_ms",

  // Manifests
  manifestsHeld: "gov_manifests_held",
  manifestsPurgeReady: "gov_manifests_purge_ready",
  manifestsTotal: "gov_manifests_total",

  // Legal holds
  legalHoldCreated: "gov_legal_hold_created_total",
  legalHoldReleased: "gov_legal_hold_released_total",
  legalHoldsActive: "gov_legal_holds_active",
  legalHoldOverlap: "gov_legal_hold_overlap_total",

  // Purge certificates
  purgeCertificateIssued: "gov_purge_certificate_issued_total",
  purgeCertificateVerified: "gov_purge_certificate_verified_total",
  purgeRowsDeleted: "gov_purge_rows_deleted_total",

  // Quota enforcement
  quotaCheckTotal: "gov_quota_check_total",
  quotaCheckDenied: "gov_quota_check_denied_total",
  quotaBreachTotal: "gov_quota_breach_total",
  quotaUtilization: "gov_quota_utilization_pct",
  quotaFailOpen: "gov_quota_fail_open_total",
  quotaFailClosed: "gov_quota_fail_closed_total",

  // Privacy guard
  privacyGuardInspected: "gov_privacy_guard_inspected_total",
  privacyGuardRedacted: "gov_privacy_guard_redacted_total",
  privacyGuardRejected: "gov_privacy_guard_rejected_total",
  privacyGuardWarned: "gov_privacy_guard_warned_total",

  // Explainability
  explainApiCalls: "gov_explain_api_calls_total",
  explainApiErrors: "gov_explain_api_errors_total",
  explainApiLatency: "gov_explain_api_latency_ms",

  // Restore workflow
  restoreRequested: "gov_restore_requested_total",
  restoreApproved: "gov_restore_approved_total",
  restoreRejected: "gov_restore_rejected_total",
  restoreCompleted: "gov_restore_completed_total",
  restoreFailed: "gov_restore_failed_total",
} as const;

// ============================================================================
// GovernanceMetrics
// ============================================================================

export class GovernanceMetrics {
  constructor(private readonly registry: MetricsRegistry) {}

  // -- Archive lifecycle ----------------------------------------------------

  archiveJobQueued(labels: { tenant: string; partition_domain: string }): void {
    this.registry.incrementCounter(METRIC.archiveJobsQueued, 1, labels as MetricLabels);
  }

  archiveJobCompleted(labels: { tenant: string; tier: string }): void {
    this.registry.incrementCounter(METRIC.archiveJobsCompleted, 1, labels as MetricLabels);
  }

  archiveJobFailed(labels: { tenant: string; error: string }): void {
    this.registry.incrementCounter(METRIC.archiveJobsFailed, 1, labels as MetricLabels);
  }

  archiveJobBacklog(depth: number): void {
    this.registry.setGauge(METRIC.archiveJobBacklog, depth);
  }

  archiveJobDuration(durationMs: number, labels: { tenant: string; tier: string }): void {
    this.registry.recordHistogram(METRIC.archiveJobDuration, durationMs, labels as MetricLabels);
  }

  // -- Manifests (gauges) ---------------------------------------------------

  manifestsHeld(count: number): void {
    this.registry.setGauge(METRIC.manifestsHeld, count);
  }

  manifestsPurgeReady(count: number): void {
    this.registry.setGauge(METRIC.manifestsPurgeReady, count);
  }

  manifestsTotal(count: number): void {
    this.registry.setGauge(METRIC.manifestsTotal, count);
  }

  // -- Legal holds ----------------------------------------------------------

  legalHoldCreated(labels: { tenant: string; source: string; scope: string }): void {
    this.registry.incrementCounter(METRIC.legalHoldCreated, 1, labels as MetricLabels);
  }

  legalHoldReleased(labels: { tenant: string; source: string }): void {
    this.registry.incrementCounter(METRIC.legalHoldReleased, 1, labels as MetricLabels);
  }

  legalHoldsActive(count: number): void {
    this.registry.setGauge(METRIC.legalHoldsActive, count);
  }

  legalHoldOverlap(labels: { tenant: string; scope: string }): void {
    this.registry.incrementCounter(METRIC.legalHoldOverlap, 1, labels as MetricLabels);
  }

  // -- Purge certificates ---------------------------------------------------

  purgeCertificateIssued(labels: { tenant: string; method: string }): void {
    this.registry.incrementCounter(METRIC.purgeCertificateIssued, 1, labels as MetricLabels);
  }

  purgeCertificateVerified(labels: { tenant: string }): void {
    this.registry.incrementCounter(METRIC.purgeCertificateVerified, 1, labels as MetricLabels);
  }

  purgeRowsDeleted(count: number, labels: { tenant: string }): void {
    this.registry.incrementCounter(METRIC.purgeRowsDeleted, count, labels as MetricLabels);
  }

  // -- Quota enforcement ----------------------------------------------------

  quotaCheck(labels: { tenant: string; quota_key: string; allowed: string }): void {
    this.registry.incrementCounter(METRIC.quotaCheckTotal, 1, labels as MetricLabels);
  }

  quotaDenied(labels: { tenant: string; quota_key: string; enforcement: string }): void {
    this.registry.incrementCounter(METRIC.quotaCheckDenied, 1, labels as MetricLabels);
  }

  quotaBreach(labels: { tenant: string; quota_key: string }): void {
    this.registry.incrementCounter(METRIC.quotaBreachTotal, 1, labels as MetricLabels);
  }

  quotaUtilization(pct: number, labels: { tenant: string; quota_key: string }): void {
    this.registry.setGauge(METRIC.quotaUtilization, pct, labels as MetricLabels);
  }

  quotaFailOpen(labels: { tenant: string; quota_key: string }): void {
    this.registry.incrementCounter(METRIC.quotaFailOpen, 1, labels as MetricLabels);
  }

  quotaFailClosed(labels: { tenant: string; quota_key: string }): void {
    this.registry.incrementCounter(METRIC.quotaFailClosed, 1, labels as MetricLabels);
  }

  // -- Privacy guard --------------------------------------------------------

  privacyInspected(labels: { tenant: string; mode: string }): void {
    this.registry.incrementCounter(METRIC.privacyGuardInspected, 1, labels as MetricLabels);
  }

  privacyRedacted(labels: { tenant: string; field_count: string }): void {
    this.registry.incrementCounter(METRIC.privacyGuardRedacted, 1, labels as MetricLabels);
  }

  privacyRejected(labels: { tenant: string; violation_count: string }): void {
    this.registry.incrementCounter(METRIC.privacyGuardRejected, 1, labels as MetricLabels);
  }

  privacyWarned(labels: { tenant: string }): void {
    this.registry.incrementCounter(METRIC.privacyGuardWarned, 1, labels as MetricLabels);
  }

  // -- Explainability -------------------------------------------------------

  explainApiCall(labels: { type: string }): void {
    this.registry.incrementCounter(METRIC.explainApiCalls, 1, labels as MetricLabels);
  }

  explainApiError(labels: { type: string; error: string }): void {
    this.registry.incrementCounter(METRIC.explainApiErrors, 1, labels as MetricLabels);
  }

  explainApiLatency(durationMs: number, labels: { type: string }): void {
    this.registry.recordHistogram(METRIC.explainApiLatency, durationMs, labels as MetricLabels);
  }

  // -- Restore workflow -----------------------------------------------------

  restoreRequested(labels: { tenant: string }): void {
    this.registry.incrementCounter(METRIC.restoreRequested, 1, labels as MetricLabels);
  }

  restoreApproved(labels: { tenant: string }): void {
    this.registry.incrementCounter(METRIC.restoreApproved, 1, labels as MetricLabels);
  }

  restoreRejected(labels: { tenant: string }): void {
    this.registry.incrementCounter(METRIC.restoreRejected, 1, labels as MetricLabels);
  }

  restoreCompleted(labels: { tenant: string }): void {
    this.registry.incrementCounter(METRIC.restoreCompleted, 1, labels as MetricLabels);
  }

  restoreFailed(labels: { tenant: string; error: string }): void {
    this.registry.incrementCounter(METRIC.restoreFailed, 1, labels as MetricLabels);
  }
}

// ============================================================================
// Health check factory
// ============================================================================

/**
 * Create a governance subsystem health checker.
 *
 * Health thresholds:
 *   - Archive backlog  <  50  → healthy
 *   - Archive backlog  < 200  → degraded
 *   - Archive backlog  >= 200 → unhealthy
 *   - Held manifests   > 50   → degraded (large hold surface)
 *   - Active holds     > 0    → informational (not degraded, but notable)
 */
export function createGovernanceHealthChecker(deps: {
  getArchiveBacklog: () => Promise<number>;
  getHeldManifestCount: () => Promise<number>;
  getActiveHoldCount: () => Promise<number>;
  getQuotaBreachCount: () => Promise<number>;
}): () => Promise<HealthCheckResult> {
  return async (): Promise<HealthCheckResult> => {
    try {
      const [backlog, heldManifests, activeHolds, quotaBreaches] = await Promise.all([
        deps.getArchiveBacklog(),
        deps.getHeldManifestCount(),
        deps.getActiveHoldCount(),
        deps.getQuotaBreachCount(),
      ]);

      let status: "healthy" | "degraded" | "unhealthy" = "healthy";
      const details: Record<string, unknown> = {
        archiveBacklog: backlog,
        heldManifests,
        activeHolds,
        quotaBreaches,
      };

      if (backlog >= 200) {
        status = "unhealthy";
      } else if (backlog >= 50 || heldManifests > 50 || quotaBreaches > 0) {
        status = "degraded";
      }

      return {
        status,
        message: `Archive backlog: ${backlog}, held: ${heldManifests}, holds: ${activeHolds}, quota breaches: ${quotaBreaches}`,
        details,
        timestamp: new Date(),
      };
    } catch (err) {
      return {
        status: "unhealthy",
        message: err instanceof Error ? err.message : "Governance health check failed",
        timestamp: new Date(),
      };
    }
  };
}
