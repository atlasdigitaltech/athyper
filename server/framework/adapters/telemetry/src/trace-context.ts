// server/framework/adapters/telemetry/src/trace-context.ts
//
// OpenTelemetry trace context utilities: extracts the active span context and
// provides a withSpan() helper for wrapping async work in a named span.

import { trace, SpanStatusCode } from "@opentelemetry/api";

import type { TelemetryTraceContext } from "@athyper/core";

/**
 * Extract OpenTelemetry trace context from active span
 */
export function getOtelTraceContext(): TelemetryTraceContext | undefined {
  const activeSpan = trace.getActiveSpan();
  if (!activeSpan) return undefined;

  const spanContext = activeSpan.spanContext();

  // Check if trace context is valid
  if (!spanContext.traceId || !spanContext.spanId) {
    return undefined;
  }

  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    parentSpanId: undefined, // Can extract from baggage if needed
  };
}

/**
 * Create a new span and execute function within it
 */
export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer("@athyper/telemetry");

  return tracer.startActiveSpan(name, async (span) => {
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
}
