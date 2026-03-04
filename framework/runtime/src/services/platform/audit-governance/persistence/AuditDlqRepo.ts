/**
 * AuditDlqRepo — Kysely repo for core.dlq
 *
 * Dead-letter queue for audit outbox items that exceeded max retry attempts.
 * Follows the NotificationDlqRepo pattern exactly.
 */

import type { AuditDlqEntry, CreateAuditDlqInput } from "../domain/models/AuditDlqEntry.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "audit.dlq" as keyof DB & string;

export class AuditDlqRepo {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Create a new DLQ entry from a failed outbox item.
   */
  async create(input: CreateAuditDlqInput): Promise<AuditDlqEntry> {
    const id = crypto.randomUUID();
    const now = new Date();

    await this.db
      .insertInto(TABLE as any)
      .values({
        id,
        tenant_id: input.tenantId,
        outbox_id: input.outboxId,
        event_type: input.eventType,
        payload: JSON.stringify(input.payload),
        last_error: input.lastError ?? null,
        error_category: input.errorCategory ?? null,
        attempt_count: input.attemptCount,
        dead_at: now,
        replay_count: 0,
        correlation_id: input.correlationId ?? null,
        created_at: now,
      })
      .execute();

    return {
      id,
      tenantId: input.tenantId,
      outboxId: input.outboxId,
      eventType: input.eventType,
      payload: input.payload,
      lastError: input.lastError ?? null,
      errorCategory: input.errorCategory ?? null,
      attemptCount: input.attemptCount,
      deadAt: now,
      replayedAt: null,
      replayedBy: null,
      replayCount: 0,
      correlationId: input.correlationId ?? null,
      createdAt: now,
    };
  }

  /**
   * Get a single DLQ entry by ID (tenant-scoped).
   */
  async getById(tenantId: string, id: string): Promise<AuditDlqEntry | undefined> {
    const row = await this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .executeTakeFirst();

    return row ? this.mapRow(row) : undefined;
  }

  /**
   * List DLQ entries for a tenant with optional filters.
   */
  async list(
    tenantId: string,
    options?: {
      eventType?: string;
      unreplayedOnly?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<AuditDlqEntry[]> {
    let query = this.db
      .selectFrom(TABLE as any)
      .selectAll()
      .where("tenant_id", "=", tenantId);

    if (options?.eventType) {
      query = query.where("event_type", "=", options.eventType);
    }
    if (options?.unreplayedOnly) {
      query = query.where("replayed_at", "is", null);
    }

    query = query
      .orderBy("dead_at", "desc")
      .limit(options?.limit ?? 50)
      .offset(options?.offset ?? 0);

    const rows = await query.execute();
    return rows.map((r: any) => this.mapRow(r));
  }

  /**
   * Mark a DLQ entry as replayed.
   * Does NOT delete the entry — keeps it for audit trail.
   */
  async markReplayed(tenantId: string, id: string, replayedBy: string): Promise<void> {
    await this.db
      .updateTable(TABLE as any)
      .set((eb: any) => ({
        replayed_at: new Date(),
        replayed_by: replayedBy,
        replay_count: eb("replay_count", "+", 1),
      }))
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .execute();
  }

  /**
   * Count unreplayed DLQ entries for a tenant.
   */
  async countUnreplayed(tenantId: string): Promise<number> {
    const result = await this.db
      .selectFrom(TABLE as any)
      .select(this.db.fn.countAll().as("count"))
      .where("tenant_id", "=", tenantId)
      .where("replayed_at", "is", null)
      .executeTakeFirst();

    return Number((result as any)?.count ?? 0);
  }

  /**
   * Count total unreplayed entries across all tenants (for health check).
   */
  async countAllUnreplayed(): Promise<number> {
    const result = await this.db
      .selectFrom(TABLE as any)
      .select(this.db.fn.countAll().as("count"))
      .where("replayed_at", "is", null)
      .executeTakeFirst();

    return Number((result as any)?.count ?? 0);
  }

  // --------------------------------------------------------------------------
  // Row mapping
  // --------------------------------------------------------------------------

  private mapRow(row: any): AuditDlqEntry {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      outboxId: row.outbox_id,
      eventType: row.event_type,
      payload: this.parseJson(row.payload) ?? {},
      lastError: row.last_error,
      errorCategory: row.error_category,
      attemptCount: row.attempt_count,
      deadAt: new Date(row.dead_at),
      replayedAt: row.replayed_at ? new Date(row.replayed_at) : null,
      replayedBy: row.replayed_by,
      replayCount: row.replay_count,
      correlationId: row.correlation_id,
      createdAt: new Date(row.created_at),
    };
  }

  private parseJson(value: unknown): Record<string, unknown> | null {
    if (!value) return null;
    if (typeof value === "string") {
      try { return JSON.parse(value); } catch { return null; }
    }
    return value as Record<string, unknown>;
  }
}
