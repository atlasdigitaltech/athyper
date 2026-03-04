/**
 * Notification module tracing — OTel-compatible span creation.
 *
 * Uses the framework's custom span interface (compatible with OTel semantics).
 * Provides named span constants and a convenience `withSpan` helper.
 */

import { generateSpanId, generateTraceId, type TraceContext } from "@athyper/core";

// ─── Span Names ─────────────────────────────────────────────────────

export const NOTIFY_SPANS = {
    PLAN: "notify.plan",
    DELIVER: "notify.deliver",
    CALLBACK: "notify.callback",
    RENDER: "notify.render",
    RESOLVE_RECIPIENTS: "notify.resolve_recipients",
    EVALUATE_RULES: "notify.evaluate_rules",
    CHECK_PREFERENCE: "notify.check_preference",
    CHECK_DEDUP: "notify.check_dedup",
    ADAPTER_SEND: "notify.adapter.send",
    CLEANUP: "notify.cleanup",
} as const;

export type NotifySpanName = (typeof NOTIFY_SPANS)[keyof typeof NOTIFY_SPANS];

// ─── Span Attributes ────────────────────────────────────────────────

export interface NotifySpanAttributes {
    "notify.tenant_id"?: string;
    "notify.event_type"?: string;
    "notify.event_id"?: string;
    "notify.message_id"?: string;
    "notify.delivery_id"?: string;
    "notify.channel"?: string;
    "notify.provider"?: string;
    "notify.template_key"?: string;
    "notify.rule_code"?: string;
    "notify.recipient_count"?: number;
    "notify.delivery_count"?: number;
    "notify.duration_ms"?: number;
}

// ─── Span Interface ─────────────────────────────────────────────────

export interface NotifySpan {
    context: TraceContext;
    name: string;
    attributes: Record<string, string | number | boolean>;
    startTime: number;
    endTime?: number;
    status: "ok" | "error" | "unset";
    statusMessage?: string;
    events: Array<{ name: string; time: number; attributes?: Record<string, unknown> }>;
    setAttribute(key: string, value: string | number | boolean): void;
    addEvent(name: string, attributes?: Record<string, unknown>): void;
    setStatus(status: "ok" | "error", message?: string): void;
    end(): void;
}

// ─── Span Factory ───────────────────────────────────────────────────

export function startSpan(
    name: NotifySpanName,
    attributes?: Partial<NotifySpanAttributes>,
    parentContext?: TraceContext,
): NotifySpan {
    const context: TraceContext = {
        traceId: parentContext?.traceId ?? generateTraceId(),
        spanId: generateSpanId(),
        parentSpanId: parentContext?.spanId,
        sampled: parentContext?.sampled ?? true,
    };

    const span: NotifySpan = {
        context,
        name,
        attributes: { ...attributes } as Record<string, string | number | boolean>,
        startTime: Date.now(),
        status: "unset",
        events: [],
        setAttribute(key: string, value: string | number | boolean) {
            this.attributes[key] = value;
        },
        addEvent(eventName: string, attrs?: Record<string, unknown>) {
            this.events.push({ name: eventName, time: Date.now(), attributes: attrs });
        },
        setStatus(s: "ok" | "error", message?: string) {
            this.status = s;
            this.statusMessage = message;
        },
        end() {
            this.endTime = Date.now();
            this.attributes["notify.duration_ms"] = this.endTime - this.startTime;
        },
    };

    return span;
}

// ─── Convenience Helper ─────────────────────────────────────────────

/**
 * Execute an async function within a traced span.
 * Automatically sets status and ends the span.
 */
export async function withSpan<T>(
    name: NotifySpanName,
    attributes: Partial<NotifySpanAttributes>,
    fn: (span: NotifySpan) => Promise<T>,
    parentContext?: TraceContext,
): Promise<T> {
    const span = startSpan(name, attributes, parentContext);
    try {
        const result = await fn(span);
        span.setStatus("ok");
        return result;
    } catch (err) {
        span.setStatus("error", err instanceof Error ? err.message : String(err));
        throw err;
    } finally {
        span.end();
    }
}
