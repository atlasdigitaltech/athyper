import type { Kysely } from "kysely";

export interface RouteAuditEntry {
  tenantId: string;
  entityType: string;
  entityId: string;
  operation:
    | "insert"
    | "update"
    | "delete"
    | "status_change"
    | "bulk_insert"
    | "bulk_update"
    | "bulk_delete"
    | "restore"
    | "archive"
    | "purge";
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
async function insertRouteAudit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  entry: RouteAuditEntry,
): Promise<void> {
  const changedFields =
    entry.changedFields ??
    deriveChangedFields(entry.oldValues ?? null, entry.newValues ?? null);

  await db
    .insertInto("log.audit_log" as never)
    .values({
        tenant_id: entry.tenantId,
        log_type: "business",
        entity_type: entry.entityType,
        entity_id: entry.entityId as never,
        operation: entry.operation,
        actor_id: entry.actorId,
        actor_type: entry.actorType ?? "user",
        company_code_id: entry.companyCodeId ?? null,
        old_values: entry.oldValues ? JSON.stringify(entry.oldValues) : null,
        new_values: entry.newValues ? JSON.stringify(entry.newValues) : null,
        changed_fields: changedFields.length > 0 ? changedFields : null,
        reason_code: entry.reasonCode ?? null,
        correlation_id: entry.correlationId ?? null,
        request_id: entry.requestId ?? null,
        ip_address: entry.ipAddress ?? null,
        user_agent: entry.userAgent ?? null,
        created_by: entry.actorId as never,
    } as never)
    .execute();
}

/**
 * Compatibility audit writer for non-critical legacy paths.
 *
 * Mutation transactions must use writeRequiredRouteAudit so an audit insert
 * failure aborts the business write instead of producing an unaudited commit.
 */
export async function writeRouteAudit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  entry: RouteAuditEntry,
): Promise<void> {
  try {
    await insertRouteAudit(db, entry);
  } catch {
    // Audit failures should never break request handling.
  }
}

/** Insert an audit row and propagate failures to the surrounding transaction. */
export async function writeRequiredRouteAudit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  entry: RouteAuditEntry,
): Promise<void> {
  await insertRouteAudit(db, entry);
}
