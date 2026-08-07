import type { LogLevel, LogFields } from '../logger/types.js';

export interface TelemetryTraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  // W3C traceparent flags byte; bit 0 = sampled. Lets adapters skip
  // log emission for unsampled traces.
  traceFlags?: number;
}

export interface LogEnvelope {
  level: LogLevel;
  ts: number;
  event?: string;
  trace_id?: string;
  span_id?: string;
  parent_span_id?: string;
  [key: string]: unknown;
}

export interface TelemetryLogger {
  emit(envelope: LogEnvelope): void;
  debug(input: LogFields): void;
  info(input: LogFields): void;
  warn(input: LogFields): void;
  error(input: LogFields): void;
  fatal(input: LogFields): void;
}

export interface TelemetryAdapter {
  logger: TelemetryLogger;
  getTraceContext(): TelemetryTraceContext | undefined;
}
