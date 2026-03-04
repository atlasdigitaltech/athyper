/**
 * Persistence — outbox pattern for wf.outbox_item.
 * Supports claim-based worker polling with SELECT FOR UPDATE SKIP LOCKED.
 */

import { sql } from "kysely";

import { DEFAULT_DELIVERY_POLICY } from "../domain/models/DeliveryPolicy.js";

import type { OutboxItem, CreateOutboxItemInput } from "../domain/models/DeliveryPolicy.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "wf.outbox_item" as keyof DB & string;

export class OutboxRepo {
    constructor(private readonly db: Kysely<DB>) {}

    async create(input: CreateOutboxItemInput): Promise<OutboxItem> {
        const row = await (this.db as any)
            .insertInto(TABLE)
            .values({
                tenant_id: input.tenantId,
                entity_type: input.entityType,
                entity_id: input.entityId,
                event_type: input.eventType,
                payload: JSON.stringify(input.payload),
                max_retries: input.maxRetries ?? DEFAULT_DELIVERY_POLICY.maxRetries,
                endpoint_id: input.endpointId ?? null,
                created_by: input.createdBy,
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        return this.mapRow(row);
    }

    /**
     * Atomically claim pending outbox items for processing.
     * Uses SELECT FOR UPDATE SKIP LOCKED to avoid contention.
     */
    async claimPending(limit: number, lockedBy: string): Promise<OutboxItem[]> {
        const result = await sql`
            UPDATE ${sql.table(TABLE)}
            SET status = 'processing',
                locked_at = now(),
                locked_by = ${lockedBy}
            WHERE id IN (
                SELECT id FROM ${sql.table(TABLE)}
                WHERE status IN ('pending', 'failed')
                  AND next_retry_at <= now()
                ORDER BY next_retry_at ASC
                LIMIT ${limit}
                FOR UPDATE SKIP LOCKED
            )
            RETURNING *
        `.execute(this.db);

        return (result.rows as any[]).map((r) => this.mapRow(r));
    }

    async markCompleted(tenantId: string, id: string): Promise<void> {
        await (this.db as any)
            .updateTable(TABLE)
            .set({ status: "completed", locked_at: null, locked_by: null })
            .where("tenant_id", "=", tenantId)
            .where("id", "=", id)
            .execute();
    }

    async markFailed(tenantId: string, id: string, error: string, nextRetryAt: Date): Promise<void> {
        // Check if we should mark dead instead
        const item = await (this.db as any)
            .selectFrom(TABLE)
            .select(["retry_count", "max_retries"])
            .where("id", "=", id)
            .executeTakeFirst();

        const newRetryCount = (item?.retry_count ?? 0) + 1;
        const isDead = newRetryCount >= (item?.max_retries ?? DEFAULT_DELIVERY_POLICY.maxRetries);

        await (this.db as any)
            .updateTable(TABLE)
            .set({
                status: isDead ? "dead" : "failed",
                retry_count: newRetryCount,
                last_error: error,
                next_retry_at: isDead ? null : nextRetryAt,
                locked_at: null,
                locked_by: null,
            })
            .where("tenant_id", "=", tenantId)
            .where("id", "=", id)
            .execute();
    }

    async markDead(tenantId: string, id: string, error: string): Promise<void> {
        await (this.db as any)
            .updateTable(TABLE)
            .set({
                status: "dead",
                last_error: error,
                locked_at: null,
                locked_by: null,
            })
            .where("tenant_id", "=", tenantId)
            .where("id", "=", id)
            .execute();
    }

    async countByStatus(tenantId: string): Promise<Record<string, number>> {
        const rows = await (this.db as any)
            .selectFrom(TABLE)
            .select(["status", sql`count(*)::int`.as("count")])
            .where("tenant_id", "=", tenantId)
            .groupBy("status")
            .execute();

        const result: Record<string, number> = {};
        for (const row of rows as any[]) {
            result[row.status] = row.count;
        }
        return result;
    }

    async list(
        tenantId: string,
        opts?: { status?: string; entityType?: string; limit?: number },
    ): Promise<OutboxItem[]> {
        let q = (this.db as any)
            .selectFrom(TABLE)
            .selectAll()
            .where("tenant_id", "=", tenantId);

        if (opts?.status) q = q.where("status", "=", opts.status);
        if (opts?.entityType) q = q.where("entity_type", "=", opts.entityType);
        q = q.orderBy("created_at", "desc");
        if (opts?.limit) q = q.limit(opts.limit);

        const rows = await q.execute();
        return rows.map((r: any) => this.mapRow(r));
    }

    private mapRow(row: any): OutboxItem {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            entityType: row.entity_type,
            entityId: row.entity_id,
            eventType: row.event_type,
            payload: this.parseJson(row.payload) ?? {},
            status: row.status,
            retryCount: row.retry_count,
            maxRetries: row.max_retries,
            nextRetryAt: new Date(row.next_retry_at),
            lockedAt: row.locked_at ? new Date(row.locked_at) : null,
            lockedBy: row.locked_by ?? null,
            lastError: row.last_error ?? null,
            endpointId: row.endpoint_id ?? null,
            createdAt: new Date(row.created_at),
            createdBy: row.created_by,
        };
    }

    private parseJson(value: unknown): Record<string, unknown> | null {
        if (value == null) return null;
        if (typeof value === "object") return value as Record<string, unknown>;
        if (typeof value === "string") {
            try { return JSON.parse(value); } catch { return null; }
        }
        return null;
    }
}
