import { SpanStatusCode, trace, type Span } from "@opentelemetry/api";

type SpanAttributeValue = string | number | boolean | null | undefined;

export type SpanAttributes = Record<string, SpanAttributeValue>;

export function setSpanAttributes(span: Span, attributes: SpanAttributes): void {
  for (const [key, value] of Object.entries(attributes)) {
    if (value === null || value === undefined) continue;
    span.setAttribute(key, value);
  }
}

export async function withDomainSpan<T>(
  name: string,
  attributes: SpanAttributes,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer("@athyper/domain");
  return tracer.startActiveSpan(name, async (span) => {
    setSpanAttributes(span, attributes);
    try {
      const result = await fn(span);
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
