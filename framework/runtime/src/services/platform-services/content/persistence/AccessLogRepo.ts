/**
 * AccessLogRepo - Repository for high-volume file access audit trail
 *
 * Design notes:
 * - Uses BigSerial ID for performance
 * - No FK to attachment (allows independent cleanup)
 * - Optimized for write-heavy workload
 * - Consider partitioning by month for production
 */

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "doc.attachment_access_log" as keyof DB & string;

export interface CreateAccessLogParams {
  tenantId: string;
  attachmentId: string;
  actorId: string;
  action: "download" | "preview" | "metadata";
  ipAddress?: string;
  userAgent?: string;
}

export interface AccessLog {
  id: number;
  tenantId: string;
  attachmentId: string;
  actorId: string;
  action: "download" | "preview" | "metadata";
  ipAddress: string | null;
  userAgent: string | null;
  accessedAt: Date;
}

export interface AccessLogQuery {
  tenantId: string;
  attachmentId?: string;
  actorId?: string;
  action?: "download" | "preview" | "metadata";
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export class AccessLogRepo {
  constructor(private db: Kysely<DB>) {}

  /**
   * Log file access (async, high-performance)
   */
  async create(params: CreateAccessLogParams): Promise<void> {
    // Fire and forget for performance - don't wait for result
    // Use raw SQL for maximum performance
    await this.db
      .insertInto(TABLE as any)
      .values({
        tenant_id: params.tenantId,
        attachment_id: params.attachmentId,
        actor_id: params.actorId,
        action: params.action,
        ip_address: params.ipAddress ?? null,
        user_agent: params.userAgent ?? null,
        accessed_at: new Date(),
      })
      .execute();
  }

  /**
   * Batch insert for bulk logging (more efficient)
   */
  async createBatch(logs: CreateAccessLogParams[]): Promise<void> {
    if (logs.length === 0) return;

    const now = new Date();
    const values = logs.map((log) => ({
      tenant_id: log.tenantId,
      attachment_id: log.attachmentId,
      actor_id: log.actorId,
      action: log.action,
      ip_address: log.ipAddress ?? null,
      user_agent: log.userAgent ?? null,
      accessed_at: now,
    }));

    await this.db
      .insertInto(TABLE as any)
      .values(values)
      .execute();
  }

  /**
   * Query access logs with filters
   */
  async query(params: AccessLogQuery): Promise<AccessLog[]> {
    let query = this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", params.tenantId);

    if (params.attachmentId) {
      query = query.where("attachment_id", "=", params.attachmentId);
    }

    if (params.actorId) {
      query = query.where("actor_id", "=", params.actorId);
    }

    if (params.action) {
      query = query.where("action", "=", params.action);
    }

    if (params.startDate) {
      query = query.where("accessed_at", ">=", params.startDate);
    }

    if (params.endDate) {
      query = query.where("accessed_at", "<=", params.endDate);
    }

    query = query
      .orderBy("accessed_at", "desc")
      .limit(params.limit ?? 100);

    const results = await query.execute();
    return results.map((r) => this.mapToAccessLog(r));
  }

  /**
   * Get access statistics for an attachment
   */
  async getStats(
    tenantId: string,
    attachmentId: string,
  ): Promise<{ action: string; count: number }[]> {
    const results = await this.db
      .selectFrom(TABLE as any)
      .select([
        "action",
        (eb) => eb.fn.count<number>("id").as("count"),
      ])
      .where("tenant_id", "=", tenantId)
      .where("attachment_id", "=", attachmentId)
      .groupBy("action")
      .execute();

    return results.map((r) => ({
      action: r.action,
      count: Number(r.count),
    }));
  }

  /**
   * Get recent access by actor
   */
  async getRecentByActor(
    tenantId: string,
    actorId: string,
    limit = 50,
  ): Promise<AccessLog[]> {
    const results = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("actor_id", "=", actorId)
      .orderBy("accessed_at", "desc")
      .limit(limit)
      .execute();

    return results.map((r) => this.mapToAccessLog(r));
  }

  /**
   * Delete old logs (for retention policy)
   */
  async deleteOlderThan(
    tenantId: string,
    beforeDate: Date,
    batchSize = 10000,
  ): Promise<number> {
    const result = await this.db
      .deleteFrom(TABLE as any)
      .where("tenant_id", "=", tenantId)
      .where("accessed_at", "<", beforeDate)
      .limit(batchSize)
      .execute();

    return result.length > 0 ? (result[0] as any).numDeletedRows ?? 0 : 0;
  }

  /**
   * Get total count for monitoring
   */
  async getCount(tenantId: string): Promise<number> {
    const result = await this.db
      .selectFrom(TABLE as any)
      .select((eb) => eb.fn.count<number>("id").as("count"))
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();

    return result?.count ?? 0;
  }

  /**
   * Map database row to AccessLog domain object
   */
  private mapToAccessLog(row: any): AccessLog {
    return {
      id: Number(row.id),
      tenantId: row.tenant_id,
      attachmentId: row.attachment_id,
      actorId: row.actor_id,
      action: row.action,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      accessedAt: new Date(row.accessed_at),
    };
  }
}
