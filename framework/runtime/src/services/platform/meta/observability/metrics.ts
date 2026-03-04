/**
 * META Engine Metrics
 *
 * Thin wrapper over the platform MetricsRegistry that exposes
 * META-specific counters, histograms, and gauges.
 *
 * Follows the same pattern as AuditMetrics and NotificationMetrics.
 */

import type { MetricsRegistry, MetricLabels } from "@athyper/core";

// ============================================================================
// Metric names (constants to prevent typos)
// ============================================================================

const METRIC = {
  // Compilation
  compilationLatency: "meta_compilation_latency_ms",
  compilationTotal: "meta_compilation_total",
  cacheHits: "meta_cache_hits_total",
  cacheMisses: "meta_cache_misses_total",
  cacheHitRatio: "meta_cache_hit_ratio",

  // Validation
  ruleExecutionTime: "meta_rule_execution_time_ms",
  validationTotal: "meta_validation_total",
  validationFailures: "meta_validation_failures_total",

  // Policy
  policyEvalLatency: "meta_policy_eval_latency_ms",
  policyEvalTotal: "meta_policy_eval_total",
  policyDenied: "meta_policy_denied_total",

  // Lifecycle
  transitionLatency: "meta_transition_latency_ms",
  transitionTotal: "meta_transition_total",
  transitionFailed: "meta_transition_failed_total",

  // Data API
  dataOpLatency: "meta_data_op_latency_ms",
  dataOpTotal: "meta_data_op_total",

  // Overlay
  overlayConflicts: "meta_overlay_conflicts_total",

  // Cascade Delete
  cascadeDeleteDepth: "meta_cascade_delete_depth",
  cascadeDeleteTotal: "meta_cascade_delete_total",

  // Approval
  approvalResolutionLatency: "meta_approval_resolution_latency_ms",
} as const;

// ============================================================================
// MetaMetrics
// ============================================================================

export class MetaMetrics {
  constructor(private readonly registry: MetricsRegistry) {}

  // ── Compilation ──────────────────────────────────────────────────

  /** Record schema compilation latency in milliseconds. */
  compilationLatency(durationMs: number, labels: { entity: string }): void {
    this.registry.recordHistogram(METRIC.compilationLatency, durationMs, labels as MetricLabels);
    this.registry.incrementCounter(METRIC.compilationTotal, 1, labels as MetricLabels);
  }

  /** Record a compilation cache hit. */
  cacheHit(labels: { entity: string }): void {
    this.registry.incrementCounter(METRIC.cacheHits, 1, labels as MetricLabels);
  }

  /** Record a compilation cache miss. */
  cacheMiss(labels: { entity: string }): void {
    this.registry.incrementCounter(METRIC.cacheMisses, 1, labels as MetricLabels);
  }

  /** Update the cache hit ratio gauge (hits / (hits + misses)). */
  updateCacheHitRatio(ratio: number): void {
    this.registry.setGauge(METRIC.cacheHitRatio, ratio);
  }

  // ── Validation ───────────────────────────────────────────────────

  /** Record validation rule execution time in milliseconds. */
  ruleExecutionTime(durationMs: number, labels: { entity: string }): void {
    this.registry.recordHistogram(METRIC.ruleExecutionTime, durationMs, labels as MetricLabels);
    this.registry.incrementCounter(METRIC.validationTotal, 1, labels as MetricLabels);
  }

  /** Record a validation failure (by entity and rule kind). */
  validationFailure(labels: { entity: string; rule_kind: string; severity: string }): void {
    this.registry.incrementCounter(METRIC.validationFailures, 1, labels as MetricLabels);
  }

  // ── Policy ───────────────────────────────────────────────────────

  /** Record policy evaluation latency in milliseconds. */
  policyEvalLatency(durationMs: number, labels: { entity: string; action: string }): void {
    this.registry.recordHistogram(METRIC.policyEvalLatency, durationMs, labels as MetricLabels);
    this.registry.incrementCounter(METRIC.policyEvalTotal, 1, labels as MetricLabels);
  }

  /** Record a policy denial. */
  policyDenied(labels: { entity: string; action: string }): void {
    this.registry.incrementCounter(METRIC.policyDenied, 1, labels as MetricLabels);
  }

  // ── Lifecycle ────────────────────────────────────────────────────

  /** Record lifecycle transition latency in milliseconds. */
  transitionLatency(durationMs: number, labels: { entity: string; operation: string }): void {
    this.registry.recordHistogram(METRIC.transitionLatency, durationMs, labels as MetricLabels);
    this.registry.incrementCounter(METRIC.transitionTotal, 1, labels as MetricLabels);
  }

  /** Record a failed lifecycle transition. */
  transitionFailed(labels: { entity: string; operation: string; reason: string }): void {
    this.registry.incrementCounter(METRIC.transitionFailed, 1, labels as MetricLabels);
  }

  // ── Data API ─────────────────────────────────────────────────────

  /** Record data API operation latency in milliseconds. */
  dataOpLatency(durationMs: number, labels: { entity: string; operation: string }): void {
    this.registry.recordHistogram(METRIC.dataOpLatency, durationMs, labels as MetricLabels);
    this.registry.incrementCounter(METRIC.dataOpTotal, 1, labels as MetricLabels);
  }

  // ── Overlay ──────────────────────────────────────────────────────

  /** Record an overlay merge conflict. */
  overlayConflict(labels: { entity: string; conflict_mode: string }): void {
    this.registry.incrementCounter(METRIC.overlayConflicts, 1, labels as MetricLabels);
  }

  // ── Cascade Delete ───────────────────────────────────────────────

  /** Record cascade delete depth (how deep the recursion went). */
  cascadeDeleteDepth(depth: number, labels: { entity: string }): void {
    this.registry.recordHistogram(METRIC.cascadeDeleteDepth, depth, labels as MetricLabels);
    this.registry.incrementCounter(METRIC.cascadeDeleteTotal, 1, labels as MetricLabels);
  }

  // ── Approval ─────────────────────────────────────────────────────

  /** Record approver resolution latency in milliseconds. */
  approvalResolutionLatency(durationMs: number, labels: { strategy: string }): void {
    this.registry.recordHistogram(METRIC.approvalResolutionLatency, durationMs, labels as MetricLabels);
  }
}
