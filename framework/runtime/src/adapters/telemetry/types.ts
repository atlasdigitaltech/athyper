// framework/runtime/src/adapters/telemetry/types.ts
/**
 * Re-export telemetry types from @athyper/core for backward compatibility.
 * New code should import directly from @athyper/core.
 */

export type {
  TelemetryLevel,
  DataClass,
  RetentionClass,
  EnvelopeSource,
  TelemetryModuleCode,
  ServiceIdentity,
  TenantIdentity,
  AuthContext,
  HttpContext,
  TraceContext,
  ExceptionContext,
  LogEnvelope,
  CreateLogEnvelopeInput,
  TelemetryLogger,
  TelemetryAdapter,
} from "@athyper/core";
