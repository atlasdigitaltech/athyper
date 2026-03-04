/**
 * AuditOutboxRepo — Kysely repo for core.audit_outbox
 *
 * Fast async ingestion buffer for audit events.
 * Worker drains outbox rows to core.workflow_event_log with retries.
 * Follows the OutboxRepo pattern from integration-hub.
 */

import { sql } from "kysely";

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ============================================================================
// Constants
// ============================================================================

const TABLE = "core.outbox" as keyof DB & string;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_BACKOFF_BASE_MS = 2000;

// ============================================================================
// Types
// ============================================================================

export interface AuditOutboxEntry {
  id: string;
  tenantId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  maxAttempts: number;
  availableAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  lastError: string | null;
  createdAt: Date;
}

// ============================================================================
// Repository
// ============================================================================

export class AuditOutboxRepo {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Enqueue an audit event into the outbox for async processing.
   * This is the fast-path: a simple INSERT that should never block workflows.
   */
  async enqueue(
    tenantId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<string> {
    const id = crypto.randomUUID();

    await this.db
      .insertInto(TABLE as any)
      .values({
        id,
        tenant_id: tenantId,
        event_type: eventType,
        payload: JSON.stringify(payload),
        status: "pending",
        attempts: 0,
        max_attempts: 5,
        available_at: new Date(),
        created_at: new Date(),
      })
      .execute();

    return id;
  }

  /**
   * Pick a batch of pending items for processing.
   * Uses SELECT ... FOR UPDATE SKIP LOCKED for safe concurrent access.
   */
  async pick(
    batchSize: number = DEFAULT_BATCH_SIZE,
    lockBy: string = "drain-worker",
  ): Promise<AuditOutboxEntry[]> {
    const now = new Date();

    // Use raw SQL for FOR UPDATE SKIP LOCKED (not supported by Kysely builder)
    const result = await sql<any>`
      UPDATE ${sql.table(TABLE)}
      SET status = 'processing',
          locked_at = ${now.toISOString()}::timestamptz,
          locked_by = ${lockBy}
      WHERE id IN (
        SELECT id FROM ${sql.table(TABLE)}
        WHERE status IN ('pending', 'failed')
          AND available_at <= ${now.toISOString()}::timestamptz
        ORDER BY available_at ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `.execute(this.db);

    return (result.rows || []).map((r: any) => this.mapRow(r));
  }

  /**
   * Mark items as successfully persisted to the audit table.
   */
  async markPersisted(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    await this.db
      .updateTable(TABLE as any)
      .set({ status: "persisted" } as any)
      .where("id", "in", ids)
      .execute();
  }

  /**
   * Mark an item as failed with exponential backoff.
   */
  async markFailed(id: string, error: string): Promise<void> {
    // Get current attempts to compute backoff
    const row = (await this.db
      .selectFrom(TABLE as any)
      .select(["attempts", "max_attempts"])
      .where("id", "=", id)
      .executeTakeFirst()) as
      | { attempts: number; max_attempts: number }
      | undefined;

    if (!row) return;

    const nextAttempts = row.attempts + 1;
    const isExhausted = nextAttempts >= row.max_attempts;

    // Exponential backoff: 2s, 4s, 8s, 16s, 32s
    const backoffMs = DEFAULT_BACKOFF_BASE_MS * Math.pow(2, nextAttempts - 1);
    const nextAvailable = new Date(Date.now() + backoffMs);

    await this.db
      .updateTable(TABLE as any)
      .set({
        status: isExhausted ? "dead" : "failed",
        attempts: nextAttempts,
        available_at: nextAvailable,
        locked_at: null,
        locked_by: null,
        last_error: error.substring(0, 2000), // Truncate long errors
      } as any)
      .where("id", "=", id)
      .execute();
  }

  /**
   * Mark items as dead (exceeded max attempts).
   */
  async markDead(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    await this.db
      .updateTable(TABLE as any)
      .set({
        status: "dead",
        locked_at: null,
        locked_by: null,
      } as any)
      .where("id", "in", ids)
      .execute();
  }

  /**
   * Count pending items in the outbox (for health check / metrics).
   */
  async countPending(): Promise<number> {
    const result = (await this.db
      .selectFrom(TABLE as any)
      .select(this.db.fn.countAll().as("count"))
      .where("status", "in", ["pending", "failed"])
      .executeTakeFirst()) as { count: string | number } | undefined;

    return Number(result?.count ?? 0);
  }

  /**
   * Count dead-letter items (for monitoring).
   */
  async countDead(): Promise<number> {
    const result = (await this.db
      .selectFrom(TABLE as any)
      .select(this.db.fn.countAll().as("count"))
      .where("status", "=", "dead")
      .executeTakeFirst()) as { count: string | number } | undefined;

    return Number(result?.count ?? 0);
  }

  /**
   * Clean up old persisted and dead items (called by retention job).
   */
  async cleanup(cutoffDate: Date): Promise<number> {
    const result = await sql<{ count: number }>`
      WITH deleted AS (
        DELETE FROM ${sql.table(TABLE)}
        WHERE status IN ('persisted', 'dead')
          AND created_at < ${cutoffDate.toISOString()}::timestamptz
        RETURNING id
      )
      SELECT COUNT(*) as count FROM deleted
    `.execute(this.db);

    return Number(result.rows[0]?.count ?? 0);
  }

  // --------------------------------------------------------------------------
  // Row mapping
  // --------------------------------------------------------------------------

  private mapRow(row: any): AuditOutboxEntry {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      eventType: row.event_type,
      payload:
        typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
      status: row.status,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      availableAt:
        row.available_at instanceof Date
          ? row.available_at
          : new Date(row.available_at),
      lockedAt: row.locked_at
        ? row.locked_at instanceof Date
          ? row.locked_at
          : new Date(row.locked_at)
        : null,
      lockedBy: row.locked_by ?? null,
      lastError: row.last_error ?? null,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at
          : new Date(row.created_at),
    };
  }
}
