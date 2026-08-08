import { sql } from "kysely";
import type { Kysely } from "kysely";

// ── Domain types (mirror audit.* PostgreSQL domains) ─────────────────────────

export type AuditOperation =
  | "create" | "update" | "delete" | "restore"
  | "execute" | "approve" | "reject"
  | "grant" | "revoke"
  | "import" | "export"
  | "login" | "logout";

export type AuditSeverity = "info" | "warning" | "error" | "critical";
export type AuditOutcome  = "success" | "failure" | "partial" | "denied" | "error" | "unknown";

export type SecurityEventCategory =
  | "authentication" | "authorization" | "data_access" | "credential"
  | "configuration" | "integration" | "malware" | "privacy"
  | "threat" | "integrity" | "availability" | "other";

// ── Tenant-scoped event input ─────────────────────────────────────────────────

export interface AuditEventInput {
  /** Dot-namespaced event code — matched against audit_event_contract.event_code_pattern */
  event_code:             string;
  operation:              AuditOperation;
  /** Fully-qualified entity type, e.g. 'document.supplier_attachment' */
  entity_type:            string;
  entity_id?:             string | null;
  outcome?:               AuditOutcome;
  severity?:              AuditSeverity | null;
  scope_type?:            string;
  scope_id?:              string | null;
  audit_reason_code_id?:  string | null;
  reason_comment?:        string | null;
  old_values?:            Record<string, unknown> | null;
  new_values?:            Record<string, unknown> | null;
  changed_fields?:        string[] | null;
  context?:               Record<string, unknown> | null;
  correlation_id?:        string | null;
  request_id?:            string | null;
}

// ── Platform-scoped event input ───────────────────────────────────────────────

export interface PlatformAuditEventInput {
  /** Must match platform_system_event pattern: ^(system|platform)\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$ */
  event_code:   string;
  operation:    AuditOperation;
  /** Entity type within the platform, e.g. 'system.api_server' */
  entity_type:  string;
  /** Non-nullable platform scope identifier */
  scope_id:     string;
  entity_id?:   string | null;
  outcome?:     AuditOutcome;
  severity?:    AuditSeverity | null;
  context?:     Record<string, unknown> | null;
  correlation_id?: string | null;
  request_id?:  string | null;
}

// ── Internal callers ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callAppendEvent(db: Kysely<any>, i: AuditEventInput): Promise<void> {
  await sql`SELECT audit.append_event(
    ${i.event_code},
    ${i.operation}::audit.operation_d,
    ${i.entity_type},
    ${i.entity_id ?? null}::uuid,
    ${i.outcome ?? "success"}::audit.outcome_d,
    ${i.severity ?? null}::audit.event_severity_d,
    ${i.scope_type ?? "tenant"},
    ${i.scope_id ?? null}::uuid,
    ${i.audit_reason_code_id ?? null}::uuid,
    ${i.reason_comment ?? null},
    ${i.old_values ? JSON.stringify(i.old_values) : null}::jsonb,
    ${i.new_values ? JSON.stringify(i.new_values) : null}::jsonb,
    ${i.changed_fields ?? null}::text[],
    ${i.context ? JSON.stringify(i.context) : "{}"}::jsonb,
    ${i.correlation_id ?? null}::uuid,
    ${i.request_id ?? null}
  )`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callAppendPlatformEvent(db: Kysely<any>, i: PlatformAuditEventInput): Promise<void> {
  await sql`SELECT audit.append_platform_event(
    ${i.event_code},
    ${i.operation}::audit.operation_d,
    ${i.entity_type},
    ${i.scope_id}::uuid,
    ${i.entity_id ?? null}::uuid,
    ${i.outcome ?? "success"}::audit.outcome_d,
    ${i.severity ?? null}::audit.event_severity_d,
    ${i.context ? JSON.stringify(i.context) : "{}"}::jsonb,
    ${i.correlation_id ?? null}::uuid,
    ${i.request_id ?? null}
  )`.execute(db);
}

// ── Public API — tenant events ────────────────────────────────────────────────

/**
 * Emit a tenant-scoped audit event. Errors are swallowed — use on non-critical
 * paths where an audit failure must not surface to the caller.
 */
export async function appendAuditEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  input: AuditEventInput,
): Promise<void> {
  try {
    await callAppendEvent(db, input);
  } catch {
    // Audit failures must never surface to callers on non-critical paths.
  }
}

/**
 * Emit a tenant-scoped audit event inside a transaction. Errors propagate so
 * a failed audit insert rolls back the surrounding business mutation — use on
 * all paths where an unaudited commit is unacceptable (e.g. financial postings,
 * period close, permission changes).
 */
export async function appendRequiredAuditEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  input: AuditEventInput,
): Promise<void> {
  await callAppendEvent(db, input);
}

// ── Public API — platform events ──────────────────────────────────────────────

/**
 * Emit a platform-scoped event (tenant_id = NULL, scope_type = 'platform').
 * Errors are always swallowed — platform lifecycle events must never block
 * server startup or shutdown.
 */
export async function appendPlatformAuditEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  input: PlatformAuditEventInput,
): Promise<void> {
  try {
    await callAppendPlatformEvent(db, input);
  } catch {
    // Swallow — lifecycle audit must never crash the server.
  }
}

// ── Security event ────────────────────────────────────────────────────────────

export interface SecurityEventInput {
  /** DB plane for app.database_plane session var — triggers read this to fill plane_code. */
  plane: "neon" | "mesh" | "athyper";
  tenant_id: string;
  event_code: string;
  category: SecurityEventCategory;
  severity?: AuditSeverity;
  outcome?: AuditOutcome;
  principal_id?: string | null;
  session_id?: string | null;
  source_ip?: string | null;
  user_agent?: string | null;
  detection_rule?: string | null;
  risk_score?: number | null;
  source_service?: string;
  correlation_id?: string | null;
  request_id?: string | null;
  context?: Record<string, unknown>;
}

/**
 * Emit a security event to audit.security_event. Errors are swallowed —
 * security logging must never surface to callers or affect the request outcome.
 *
 * Sets app.database_plane + app.current_tenant_id inside a transaction so the
 * row-level trigger can validate plane_code and RLS can scope the INSERT.
 */
export async function appendSecurityEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  input: SecurityEventInput,
): Promise<void> {
  try {
    await db.transaction().execute(async (trx) => {
      await sql`
        SELECT
          set_config('app.current_tenant_id',  ${input.tenant_id},            true),
          set_config('app.current_principal_id', ${input.principal_id ?? ""},  true),
          set_config('app.database_plane',       ${input.plane},               true)
      `.execute(trx);
      await sql`
        INSERT INTO audit.security_event (
          tenant_id, event_code, category, severity, outcome,
          principal_id, session_id, source_ip, user_agent,
          detection_rule, risk_score, source_service,
          correlation_id, request_id, context
        ) VALUES (
          ${input.tenant_id}::uuid,
          ${input.event_code},
          ${input.category}::audit.security_category_d,
          ${input.severity ?? "info"}::audit.event_severity_d,
          ${input.outcome ?? "success"}::audit.outcome_d,
          ${input.principal_id ?? null}::uuid,
          ${input.session_id ?? null},
          ${input.source_ip ?? null}::inet,
          ${input.user_agent ?? null},
          ${input.detection_rule ?? null},
          ${input.risk_score ?? null},
          ${input.source_service ?? "svc-iam"},
          ${input.correlation_id ?? null}::uuid,
          ${input.request_id ?? null},
          ${input.context ? JSON.stringify(input.context) : "{}"}::jsonb
        )
      `.execute(trx);
    });
  } catch {
    // Security event failures must never surface to callers.
  }
}
