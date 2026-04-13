// src/index.ts
import { createLogEnvelope } from "@athyper/core";

// src/trace-context.ts
import { trace, SpanStatusCode } from "@opentelemetry/api";
function getOtelTraceContext() {
  const activeSpan = trace.getActiveSpan();
  if (!activeSpan) return void 0;
  const spanContext = activeSpan.spanContext();
  if (!spanContext.traceId || !spanContext.spanId) {
    return void 0;
  }
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    parentSpanId: void 0
    // Can extract from baggage if needed
  };
}
async function withSpan(name, fn) {
  const tracer = trace.getTracer("@athyper/telemetry");
  return tracer.startActiveSpan(name, async (span) => {
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}

// src/index.ts
function createTelemetryAdapter(opts) {
  const logger = {
    emit(envelope) {
      opts.emit(envelope);
    },
    info(input) {
      opts.emit(
        createLogEnvelope({ ...input, level: "info" }, getOtelTraceContext)
      );
    },
    warn(input) {
      opts.emit(
        createLogEnvelope({ ...input, level: "warn" }, getOtelTraceContext)
      );
    },
    error(input) {
      opts.emit(
        createLogEnvelope({ ...input, level: "error" }, getOtelTraceContext)
      );
    }
  };
  return {
    logger,
    getTraceContext: getOtelTraceContext
  };
}
export {
  createTelemetryAdapter,
  getOtelTraceContext,
  withSpan
};
//# sourceMappingURL=index.js.map