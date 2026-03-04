/**
 * Integration Hub — observability metrics.
 */

import type { MetricsRegistry } from "@athyper/core";

export class IntegrationMetrics {
    constructor(private readonly registry: MetricsRegistry) {}

    // ── Delivery ────────────────────────────────────────────────────────

    deliveryAttempted(labels: { tenant: string; endpoint: string }): void {
        this.registry.incrementCounter("int_delivery_attempted_total", 1, labels);
    }

    deliverySucceeded(labels: { tenant: string; endpoint: string; statusCode: string }): void {
        this.registry.incrementCounter("int_delivery_succeeded_total", 1, labels);
    }

    deliveryFailed(labels: { tenant: string; endpoint: string; errorCategory: string }): void {
        this.registry.incrementCounter("int_delivery_failed_total", 1, labels);
    }

    deliveryDuration(durationMs: number, labels: { tenant: string; endpoint: string }): void {
        this.registry.recordHistogram("int_delivery_duration_ms", durationMs, labels);
    }

    // ── Outbox ──────────────────────────────────────────────────────────

    outboxItemCreated(labels: { tenant: string; eventType: string }): void {
        this.registry.incrementCounter("int_outbox_created_total", 1, labels);
    }

    outboxItemCompleted(labels: { tenant: string; eventType: string }): void {
        this.registry.incrementCounter("int_outbox_completed_total", 1, labels);
    }

    outboxItemDead(labels: { tenant: string; eventType: string }): void {
        this.registry.incrementCounter("int_outbox_dead_total", 1, labels);
    }

    outboxQueueDepth(depth: number, labels: { tenant: string }): void {
        this.registry.setGauge("int_outbox_queue_depth", depth, labels);
    }

    // ── Flow Execution ──────────────────────────────────────────────────

    flowExecutionStarted(labels: { tenant: string; flow: string }): void {
        this.registry.incrementCounter("int_flow_started_total", 1, labels);
    }

    flowExecutionCompleted(labels: { tenant: string; flow: string; status: string }): void {
        this.registry.incrementCounter("int_flow_completed_total", 1, labels);
    }

    flowStepDuration(durationMs: number, labels: { tenant: string; flow: string; stepType: string }): void {
        this.registry.recordHistogram("int_flow_step_duration_ms", durationMs, labels);
    }

    // ── Webhooks ────────────────────────────────────────────────────────

    webhookDispatched(labels: { tenant: string; eventType: string }): void {
        this.registry.incrementCounter("int_webhook_dispatched_total", 1, labels);
    }

    webhookDelivered(labels: { tenant: string; subscription: string }): void {
        this.registry.incrementCounter("int_webhook_delivered_total", 1, labels);
    }

    webhookFailed(labels: { tenant: string; subscription: string }): void {
        this.registry.incrementCounter("int_webhook_failed_total", 1, labels);
    }

    // ── Rate Limiting ───────────────────────────────────────────────────

    rateLimitHit(labels: { tenant: string; endpoint: string }): void {
        this.registry.incrementCounter("int_rate_limit_hit_total", 1, labels);
    }
}
