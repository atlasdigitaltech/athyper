import type { LogLevel, LogFields } from '../logger/types.js';
import type { TelemetryTraceContext, LogEnvelope } from './types.js';

export function createLogEnvelope(
  input: LogFields & { level: LogLevel; event?: string },
  getTraceContext: () => TelemetryTraceContext | undefined,
): LogEnvelope {
  const trace = getTraceContext();
  return {
    ...input,
    ...(trace && {
      trace_id: trace.traceId,
      span_id: trace.spanId,
      // Only include parent_span_id when set — avoids serializing undefined
      // as null in strict JSON serializers (e.g. pino with JSON mode).
      ...(trace.parentSpanId && { parent_span_id: trace.parentSpanId }),
    }),
    ts: Date.now(),
  };
}
