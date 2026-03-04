// framework/core/src/observability/telemetry-envelope.ts
/**
 * Telemetry Envelope
 *
 * Factory functions for creating structured log envelopes.
 */

import type { CreateLogEnvelopeInput, LogEnvelope, TelemetryTraceContext } from "./telemetry-types.js";

// Trace/span injection is done by an injected getter to keep runtime contract clean.
export type TraceContextProvider = () => TelemetryTraceContext | undefined;

function iso(now: Date): string {
  return now.toISOString();
}

function clamp01(n: number | undefined): number | undefined {
  if (n === undefined) return undefined;
  if (Number.isNaN(n)) return undefined;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function safeErrorStack(
  err: unknown
): { type?: string; message?: string; stacktrace?: string } {
  if (!err) return {};

  if (err instanceof Error) {
    return {
      type: err.name || "Error",
      message: err.message,
      stacktrace: err.stack,
    };
  }

  // unknown throwables (string, number, object, etc.)
  return {
    type: "UnknownError",
    message: String(err),
  };
}

export function createLogEnvelope(
  input: CreateLogEnvelopeInput,
  getTraceContext?: TraceContextProvider
): LogEnvelope {
  const now = input.now ?? new Date();

  const traceFromContext = input.trace ?? getTraceContext?.();
  const traceId = traceFromContext?.traceId;
  const spanId = traceFromContext?.spanId;
  const parentSpanId = traceFromContext?.parentSpanId ?? null;

  const exception =
    input.exception?.type || input.exception?.message || input.exception?.stacktrace
      ? input.exception
      : undefined;

  // Normalize "governance defaults" (you can tune)
  const dataClass = input.dataClass ?? "internal";
  const pii = input.pii ?? false;
  const redacted = input.redacted ?? pii; // if pii => default redacted true

  const envelope: LogEnvelope = {
    timestamp: iso(now),
    level: input.level,
    schemaVersion: "1.1",

    // labels
    tenant: input.tenant?.tenant,
    realm: input.tenant?.realm,
    module: input.tenant?.module ?? "UNKNOWN",
    "service.name": input.service.name,
    "deployment.environment": input.service.environment,
    levelLabel: input.level,
    event: input.event,
    source: input.source,

    // service identity
    "service.version": input.service.version,
    "service.instance.id": input.service.instanceId,

    // correlation
    requestId: input.requestId,
    jobId: input.jobId ?? null,

    // tracing
    traceId,
    spanId,
    parentSpanId,

    // business
    "business.correlation_id": input.businessCorrelationId,

    // http
    "http.route": input.http?.route,
    "http.request.method": input.http?.method,
    "http.response.status_code": input.http?.statusCode,
    "client.address": input.http?.clientAddress,
    "user_agent.original": input.http?.userAgent,
    "http.request.body.size": input.http?.requestBodySize,
    "http.response.body.size": input.http?.responseBodySize,

    // auth
    "auth.scheme": input.auth?.scheme,
    "enduser.id": input.auth?.enduserId,
    "user.subject": input.auth?.userSubject,
    "client.id": input.auth?.clientId,

    // semantics
    category: input.category ?? "ops",
    outcome: input.outcome ?? "unknown",
    reason: input.reason ?? null,
    durationMs: input.durationMs,
    retryCount: input.retryCount,

    // governance
    dataClass,
    pii,
    piiType: input.piiType ?? (pii ? "basic" : "none"),
    redacted,
    redactionPolicy: input.redactionPolicy ?? (redacted ? "mask" : "none"),
    sampleRate: clamp01(input.sampleRate ?? 1.0),
    retentionClass: input.retentionClass ?? "standard",

    // errors
    "exception.type": exception?.type ?? null,
    "exception.message": exception?.message ?? null,
    "exception.stacktrace": exception?.stacktrace ?? null,

    // freeform
    attributes: input.attributes ?? {},
    message: input.message,
  };

  return envelope;
}

// convenience: turn unknown err into exception fields
export function withException(input: CreateLogEnvelopeInput, err: unknown): CreateLogEnvelopeInput {
  const e = safeErrorStack(err);
  return {
    ...input,
    exception: {
      type: e.type ?? null,
      message: e.message ?? null,
      stacktrace: e.stacktrace ?? null,
    },
  };
}
