import type { InfraLogger, ChildLogger } from './logger/types.js';
import type { TelemetryAdapter, TelemetryLogger, LogEnvelope } from './telemetry/types.js';

export function createNoopLogger(): InfraLogger {
  return {
    debug: () => undefined,
    info:  () => undefined,
    warn:  () => undefined,
    error: () => undefined,
    fatal: () => undefined,
  };
}

export function createNoopChildLogger(): ChildLogger {
  const logger: ChildLogger = {
    debug: () => undefined,
    info:  () => undefined,
    warn:  () => undefined,
    error: () => undefined,
    fatal: () => undefined,
    child: () => logger,
  };
  return logger;
}

export function createNoopTelemetryAdapter(): TelemetryAdapter {
  const noopEmit = (_envelope: LogEnvelope) => undefined;
  const noopField = () => undefined;
  const logger: TelemetryLogger = {
    emit:  noopEmit,
    debug: noopField,
    info:  noopField,
    warn:  noopField,
    error: noopField,
    fatal: noopField,
  };
  return { logger, getTraceContext: () => undefined };
}
