// server/packages/adapters/telemetry/src/index.ts
//
// OpenTelemetry telemetry adapter. Formats log payloads as structured
// TelemetryEnvelope objects via @athyper/core and emits them through a
// caller-supplied emit() callback (wired to pino in the runtime).

import { createLogEnvelope } from "@athyper/core";

import { getOtelTraceContext } from "./trace-context.js";

import type { TelemetryAdapter, TelemetryLogger } from "@athyper/core";

export type OTelTelemetryAdapterOptions = {
  emit: (json: unknown) => void;
};

export function createTelemetryAdapter(
  opts: OTelTelemetryAdapterOptions,
): TelemetryAdapter {
  const logger: TelemetryLogger = {
    emit(envelope) {
      opts.emit(envelope);
    },
    info(input) {
      opts.emit(
        createLogEnvelope({ ...input, level: "info" }, getOtelTraceContext),
      );
    },
    warn(input) {
      opts.emit(
        createLogEnvelope({ ...input, level: "warn" }, getOtelTraceContext),
      );
    },
    error(input) {
      opts.emit(
        createLogEnvelope({ ...input, level: "error" }, getOtelTraceContext),
      );
    },
  };

  return {
    logger,
    getTraceContext: getOtelTraceContext,
  };
}

// Export trace-context utilities (getOtelTraceContext, legacy withSpan)
export * from "./trace-context.js";
