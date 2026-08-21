// server/packages/adapters/telemetry/src/index.ts
//
// OpenTelemetry telemetry adapter. Formats log payloads as structured
// TelemetryEnvelope objects via @athyper/platform-core and emits them through a
// caller-supplied emit() callback (wired to pino in the runtime).

import { createLogEnvelope } from "@athyper/platform-core/telemetry";
import type { TelemetryAdapter, TelemetryLogger, LogEnvelope } from "@athyper/platform-core/telemetry";

import { getOtelTraceContext } from "./trace-context.js";

export type OTelTelemetryAdapterOptions = {
  emit: (envelope: LogEnvelope) => void;
};

export function createTelemetryAdapter(
  opts: OTelTelemetryAdapterOptions,
): TelemetryAdapter {
  const envelope = (level: LogEnvelope["level"], input: Record<string, unknown>) =>
    opts.emit(createLogEnvelope({ ...input, level }, getOtelTraceContext));

  const logger: TelemetryLogger = {
    emit(e) { opts.emit(e); },
    debug(input) { envelope("debug", input); },
    info(input)  { envelope("info",  input); },
    warn(input)  { envelope("warn",  input); },
    error(input) { envelope("error", input); },
    fatal(input) { envelope("fatal", input); },
  };

  return {
    logger,
    getTraceContext: getOtelTraceContext,
  };
}

// Export trace-context utilities (getOtelTraceContext, legacy withSpan)
export * from "./trace-context.js";
export * from "./framework-performance.js";
