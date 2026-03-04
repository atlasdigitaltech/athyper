/**
 * Audit Access Report Service
 *
 * "Who saw what" — generates a report of all principals who accessed
 * a specific entity, based on field_access_log and permission_decision_log.
 */

import { sql } from "kysely";

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ============================================================================
// Types
// ============================================================================

export interface AccessReport {
  entityType: string;
  entityId: string;
  principals: PrincipalAccessSummary[];
  totalAccessCount: number;
}

export interface PrincipalAccessSummary {
  principalId: string;
  accessCount: number;
  lastAccessedAt: Date;
  accessTypes: string[];
  permissionDecisions: number;
  fieldAccesses: number;
}

export interface AccessReportOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

// ============================================================================
// Service
// ============================================================================

export class AuditAccessReportService {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Generate a "who saw what" report for an entity.
   * Queries field_access_log and permission_decision_log,
   * groups by principal, and merges results.
   */
  async generateWhoSawWhat(
    tenantId: string,
    entityType: string,
    entityId: string,
    options: AccessReportOptions = {},
  ): Promise<AccessReport> {
    const { startDate, endDate, limit = 100 } = options;

    // Query field_access_log
    const fieldAccessResult = await this.queryFieldAccess(
      tenantId, entityType, entityId, startDate, endDate,
    );

    // Query permission_decision_log
    const permissionResult = await this.queryPermissionDecisions(
      tenantId, entityType, entityId, startDate, endDate,
    );

    // Merge by principal
    const principalMap = new Map<string, PrincipalAccessSummary>();

    for (const fa of fieldAccessResult) {
      const existing = principalMap.get(fa.principalId) ?? {
        principalId: fa.principalId,
        accessCount: 0,
        lastAccessedAt: fa.lastAccessedAt,
        accessTypes: [],
        permissionDecisions: 0,
        fieldAccesses: 0,
      };

      existing.fieldAccesses += fa.count;
      existing.accessCount += fa.count;
      if (fa.lastAccessedAt > existing.lastAccessedAt) {
        existing.lastAccessedAt = fa.lastAccessedAt;
      }
      if (!existing.accessTypes.includes(fa.accessType)) {
        existing.accessTypes.push(fa.accessType);
      }

      principalMap.set(fa.principalId, existing);
    }

    for (const pd of permissionResult) {
      const existing = principalMap.get(pd.principalId) ?? {
        principalId: pd.principalId,
        accessCount: 0,
        lastAccessedAt: pd.lastDecidedAt,
        accessTypes: [],
        permissionDecisions: 0,
        fieldAccesses: 0,
      };

      existing.permissionDecisions += pd.count;
      existing.accessCount += pd.count;
      if (pd.lastDecidedAt > existing.lastAccessedAt) {
        existing.lastAccessedAt = pd.lastDecidedAt;
      }

      principalMap.set(pd.principalId, existing);
    }

    // Sort by last access (most recent first), limit
    const principals = Array.from(principalMap.values())
      .sort((a, b) => b.lastAccessedAt.getTime() - a.lastAccessedAt.getTime())
      .slice(0, limit);

    const totalAccessCount = principals.reduce((sum, p) => sum + p.accessCount, 0);

    return {
      entityType,
      entityId,
      principals,
      totalAccessCount,
    };
  }

  // --------------------------------------------------------------------------
  // Internal queries
  // --------------------------------------------------------------------------

  private async queryFieldAccess(
    tenantId: string,
    entityType: string,
    entityId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<Array<{
    principalId: string;
    accessType: string;
    count: number;
    lastAccessedAt: Date;
  }>> {
    const conditions = [
      sql`tenant_id = ${tenantId}::uuid`,
      sql`entity_type = ${entityType}`,
      sql`entity_id = ${entityId}`,
    ];
    if (startDate) conditions.push(sql`accessed_at >= ${startDate.toISOString()}::timestamptz`);
    if (endDate) conditions.push(sql`accessed_at <= ${endDate.toISOString()}::timestamptz`);

    const where = conditions.reduce((a, b) => sql`${a} AND ${b}`);

    const result = await sql<any>`
      SELECT principal_id::text as principal_id,
             access_type,
             COUNT(*) as count,
             MAX(accessed_at) as last_accessed_at
      FROM core.field_access_log
      WHERE ${where}
      GROUP BY principal_id, access_type
      ORDER BY last_accessed_at DESC
    `.execute(this.db);

    return (result.rows ?? []).map((r: any) => ({
      principalId: r.principal_id,
      accessType: r.access_type,
      count: Number(r.count),
      lastAccessedAt: new Date(r.last_accessed_at),
    }));
  }

  private async queryPermissionDecisions(
    tenantId: string,
    entityType: string,
    entityId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<Array<{
    principalId: string;
    count: number;
    lastDecidedAt: Date;
  }>> {
    const conditions = [
      sql`tenant_id = ${tenantId}::uuid`,
      sql`resource_type = ${entityType}`,
      sql`resource_id = ${entityId}`,
    ];
    if (startDate) conditions.push(sql`decided_at >= ${startDate.toISOString()}::timestamptz`);
    if (endDate) conditions.push(sql`decided_at <= ${endDate.toISOString()}::timestamptz`);

    const where = conditions.reduce((a, b) => sql`${a} AND ${b}`);

    const result = await sql<any>`
      SELECT principal_id::text as principal_id,
             COUNT(*) as count,
             MAX(decided_at) as last_decided_at
      FROM core.permission_decision_log
      WHERE ${where}
      GROUP BY principal_id
      ORDER BY last_decided_at DESC
    `.execute(this.db);

    return (result.rows ?? []).map((r: any) => ({
      principalId: r.principal_id,
      count: Number(r.count),
      lastDecidedAt: new Date(r.last_decided_at),
    }));
  }
}
