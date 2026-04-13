import { TelemetryTraceContext, TelemetryAdapter } from '@athyper/core';

/**
 * Extract OpenTelemetry trace context from active span
 */
declare function getOtelTraceContext(): TelemetryTraceContext | undefined;
/**
 * Create a new span and execute function within it
 */
declare function withSpan<T>(name: string, fn: () => Promise<T>): Promise<T>;

type OTelTelemetryAdapterOptions = {
    emit: (json: unknown) => void;
};
declare function createTelemetryAdapter(opts: OTelTelemetryAdapterOptions): TelemetryAdapter;

export { type OTelTelemetryAdapterOptions, createTelemetryAdapter, getOtelTraceContext, withSpan };
