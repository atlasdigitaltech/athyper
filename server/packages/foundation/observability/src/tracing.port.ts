export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

export interface Span {
  setAttributes(attrs: Record<string, string | number | boolean>): void;
  recordException(err: Error): void;
  end(): void;
}

export interface Tracer {
  startSpan(name: string): Span;
  startActiveSpan<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T>;
  getActiveSpanContext(): SpanContext | undefined;
}
