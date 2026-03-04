import { trace } from "@opentelemetry/api";

export type TraceContext = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
};

/**
 * Extract OpenTelemetry trace context from active span
 */
export function getOtelTraceContext(): TraceContext | undefined {
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
  fn: () => Promise<T>
): Promise<T> {
  const tracer = trace.getTracer("@athyper/telemetry");

  return tracer.startActiveSpan(name, async (span) => {
    try {
      const result = await fn();
      span.setStatus({ code: 1 }); // OK
      return result;
    } catch (error) {
      span.setStatus({ code: 2, message: String(error) }); // ERROR
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
}