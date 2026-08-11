export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

export interface Span {
  setAttributes(attributes: Readonly<Record<string, string | number | boolean>>): void;
  recordException(error: Error): void;
  end(): void;
}

export interface Tracer {
  startSpan(name: string): Span;
  startActiveSpan<T>(name: string, work: (span: Span) => Promise<T>): Promise<T>;
  getActiveSpanContext(): SpanContext | undefined;
}
