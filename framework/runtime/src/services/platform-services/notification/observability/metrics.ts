/**
 * Notification module metrics — Prometheus-style counters and histograms.
 *
 * Uses the framework MetricsRegistry pattern (incrementCounter, recordHistogram).
 * Metric names follow Prometheus naming conventions.
 */

import type { MetricsRegistry } from "@athyper/core";

/**
 * Typed wrapper around MetricsRegistry for notification-specific metrics.
 */
export class NotificationMetrics {
    constructor(private readonly registry: MetricsRegistry) {}

    // ─── Message Lifecycle ──────────────────────────────────────────

    messageCreated(labels: { tenant: string; event_type: string; priority: string }): void {
        this.registry.incrementCounter("notification_messages_total", 1, {
            ...labels,
            status: "created",
        });
    }

    messageCompleted(labels: { tenant: string; event_type: string; status: string }): void {
        this.registry.incrementCounter("notification_messages_total", 1, {
            ...labels,
        });
    }

    // ─── Delivery ───────────────────────────────────────────────────

    deliveryAttempted(labels: { tenant: string; channel: string; provider: string }): void {
        this.registry.incrementCounter("notification_deliveries_total", 1, {
            ...labels,
            status: "attempted",
        });
    }

    deliverySent(labels: { tenant: string; channel: string; provider: string }): void {
        this.registry.incrementCounter("notification_deliveries_total", 1, {
            ...labels,
            status: "sent",
        });
    }

    deliveryFailed(labels: { tenant: string; channel: string; provider: string; error_category: string }): void {
        this.registry.incrementCounter("notification_deliveries_total", 1, {
            ...labels,
            status: "failed",
        });
    }

    deliveryDuration(durationMs: number, labels: { channel: string; provider: string }): void {
        this.registry.recordHistogram("notification_delivery_duration_ms", durationMs, labels);
    }

    // ─── Planning ───────────────────────────────────────────────────

    planningDuration(durationMs: number): void {
        this.registry.recordHistogram("notification_planning_duration_ms", durationMs);
    }

    rulesEvaluated(count: number, labels: { tenant: string; event_type: string }): void {
        this.registry.incrementCounter("notification_rules_evaluated_total", count, labels);
    }

    // ─── Template ───────────────────────────────────────────────────

    templateRenderDuration(durationMs: number, labels: { channel: string }): void {
        this.registry.recordHistogram("notification_template_render_duration_ms", durationMs, labels);
    }

    templateNotFound(labels: { template_key: string; channel: string }): void {
        this.registry.incrementCounter("notification_template_not_found_total", 1, labels);
    }

    // ─── Preference & Suppression ───────────────────────────────────

    suppressionHit(labels: { channel: string; reason: string }): void {
        this.registry.incrementCounter("notification_suppression_hits_total", 1, labels);
    }

    preferenceDisabled(labels: { channel: string }): void {
        this.registry.incrementCounter("notification_preference_disabled_total", 1, labels);
    }

    // ─── Dedup ──────────────────────────────────────────────────────

    dedupHit(labels: { channel: string; event_type: string }): void {
        this.registry.incrementCounter("notification_dedup_hits_total", 1, labels);
    }

    // ─── Queue ──────────────────────────────────────────────────────

    queueDepth(channel: string, depth: number): void {
        this.registry.setGauge("notification_delivery_queue_depth", depth, { channel });
    }

    dlqDepth(depth: number): void {
        this.registry.setGauge("notification_dlq_depth", depth);
    }
}
