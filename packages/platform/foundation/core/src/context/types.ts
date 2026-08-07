export type PlaneName = 'neon' | 'mesh' | 'admin';

// Canonical logging/telemetry contract for request-scoped correlation.
// Every service that logs — api, worker, scheduler, BFF relays — binds
// these fields so logs, traces, and Sentry events share a single vocabulary.
export interface RequestLogContext {
  // Resolved in priority order: OTel traceId (sampled) → X-Correlation-ID
  // header → ALS requestId. Always set before any log or error capture.
  correlationId: string;
  tenantId?: string;
  userId?: string;
  sessionId?: string;
  plane?: PlaneName;
}
