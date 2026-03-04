/**
 * Document Services — Metrics
 *
 * Records document-specific metrics via the platform MetricsRegistry.
 * Uses the existing MetricsRegistry API: incrementCounter, setGauge, recordHistogram.
 */

import type { MetricsRegistry } from "@athyper/core";

export class DocMetrics {
    constructor(private readonly registry: MetricsRegistry) {}

    recordRenderDuration(durationMs: number): void {
        this.registry.recordHistogram("doc_render_duration_ms", durationMs);
    }

    incrementRenderTotal(status: string, engine: string = "HANDLEBARS"): void {
        this.registry.incrementCounter("doc_render_total", 1, { status, engine });
    }

    setQueueDepth(depth: number): void {
        this.registry.setGauge("doc_render_queue_depth", depth);
    }

    recordOutputSize(sizeBytes: number): void {
        this.registry.recordHistogram("doc_output_size_bytes", sizeBytes);
    }

    setTemplateCount(status: string, count: number): void {
        this.registry.setGauge("doc_template_count", count, { status });
    }

    // ── Stage-level metrics (Batch 5) ───────────────────────────────

    recordStageDuration(stage: "compose" | "render" | "upload" | "db_update", durationMs: number): void {
        this.registry.recordHistogram("doc_render_stage_duration_ms", durationMs, { stage });
    }

    incrementFailuresByCode(errorCode: string): void {
        this.registry.incrementCounter("doc_render_failures_by_code", 1, { error_code: errorCode });
    }

    setRendererPoolActive(active: number): void {
        this.registry.setGauge("doc_renderer_pool_active", active);
    }

    setRendererPoolQueued(queued: number): void {
        this.registry.setGauge("doc_renderer_pool_queued", queued);
    }

    recordStorageDuration(operation: "put" | "get", durationMs: number): void {
        this.registry.recordHistogram("doc_storage_duration_ms", durationMs, { operation });
    }
}
