/**
 * Audit DSAR (Data Subject Access Request) Service
 *
 * Generates a count-only report of all audit data for a specific user
 * across all 5 audit tables. Returns metadata counts only — no raw data
 * — to support compliance workflows without exposing sensitive information.
 *
 * Logs AUDIT_DSAR_REQUESTED to core.security_event.
 */

import { sql } from "kysely";

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ============================================================================
// Types
// ============================================================================

export interface DsarResult {
  tenantId: string;
  subjectUserId: string;
  generatedAt: Date;
  tables: DsarTableSummary[];
  totalEvents: number;
  encryptedCount: number;
  redactedCount: number;
}

export interface DsarTableSummary {
  tableName: string;
  eventCount: number;
  oldestEvent: Date | null;
  newestEvent: Date | null;
}

// ============================================================================
// Service
// ============================================================================

export class AuditDsarService {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Generate a data subject report (counts only, no raw data).
   */
  async generateDataSubjectReport(
    tenantId: string,
    subjectUserId: string,
  ): Promise<DsarResult> {
    const tables: DsarTableSummary[] = [];
    let totalEvents = 0;
    let encryptedCount = 0;
    let redactedCount = 0;

    // 1. workflow_event_log
    const wae = await this.countInTable(
      "audit.workflow_event_log",
      "actor_user_id",
      tenantId,
      subjectUserId,
      "event_timestamp",
    );
    tables.push({ tableName: "workflow_event_log", ...wae });
    totalEvents += wae.eventCount;

    // Count encrypted and redacted events
    const encryptedResult = await sql<{ count: string }>`
      SELECT COUNT(*) as count FROM core.workflow_event_log
      WHERE tenant_id = ${tenantId}::uuid
        AND actor_user_id = ${subjectUserId}
        AND key_version IS NOT NULL
    `.execute(this.db);
    encryptedCount = Number(encryptedResult.rows[0]?.count ?? 0);

    const redactedResult = await sql<{ count: string }>`
      SELECT COUNT(*) as count FROM core.workflow_event_log
      WHERE tenant_id = ${tenantId}::uuid
        AND actor_user_id = ${subjectUserId}
        AND is_redacted = true
    `.execute(this.db);
    redactedCount = Number(redactedResult.rows[0]?.count ?? 0);

    // 2. permission_decision_log
    const pdl = await this.countInTable(
      "audit.permission_decision_log",
      "principal_id",
      tenantId,
      subjectUserId,
      "decided_at",
    );
    tables.push({ tableName: "permission_decision_log", ...pdl });
    totalEvents += pdl.eventCount;

    // 3. field_access_log
    const fal = await this.countInTable(
      "audit.field_access_log",
      "principal_id",
      tenantId,
      subjectUserId,
      "accessed_at",
    );
    tables.push({ tableName: "field_access_log", ...fal });
    totalEvents += fal.eventCount;

    // 4. security_event
    const se = await this.countInTable(
      "sec.security_event",
      "principal_id",
      tenantId,
      subjectUserId,
      "occurred_at",
    );
    tables.push({ tableName: "security_event", ...se });
    totalEvents += se.eventCount;

    // 5. audit_log
    const al = await this.countInTable(
      "audit.audit_log",
      "performed_by",
      tenantId,
      subjectUserId,
      "performed_at",
    );
    tables.push({ tableName: "audit_log", ...al });
    totalEvents += al.eventCount;

    // Log DSAR request to security_event
    await this.logDsarRequest(tenantId, subjectUserId, totalEvents);

    return {
      tenantId,
      subjectUserId,
      generatedAt: new Date(),
      tables,
      totalEvents,
      encryptedCount,
      redactedCount,
    };
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  private async countInTable(
    tableName: string,
    userColumn: string,
    tenantId: string,
    userId: string,
    timestampColumn: string,
  ): Promise<{ eventCount: number; oldestEvent: Date | null; newestEvent: Date | null }> {
    try {
      const result = await sql<any>`
        SELECT COUNT(*) as count,
               MIN(${sql.ref(timestampColumn)}) as oldest,
               MAX(${sql.ref(timestampColumn)}) as newest
        FROM ${sql.table(tableName)}
        WHERE tenant_id = ${tenantId}::uuid
          AND ${sql.ref(userColumn)}${userColumn === "principal_id" ? sql`::text` : sql``} = ${userId}
      `.execute(this.db);

      const row = result.rows?.[0];
      return {
        eventCount: Number(row?.count ?? 0),
        oldestEvent: row?.oldest ? new Date(row.oldest) : null,
        newestEvent: row?.newest ? new Date(row.newest) : null,
      };
    } catch {
      return { eventCount: 0, oldestEvent: null, newestEvent: null };
    }
  }

  private async logDsarRequest(
    tenantId: string,
    subjectUserId: string,
    totalEvents: number,
  ): Promise<void> {
    try {
      await sql`
        INSERT INTO core.security_event (
          id, tenant_id, event_type, severity, details, occurred_at
        ) VALUES (
          gen_random_uuid(), ${tenantId}::uuid, 'AUDIT_DSAR_REQUESTED', 'info',
          ${JSON.stringify({ subjectUserId, totalEvents })}::jsonb, now()
        )
      `.execute(this.db);
    } catch {
      // Best-effort
    }
  }
}
