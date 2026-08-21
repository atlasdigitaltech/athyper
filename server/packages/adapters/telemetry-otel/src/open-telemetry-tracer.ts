import type {
  Span as FoundationSpan,
  SpanContext as FoundationSpanContext,
  Tracer as FoundationTracer,
} from "@athyper/server-foundation/observability";
import {
  SpanStatusCode,
  trace,
  type Span as OtelSpan,
  type Tracer as OtelTracer,
} from "@opentelemetry/api";

export class OpenTelemetryTracer implements FoundationTracer {
  readonly #tracer: OtelTracer;

  constructor(
    instrumentationScope: string,
    instrumentationVersion?: string,
    tracer: OtelTracer = trace.getTracer(
      instrumentationScope,
      instrumentationVersion,
    ),
  ) {
    this.#tracer = tracer;
  }

  startSpan(name: string): FoundationSpan {
    return wrapSpan(this.#tracer.startSpan(requireSpanName(name)));
  }

  startActiveSpan<Result>(
    name: string,
    work: (span: FoundationSpan) => Promise<Result>,
  ): Promise<Result> {
    return this.#tracer.startActiveSpan(requireSpanName(name), async (span) => {
      const wrapped = wrapSpan(span);
      try {
        const result = await work(wrapped);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        const normalized =
          error instanceof Error ? error : new Error(String(error));
        span.recordException(normalized);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: normalized.message,
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  getActiveSpanContext(): FoundationSpanContext | undefined {
    const span = trace.getActiveSpan();
    if (!span) return undefined;
    const context = span.spanContext();
    if (!context.traceId || !context.spanId) return undefined;
    return { traceId: context.traceId, spanId: context.spanId };
  }
}

function wrapSpan(span: OtelSpan): FoundationSpan {
  return {
    setAttributes(attributes) {
      span.setAttributes(attributes);
    },
    recordException(error) {
      span.recordException(error);
    },
    end() {
      span.end();
    },
  };
}

function requireSpanName(name: string): string {
  const normalized = name.trim();
  if (!normalized) throw new TypeError("OpenTelemetry span name must not be empty");
  return normalized;
}
