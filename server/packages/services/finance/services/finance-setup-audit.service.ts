/**
 * Finance Setup — audit log helper.
 *
 * Writes canonical entries to log.activity_log for every mutation performed
 * through the Finance Setup Workbench. domain='finance_setup'; activity_type
 * is one of the finance_setup.* codes seeded in
 * server/db/seed/platform/000_lookups/LookupDomain/log/finance_setup_activity.sql.
 *
 * Never throws — audit failures are logged but the caller's mutation is not
 * rolled back on audit failure (audit is not the source of truth).
 */

import { sql, type Kysely } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export type FinanceSetupActivityType =
  | "finance_setup.control_assigned"
  | "finance_setup.control_updated"
  | "finance_setup.control_deactivated"
  | "finance_setup.chart_assignment_changed"
  | "finance_setup.book_assignment_changed"
  | "finance_setup.house_bank_toggled";

export interface FinanceSetupAuditEntry {
  tenantId:       string;
  actorId:        string;
  companyCodeId?: string | null;
  activityType:   FinanceSetupActivityType;
  entityType:     string;                    // e.g. 'company_code_gl_account'
  entityId:       string | null;
  detail:         Record<string, unknown>;   // arbitrary jsonb
  correlationId?: string;
}

const AUDIT_LOGGER: { warn?: (msg: string, ctx: Record<string, unknown>) => void } = {};

export function setFinanceSetupAuditLogger(logger: (msg: string, ctx: Record<string, unknown>) => void): void {
  AUDIT_LOGGER.warn = logger;
}

export async function writeFinanceSetupAudit(
  db: AnyDb,
  entry: FinanceSetupAuditEntry,
): Promise<void> {
  try {
    await sql`
      INSERT INTO log.activity_log (
        tenant_id,
        log_type,
        domain,
        activity_type,
        entity_type,
        entity_id,
        actor_id,
        actor_type,
        company_code_id,
        detail,
        correlation_id,
        created_by
      ) VALUES (
        ${entry.tenantId}::uuid,
        'business',
        'finance_setup',
        ${entry.activityType},
        ${entry.entityType},
        ${entry.entityId}::uuid,
        ${entry.actorId}::uuid,
        'user',
        ${entry.companyCodeId ?? null}::uuid,
        ${JSON.stringify(entry.detail)}::jsonb,
        ${entry.correlationId ?? null}::uuid,
        ${entry.actorId}::uuid
      )
    `.execute(db);
  } catch (err) {
    AUDIT_LOGGER.warn?.("finance_setup_audit_failed", {
      err:           String(err),
      activity_type: entry.activityType,
      entity_id:     entry.entityId,
    });
  }
}
