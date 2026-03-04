import { createLogEnvelope } from "@athyper/core";

import { getOtelTraceContext } from "./traceContext.js";

import type { TelemetryAdapter, TelemetryLogger } from "@athyper/core";

export type OTelTelemetryAdapterOptions = {
    emit: (json: unknown) => void;
};

export function createTelemetryAdapter(opts: OTelTelemetryAdapterOptions): TelemetryAdapter {
    const logger: TelemetryLogger = {
        emit(envelope) {
            opts.emit(envelope);
        },
        info(input) {
            opts.emit(createLogEnvelope({ ...input, level: "info" }, getOtelTraceContext));
        },
        warn(input) {
            opts.emit(createLogEnvelope({ ...input, level: "warn" }, getOtelTraceContext));
        },
        error(input) {
            opts.emit(createLogEnvelope({ ...input, level: "error" }, getOtelTraceContext));
        }
    };

    return {
        logger,
        getTraceContext: getOtelTraceContext
    };
}

// Export traceContext utilities
export * from "./traceContext.js";