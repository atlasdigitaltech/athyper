/**
 * META Engine Tracing — OTel-compatible span creation.
 *
 * Uses the framework's custom span interface (compatible with OTel semantics).
 * Provides named span constants and a convenience `withSpan` helper.
 *
 * Follows the same pattern as notification/observability/tracing.ts.
 */

import { generateSpanId, generateTraceId, type TraceContext } from "@athyper/core";

// ─── Span Names ─────────────────────────────────────────────────────

export const META_SPANS = {
  COMPILE: "meta.compile",
  COMPILE_OVERLAY: "meta.compile.overlay",
  VALIDATE: "meta.validate",
  VALIDATE_RULE: "meta.validate.rule",
  POLICY_EVALUATE: "meta.policy.evaluate",
  LIFECYCLE_TRANSITION: "meta.lifecycle.transition",
  LIFECYCLE_CREATE: "meta.lifecycle.create",
  DATA_LIST: "meta.data.list",
  DATA_GET: "meta.data.get",
  DATA_CREATE: "meta.data.create",
  DATA_UPDATE: "meta.data.update",
  DATA_DELETE: "meta.data.delete",
  DATA_BULK_CREATE: "meta.data.bulkCreate",
  DATA_BULK_UPDATE: "meta.data.bulkUpdate",
  DATA_TRANSITION: "meta.data.transition",
  CASCADE_DELETE: "meta.data.cascadeDelete",
  APPROVAL_RESOLVE: "meta.approval.resolve",
} as const;

export type MetaSpanName = (typeof META_SPANS)[keyof typeof META_SPANS];

// ─── Span Attributes ────────────────────────────────────────────────

export interface MetaSpanAttributes {
  "meta.tenant_id"?: string;
  "meta.entity"?: string;
  "meta.version"?: string;
  "meta.operation"?: string;
  "meta.action"?: string;
  "meta.record_id"?: string;
  "meta.trigger"?: string;
  "meta.rule_count"?: number;
  "meta.error_count"?: number;
  "meta.warning_count"?: number;
  "meta.policy_count"?: number;
  "meta.cascade_depth"?: number;
  "meta.strategy"?: string;
  "meta.duration_ms"?: number;
  "meta.cache_hit"?: boolean;
}

// ─── Span Interface ─────────────────────────────────────────────────

export interface MetaSpan {
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
  name: MetaSpanName,
  attributes?: Partial<MetaSpanAttributes>,
  parentContext?: TraceContext,
): MetaSpan {
  const context: TraceContext = {
    traceId: parentContext?.traceId ?? generateTraceId(),
    spanId: generateSpanId(),
    parentSpanId: parentContext?.spanId,
    sampled: parentContext?.sampled ?? true,
  };

  const span: MetaSpan = {
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
      this.attributes["meta.duration_ms"] = this.endTime - this.startTime;
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
  name: MetaSpanName,
  attributes: Partial<MetaSpanAttributes>,
  fn: (span: MetaSpan) => Promise<T>,
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
