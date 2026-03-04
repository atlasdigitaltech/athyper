/**
 * Audit Metrics
 *
 * Thin wrapper over the platform MetricsRegistry that exposes
 * audit-specific counters, histograms, and gauges.
 *
 * Also provides the health-check factory for the audit pipeline.
 */

import type { ResilientAuditWriter } from "../domain/resilient-audit-writer.js";
import type { AuditDlqRepo } from "../persistence/AuditDlqRepo.js";
import type { AuditOutboxRepo } from "../persistence/AuditOutboxRepo.js";
import type {
  MetricsRegistry,
  MetricLabels,
  HealthCheckResult,
} from "@athyper/core";

// ============================================================================
// Metric names (constants to prevent typos)
// ============================================================================

const METRIC = {
  eventsIngested: "audit_events_ingested_total",
  eventsPersisted: "audit_events_persisted_total",
  eventsDropped: "audit_events_dropped_total",
  eventsBuffered: "audit_events_buffered_total",
  outboxLag: "audit_outbox_lag",
  outboxDead: "audit_outbox_dead",
  insertLatency: "audit_insert_latency_ms",
  hashChainVerified: "audit_hash_chain_verified_total",
  hashChainDiscontinuity: "audit_hash_chain_discontinuity_total",
  queryExecuted: "audit_query_executed_total",
  memoryBufferDepth: "audit_memory_buffer_depth",
  dlqDepth: "audit_dlq_depth",
  outboxLagSeconds: "audit_outbox_lag_seconds",
  // Phase 5
  eventsLoadShed: "audit_events_load_shed_total",
  querySlowDetected: "audit_query_slow_total",
  timelineQueryLatency: "audit_timeline_query_latency_ms",
  integrityVerificationRun: "audit_integrity_verification_run_total",
  integrityVerificationDuration: "audit_integrity_verification_duration_ms",
  partitionArchived: "audit_partition_archived_total",
  coldQueryBlocked: "audit_cold_query_blocked_total",
} as const;

// ============================================================================
// AuditMetrics
// ============================================================================

export class AuditMetrics {
  constructor(private readonly registry: MetricsRegistry) {}

  /** Audit event accepted into the pipeline (outbox or buffer). */
  eventIngested(labels: {
    tenant: string;
    event_type: string;
    severity: string;
  }): void {
    this.registry.incrementCounter(
      METRIC.eventsIngested,
      1,
      labels as MetricLabels,
    );
  }

  /** Audit event persisted to core.workflow_event_log by drain worker. */
  eventPersisted(labels: { tenant: string; event_type: string }): void {
    this.registry.incrementCounter(
      METRIC.eventsPersisted,
      1,
      labels as MetricLabels,
    );
  }

  /** Audit event dropped (buffer overflow, dead-letter, feature_flag_off, etc.). */
  eventDropped(labels: { tenant: string; reason: string }): void {
    this.registry.incrementCounter(
      METRIC.eventsDropped,
      1,
      labels as MetricLabels,
    );
  }

  /** Audit event pushed to in-memory buffer (outbox unavailable). */
  eventBuffered(labels: { tenant: string }): void {
    this.registry.incrementCounter(
      METRIC.eventsBuffered,
      1,
      labels as MetricLabels,
    );
  }

  /** Set current outbox pending row count (gauge). */
  outboxLag(depth: number): void {
    this.registry.setGauge(METRIC.outboxLag, depth);
  }

  /** Set current outbox dead-letter count (gauge). */
  outboxDead(count: number): void {
    this.registry.setGauge(METRIC.outboxDead, count);
  }

  /** Record audit INSERT latency (histogram). */
  insertLatency(durationMs: number, labels: { table: string }): void {
    this.registry.recordHistogram(
      METRIC.insertLatency,
      durationMs,
      labels as MetricLabels,
    );
  }

  /** Record hash chain verification result. */
  hashChainVerified(labels: { tenant: string; valid: string }): void {
    this.registry.incrementCounter(
      METRIC.hashChainVerified,
      1,
      labels as MetricLabels,
    );
  }

  /** Record hash chain discontinuity detected (alert-worthy). */
  chainDiscontinuity(labels: { tenant: string }): void {
    this.registry.incrementCounter(
      METRIC.hashChainDiscontinuity,
      1,
      labels as MetricLabels,
    );
  }

  /** Record an audit query execution. */
  queryExecuted(labels: { tenant: string; query_type: string }): void {
    this.registry.incrementCounter(
      METRIC.queryExecuted,
      1,
      labels as MetricLabels,
    );
  }

  /** Set current in-memory buffer depth (gauge). */
  memoryBufferDepth(depth: number): void {
    this.registry.setGauge(METRIC.memoryBufferDepth, depth);
  }

  /** Set current DLQ unreplayed count (gauge). */
  dlqDepth(count: number): void {
    this.registry.setGauge(METRIC.dlqDepth, count);
  }

  /** Set outbox lag in seconds (oldest pending item age). */
  outboxLagSeconds(seconds: number): void {
    this.registry.setGauge(METRIC.outboxLagSeconds, seconds);
  }

  // -- Phase 5 metrics -------------------------------------------------------

  /** Audit event shed by load shedding policy. */
  eventLoadShed(labels: {
    tenant: string;
    reason: string;
    event_category: string;
  }): void {
    this.registry.incrementCounter(
      METRIC.eventsLoadShed,
      1,
      labels as MetricLabels,
    );
  }

  /** Slow timeline query detected. */
  querySlowDetected(labels: { tenant: string }): void {
    this.registry.incrementCounter(
      METRIC.querySlowDetected,
      1,
      labels as MetricLabels,
    );
  }

  /** Timeline query latency histogram (all queries). */
  timelineQueryLatency(durationMs: number, labels: { tenant: string }): void {
    this.registry.recordHistogram(
      METRIC.timelineQueryLatency,
      durationMs,
      labels as MetricLabels,
    );
  }

  /** Integrity verification completed. */
  integrityVerificationCompleted(labels: {
    tenant: string;
    type: string;
    result: string;
  }): void {
    this.registry.incrementCounter(
      METRIC.integrityVerificationRun,
      1,
      labels as MetricLabels,
    );
  }

  /** Integrity verification duration. */
  integrityVerificationDuration(
    durationMs: number,
    labels: { tenant: string; type: string },
  ): void {
    this.registry.recordHistogram(
      METRIC.integrityVerificationDuration,
      durationMs,
      labels as MetricLabels,
    );
  }

  /** Partition archived to cold storage. */
  partitionArchived(labels: { partition: string }): void {
    this.registry.incrementCounter(
      METRIC.partitionArchived,
      1,
      labels as MetricLabels,
    );
  }

  /** Query blocked because data is in cold storage. */
  coldQueryBlocked(labels: { tenant: string }): void {
    this.registry.incrementCounter(
      METRIC.coldQueryBlocked,
      1,
      labels as MetricLabels,
    );
  }
}

// ============================================================================
// Health check factory
// ============================================================================

/**
 * Create an audit pipeline health checker.
 *
 * Health thresholds:
 *   - Outbox lag <  10 000 → healthy
 *   - Outbox lag <  50 000 → degraded
 *   - Outbox lag >= 50 000 → unhealthy
 *   - Memory buffer > 0    → degraded (circuit is likely open)
 *   - Dead items > 100     → degraded
 *   - DLQ > 0              → degraded
 *   - DLQ > 100            → unhealthy
 */
export function createAuditHealthChecker(
  outboxRepo: AuditOutboxRepo,
  writer?: ResilientAuditWriter,
  dlqRepo?: AuditDlqRepo,
): () => Promise<HealthCheckResult> {
  return async (): Promise<HealthCheckResult> => {
    try {
      const [pending, dead] = await Promise.all([
        outboxRepo.countPending(),
        outboxRepo.countDead(),
      ]);

      const bufferDepth = writer?.bufferDepth ?? 0;

      let dlqUnreplayed = 0;
      if (dlqRepo) {
        try {
          dlqUnreplayed = await dlqRepo.countAllUnreplayed();
        } catch {
          // DLQ not available
        }
      }

      let status: "healthy" | "degraded" | "unhealthy" = "healthy";
      const details: Record<string, unknown> = {
        outboxPending: pending,
        outboxDead: dead,
        memoryBuffer: bufferDepth,
        dlqUnreplayed,
      };

      if (pending >= 50_000 || dlqUnreplayed > 100) {
        status = "unhealthy";
      } else if (
        pending >= 10_000 ||
        bufferDepth > 0 ||
        dead > 100 ||
        dlqUnreplayed > 0
      ) {
        status = "degraded";
      }

      return {
        status,
        message: `Outbox lag: ${pending}, dead: ${dead}, buffer: ${bufferDepth}, dlq: ${dlqUnreplayed}`,
        details,
        timestamp: new Date(),
      };
    } catch (err) {
      return {
        status: "unhealthy",
        message: err instanceof Error ? err.message : "Health check failed",
        timestamp: new Date(),
      };
    }
  };
}
