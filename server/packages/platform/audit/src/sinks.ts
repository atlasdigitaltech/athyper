import type { AuditEvent, AuditEventSink } from "@athyper/server-contract-audit";

export interface AuditLogger {
  info(event: string, fields: Readonly<Record<string, unknown>>): void;
}

export function createStructuredLogAuditSink(logger: AuditLogger): AuditEventSink {
  return { async append(event) { logger.info("audit_event", redactLogFields({ ...event })); } };
}

const PII_LOG_KEY = /^(?:value|email|email_address|phone|phone_number|address|line[123]|postal_code|tax_id|national_id)$/iu;
export function redactLogFields(input: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> { return redact(input) as Readonly<Record<string, unknown>>; }
function redact(value: unknown): unknown { if (Array.isArray(value)) return value.map(redact); if (!value || typeof value !== "object") return value; return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, PII_LOG_KEY.test(key) ? "[REDACTED]" : redact(item)])); }

export interface InMemoryAuditSink extends AuditEventSink {
  readonly events: readonly AuditEvent[];
}

export function createInMemoryAuditSink(): InMemoryAuditSink {
  const events: AuditEvent[] = [];
  return { events, async append(event) { events.push(event); } };
}
