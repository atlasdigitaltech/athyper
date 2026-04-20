// @athyper/core — shared infrastructure types and utilities

// ─── Logger ───────────────────────────────────────────────────────────────────

export interface InfraLogger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

// ─── Telemetry ────────────────────────────────────────────────────────────────

export interface TelemetryTraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

export interface TelemetryLogger {
  emit(envelope: unknown): void;
  info(input: Record<string, unknown>): void;
  warn(input: Record<string, unknown>): void;
  error(input: Record<string, unknown>): void;
}

export interface TelemetryAdapter {
  logger: TelemetryLogger;
  getTraceContext(): TelemetryTraceContext | undefined;
}

export function createLogEnvelope(
  input: Record<string, unknown> & { level: "info" | "warn" | "error" },
  getTraceContext: () => TelemetryTraceContext | undefined,
): unknown {
  const trace = getTraceContext();
  return {
    ...input,
    ...(trace ? { traceId: trace.traceId, spanId: trace.spanId, parentSpanId: trace.parentSpanId } : {}),
    ts: Date.now(),
  };
}

/** No-op logger for use in tests and local development. */
export function createNoopLogger(): InfraLogger {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
}
