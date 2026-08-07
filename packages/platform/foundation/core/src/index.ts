// @athyper/platform-core — foundational primitives, no @athyper deps

export type { LogLevel, LogFields, InfraLogger, ChildLogger } from './logger/index.js';

export type {
  TelemetryTraceContext,
  LogEnvelope,
  TelemetryLogger,
  TelemetryAdapter,
} from './telemetry/index.js';
export { createLogEnvelope } from './telemetry/index.js';

export type { PlaneName, RequestLogContext } from './context/index.js';

export type { PlatformErrorCode } from './errors/codes.js';
export type {
  PlatformError,
  PlatformErrorReport,
  PlatformErrorResponse,
} from './errors/types.js';
export { PlatformException, fail } from './errors/exception.js';
export { errorCodeToHttpStatus, isRetryablePlatformError } from './errors/utils.js';
