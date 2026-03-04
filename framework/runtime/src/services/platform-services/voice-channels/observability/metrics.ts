/**
 * Voice & Channels (TEL) — observability metrics.
 */

import type { MetricsRegistry } from "@athyper/core";

export class TelMetrics {
    constructor(private readonly registry: MetricsRegistry) {}

    // ── Calls ─────────────────────────────────────────────────────────

    callInitiated(labels: { tenant: string; direction: string; provider: string }): void {
        this.registry.incrementCounter("tel_call_initiated_total", 1, labels);
    }

    callCompleted(labels: { tenant: string; direction: string; status: string }): void {
        this.registry.incrementCounter("tel_call_completed_total", 1, labels);
    }

    callDuration(durationSeconds: number, labels: { tenant: string; direction: string }): void {
        this.registry.recordHistogram("tel_call_duration_seconds", durationSeconds, labels);
    }

    // ── Recordings ────────────────────────────────────────────────────

    recordingStored(labels: { tenant: string }): void {
        this.registry.incrementCounter("tel_recording_stored_total", 1, labels);
    }

    recordingFailed(labels: { tenant: string; reason: string }): void {
        this.registry.incrementCounter("tel_recording_failed_total", 1, labels);
    }

    recordingSize(sizeBytes: number, labels: { tenant: string }): void {
        this.registry.recordHistogram("tel_recording_size_bytes", sizeBytes, labels);
    }

    // ── SMS ───────────────────────────────────────────────────────────

    smsSent(labels: { tenant: string }): void {
        this.registry.incrementCounter("tel_sms_sent_total", 1, labels);
    }

    smsFailed(labels: { tenant: string; reason: string }): void {
        this.registry.incrementCounter("tel_sms_failed_total", 1, labels);
    }

    smsReceived(labels: { tenant: string }): void {
        this.registry.incrementCounter("tel_sms_received_total", 1, labels);
    }

    // ── IVR ───────────────────────────────────────────────────────────

    ivrFlowExecuted(labels: { tenant: string; flow: string }): void {
        this.registry.incrementCounter("tel_ivr_flow_executed_total", 1, labels);
    }

    ivrStepDuration(durationMs: number, labels: { tenant: string; flow: string; stepType: string }): void {
        this.registry.recordHistogram("tel_ivr_step_duration_ms", durationMs, labels);
    }

    // ── Analytics ─────────────────────────────────────────────────────

    analyticsRunCompleted(labels: { tenant: string }): void {
        this.registry.incrementCounter("tel_analytics_run_total", 1, labels);
    }

    activeCallsGauge(count: number, labels: { tenant: string }): void {
        this.registry.setGauge("tel_active_calls", count, labels);
    }
}
