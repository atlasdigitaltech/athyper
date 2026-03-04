/**
 * NotificationDlqRepo — Kysely repo for notify.dlq
 */

import type {
    NotificationDlqEntry,
    CreateDlqEntryInput,
} from "../domain/models/NotificationDlqEntry.js";
import type { DlqEntryId } from "../domain/types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "notify.dlq" as keyof DB & string;

export class NotificationDlqRepo {
    constructor(private readonly db: Kysely<DB>) {}

    async create(input: CreateDlqEntryInput): Promise<NotificationDlqEntry> {
        const id = crypto.randomUUID();
        const now = new Date();

        await this.db
            .insertInto(TABLE as any)
            .values({
                id,
                tenant_id: input.tenantId,
                delivery_id: input.deliveryId,
                message_id: input.messageId,
                channel: input.channel,
                provider_code: input.providerCode,
                recipient_id: input.recipientId ?? null,
                recipient_addr: input.recipientAddr,
                last_error: input.lastError ?? null,
                error_category: input.errorCategory ?? null,
                attempt_count: input.attemptCount,
                payload: JSON.stringify(input.payload),
                metadata: input.metadata ? JSON.stringify(input.metadata) : null,
                dead_at: now,
                replay_count: 0,
                created_at: now,
            })
            .execute();

        return {
            id: id as unknown as DlqEntryId,
            tenantId: input.tenantId,
            deliveryId: input.deliveryId,
            messageId: input.messageId,
            channel: input.channel,
            providerCode: input.providerCode,
            recipientId: input.recipientId ?? null,
            recipientAddr: input.recipientAddr,
            lastError: input.lastError ?? null,
            errorCategory: input.errorCategory ?? null,
            attemptCount: input.attemptCount,
            payload: input.payload,
            metadata: input.metadata ?? null,
            deadAt: now,
            replayedAt: null,
            replayedBy: null,
            replayCount: 0,
            createdAt: now,
        };
    }

    async getById(tenantId: string, id: string): Promise<NotificationDlqEntry | undefined> {
        const row = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("id", "=", id)
            .executeTakeFirst();

        return row ? this.mapRow(row) : undefined;
    }

    async list(
        tenantId: string,
        options?: {
            channel?: string;
            unreplayedOnly?: boolean;
            limit?: number;
            offset?: number;
        },
    ): Promise<NotificationDlqEntry[]> {
        let query = this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("tenant_id", "=", tenantId);

        if (options?.channel) {
            query = query.where("channel", "=", options.channel);
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

    async countUnreplayed(tenantId: string): Promise<number> {
        const result = await this.db
            .selectFrom(TABLE as any)
            .select(this.db.fn.countAll().as("count"))
            .where("tenant_id", "=", tenantId)
            .where("replayed_at", "is", null)
            .executeTakeFirst();

        return Number((result as any)?.count ?? 0);
    }

    private mapRow(row: any): NotificationDlqEntry {
        return {
            id: row.id as unknown as DlqEntryId,
            tenantId: row.tenant_id,
            deliveryId: row.delivery_id,
            messageId: row.message_id,
            channel: row.channel,
            providerCode: row.provider_code,
            recipientId: row.recipient_id,
            recipientAddr: row.recipient_addr,
            lastError: row.last_error,
            errorCategory: row.error_category,
            attemptCount: row.attempt_count,
            payload: this.parseJson(row.payload) ?? {},
            metadata: this.parseJson(row.metadata),
            deadAt: new Date(row.dead_at),
            replayedAt: row.replayed_at ? new Date(row.replayed_at) : null,
            replayedBy: row.replayed_by,
            replayCount: row.replay_count,
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
