// Runtime audit writer contracts and compatibility helpers.
//
// Legacy audit writer — DEPRECATED
//
// This module (createDbAuditWriter) is superseded by createLifecycleAuditWriter
// from @athyper/svc-audit, which writes to the contract-
// based audit.audit_log via audit.append_platform_event().
//
// Retained for console/noop writers used in tests and local dev.
// createDbAuditWriter is no longer called from bootstrap.ts — do not reinstate.
//
// Writers:
//   createConsoleAuditWriter()  — dev default, logs to stdout
//   createNoopAuditWriter()     — for tests
//   createDbAuditWriter(db)     — DEPRECATED: was inserts into log.audit_log

import type { Kysely } from "kysely";

export type AuditLevel = "info" | "warn" | "error";
export type AuditActorKind = "system" | "user" | "service";

export interface AuditActor {
  kind: AuditActorKind;
  id?: string;
  realmKey?: string;
  tenantKey?: string;
  orgKey?: string;
}

export interface AuditEvent {
  ts: string; // ISO timestamp
  type: string; // dot-namespaced event name, e.g. "server.boot.start"
  level: AuditLevel;
  actor: AuditActor;
  requestId?: string;
  message?: string;
  meta?: Record<string, unknown>;
}

export interface AuditWriter {
  write(event: AuditEvent): void | Promise<void>;
  flush?(): Promise<void>;
}

/** Auto-stamps ts; accepts the same fields as AuditEvent minus ts. */
export function makeAuditEvent(data: Omit<AuditEvent, "ts">): AuditEvent {
  return { ts: new Date().toISOString(), ...data };
}

export function createConsoleAuditWriter(): AuditWriter {
  return {
    write(event: AuditEvent) {
      console.log(`[audit] ${event.ts} ${event.level} ${event.type}`, {
        actor: event.actor,
        requestId: event.requestId,
        message: event.message,
        meta: event.meta,
      });
    },
  };
}

export function createNoopAuditWriter(): AuditWriter {
  return {
    write(_event: AuditEvent) {
      // intentionally noop
    },
    async flush() {
      // noop
    },
  };
}

/**
 * Production audit writer — inserts lifecycle events into log.audit_log.
 *
 * Maps AuditEvent fields onto the full log.audit_log schema:
 *   entity_type  ← event.type (dot-namespaced, e.g. "server.boot.start")
 *   entity_id    ← actor.id (UUID) or nil UUID for system events
 *   operation    ← "status_change" for lifecycle events
 *   actor_id     ← actor.id
 *   actor_type   ← actor.kind
 *   new_values   ← event.meta serialised
 *   request_id   ← event.requestId
 *
 * Errors are swallowed so a failing DB write never kills the server.
 * Use createConsoleAuditWriter() in local dev (LOG_LEVEL=debug surfaces these).
 */
export function createDbAuditWriter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
): AuditWriter {
  const NIL_UUID = "00000000-0000-0000-0000-000000000000";

  return {
    async write(event: AuditEvent) {
      try {
        await db
          .insertInto("log.audit_log" as never)
          .values({
            // log.audit_log is tenant-partitioned; lifecycle events are system-scoped
            // Use nil UUID as tenant_id for server-level events (no tenant context).
            tenant_id:    NIL_UUID,
            log_type:     "system",
            entity_type:  event.type,
            entity_id:    (event.actor.id ?? NIL_UUID) as never,
            operation:    "status_change",
            actor_id:     event.actor.id ?? null,
            actor_type:   event.actor.kind,
            new_values:   event.meta ? JSON.stringify(event.meta) : null,
            request_id:   event.requestId ?? null,
            created_by:   (event.actor.id ?? NIL_UUID) as never,
          } as never)
          .execute();
      } catch {
        // Swallow — DB write failure must not crash the server
      }
    },
  };
}

// ── Route-level audit helpers ─────────────────────────────────────────────────
// Used by route handlers to record entity mutations into log.audit_log.
// This is separate from AuditWriter (which handles lifecycle/boot events).

export interface RouteAuditEntry {
  tenantId: string;
  entityType: string;
  entityId: string;
  operation: "insert" | "update" | "delete" | "status_change" | "bulk_insert" | "bulk_update" | "bulk_delete" | "restore" | "archive" | "purge";
  actorId: string;
  actorType?: string;
  companyCodeId?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  changedFields?: string[];
  /**
   * Optional FK to master.change_reason_code(id). Required on high-risk
   * mutation paths (manual GL override, posting adjustment, restore from
   * snapshot). Enforced by callers, not by this writer — callers know
   * which paths are high-risk and pass the resolved code id.
   */
  reasonCode?: string | null;
  correlationId?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Derives changed_fields by diffing old vs new values.
 * Only returns keys present in new_values that differ from old_values.
 */
export function deriveChangedFields(
  oldValues: Record<string, unknown> | null | undefined,
  newValues: Record<string, unknown> | null | undefined,
): string[] {
  if (!newValues) return [];
  return Object.keys(newValues).filter(
    (k) => !oldValues || oldValues[k] !== newValues[k],
  );
}

/**
 * Inserts a single row into log.audit_log.
 * Errors are swallowed — audit failures must not break the calling route.
 */
export async function writeRouteAudit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  entry: RouteAuditEntry,
): Promise<void> {
  const changedFields =
    entry.changedFields ??
    deriveChangedFields(entry.oldValues ?? null, entry.newValues ?? null);

  try {
    await db
      .insertInto("log.audit_log" as never)
      .values({
        tenant_id:       entry.tenantId,
        log_type:        "business",
        entity_type:     entry.entityType,
        entity_id:       entry.entityId as never,
        operation:       entry.operation,
        actor_id:        entry.actorId,
        actor_type:      entry.actorType ?? "user",
        company_code_id: entry.companyCodeId ?? null,
        old_values:      entry.oldValues ? JSON.stringify(entry.oldValues) : null,
        new_values:      entry.newValues ? JSON.stringify(entry.newValues) : null,
        changed_fields:  changedFields.length > 0 ? changedFields : null,
        reason_code:     entry.reasonCode ?? null,
        correlation_id:  entry.correlationId ?? null,
        request_id:      entry.requestId ?? null,
        ip_address:      entry.ipAddress ?? null,
        user_agent:      entry.userAgent ?? null,
        created_by:      entry.actorId as never,
      } as never)
      .execute();
  } catch {
    // Swallow — audit failures must not surface to callers
  }
}
