// framework/core/src/observability/telemetry-types.ts
/**
 * Telemetry Types
 *
 * Core telemetry type definitions for structured logging and observability.
 * These types are used by both runtime and telemetry adapters.
 */

export type TelemetryLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export type DataClass = "public" | "internal" | "confidential" | "restricted";
export type RetentionClass = "standard" | "extended" | "legal_hold";

export type EnvelopeSource = "http" | "job" | "cli" | "ws" | "cron" | "system";

export type TelemetryModuleCode =
  | "CORE"
  | "META"
  | "INT"
  | "IAM"
  | "AUDIT"
  | "WF"
  | "SCHED"
  | "NOTIFY"
  | "DOC"
  | "INSIGHTS"
  | "UNKNOWN";

export type ServiceIdentity = {
  name: string; // service.name
  version?: string; // service.version
  instanceId?: string; // service.instance.id
  environment?: string; // deployment.environment
};

export type TenantIdentity = {
  tenant?: string; // tenant key
  realm?: string; // realm key
  org?: string; // optional OU/org key
  module?: TelemetryModuleCode;
};

export type AuthContext = {
  scheme?: "OIDC" | "API_KEY" | "BASIC" | "HMAC" | "NONE";
  enduserId?: string; // enduser.id
  userSubject?: string; // user.subject (OIDC sub)
  clientId?: string; // client.id
};

export type HttpContext = {
  route?: string; // http.route
  method?: string; // http.request.method
  statusCode?: number; // http.response.status_code
  clientAddress?: string; // client.address
  userAgent?: string; // user_agent.original
  requestBodySize?: number; // http.request.body.size
  responseBodySize?: number; // http.response.body.size
};

export type TelemetryTraceContext = {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string | null;
};

export type ExceptionContext = {
  type?: string | null;
  message?: string | null;
  stacktrace?: string | null;
};

export type LogEnvelope = {
  timestamp: string; // ISO
  level: TelemetryLevel;
  schemaVersion: "1.1";

  // Label strategy (Loki labels)
  tenant?: string;
  realm?: string;
  module?: TelemetryModuleCode;
  "service.name": string;
  "deployment.environment"?: string;
  levelLabel: TelemetryLevel; // duplicated as label-friendly
  event?: string;
  source?: EnvelopeSource;

  // Core identity / correlation
  "service.version"?: string;
  "service.instance.id"?: string;
  requestId?: string;
  jobId?: string | null;

  // Tracing
  traceId?: string;
  spanId?: string;
  parentSpanId?: string | null;

  // Business correlation
  "business.correlation_id"?: string;

  // HTTP
  "http.route"?: string;
  "http.request.method"?: string;
  "http.response.status_code"?: number;
  "client.address"?: string;
  "user_agent.original"?: string;
  "http.request.body.size"?: number;
  "http.response.body.size"?: number;

  // Auth
  "auth.scheme"?: AuthContext["scheme"];
  "enduser.id"?: string;
  "user.subject"?: string;
  "client.id"?: string;

  // Event semantics
  category?: "security" | "audit" | "business" | "ops" | "system";
  outcome?: "success" | "failure" | "unknown";
  reason?: string | null;
  durationMs?: number;
  retryCount?: number;

  // Governance
  dataClass?: DataClass;
  pii?: boolean;
  piiType?: "none" | "basic" | "sensitive" | "special";
  redacted?: boolean;
  redactionPolicy?: "mask" | "drop" | "hash" | "tokenize" | "none";

  sampleRate?: number; // 0..1
  retentionClass?: RetentionClass;

  // Errors
  "exception.type"?: string | null;
  "exception.message"?: string | null;
  "exception.stacktrace"?: string | null;

  // Freeform
  attributes?: Record<string, unknown>;
  message?: string;
};

export type CreateLogEnvelopeInput = {
  now?: Date;

  level: TelemetryLevel;
  message?: string;

  service: ServiceIdentity;
  tenant?: TenantIdentity;

  source?: EnvelopeSource;

  // correlation
  requestId?: string;
  jobId?: string | null;

  // tracing (optional override; normally injected from context)
  trace?: TelemetryTraceContext;

  // business
  businessCorrelationId?: string;

  // http/auth
  http?: HttpContext;
  auth?: AuthContext;

  // event semantics
  event?: string;
  category?: LogEnvelope["category"];
  outcome?: LogEnvelope["outcome"];
  reason?: string | null;
  durationMs?: number;
  retryCount?: number;

  // governance
  dataClass?: DataClass;
  pii?: boolean;
  piiType?: LogEnvelope["piiType"];
  redacted?: boolean;
  redactionPolicy?: LogEnvelope["redactionPolicy"];
  sampleRate?: number;
  retentionClass?: RetentionClass;

  exception?: ExceptionContext;

  attributes?: Record<string, unknown>;
};

export type TelemetryLogger = {
  emit(envelope: LogEnvelope): void;

  // convenience methods
  info(input: Omit<CreateLogEnvelopeInput, "level">): void;
  warn(input: Omit<CreateLogEnvelopeInput, "level">): void;
  error(input: Omit<CreateLogEnvelopeInput, "level">): void;
};

export type TelemetryAdapter = {
  logger: TelemetryLogger;

  /**
   * Optional: expose OTel "carrier" methods for middleware integration.
   * Runtime can call these without importing OTel SDK directly.
   */
  getTraceContext?: () => TelemetryTraceContext | undefined;

  /**
   * Optional: to ensure logs have trace/span even before a span exists.
   */
  ensureSpan?: (name: string, fn: () => Promise<void> | void) => Promise<void>;
};
