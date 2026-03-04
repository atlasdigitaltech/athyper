/**
 * NotificationSuppressionRepo — Kysely repo for notify.suppression
 */

import type {
    NotificationSuppression,
    CreateSuppressionInput,
} from "../domain/models/NotificationSuppression.js";
import type { SuppressionId, ChannelCode } from "../domain/types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "notify.suppression" as keyof DB & string;

export class NotificationSuppressionRepo {
    constructor(private readonly db: Kysely<DB>) {}

    async getById(tenantId: string, id: SuppressionId): Promise<NotificationSuppression | undefined> {
        const row = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("id", "=", id)
            .executeTakeFirst();

        return row ? this.mapRow(row) : undefined;
    }

    /**
     * Check if an address is suppressed for a channel.
     * Returns the active suppression record if found, or undefined.
     * Respects expires_at (returns undefined if expired).
     */
    async isSuppressed(
        tenantId: string,
        channel: ChannelCode,
        address: string,
    ): Promise<NotificationSuppression | undefined> {
        const row = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("channel", "=", channel)
            .where("address", "=", address)
            .where((eb: any) =>
                eb.or([
                    eb("expires_at", "is", null),
                    eb("expires_at", ">", new Date()),
                ]),
            )
            .executeTakeFirst();

        return row ? this.mapRow(row) : undefined;
    }

    async list(
        tenantId: string,
        options?: {
            channel?: ChannelCode;
            reason?: string;
            limit?: number;
            offset?: number;
        },
    ): Promise<NotificationSuppression[]> {
        let query = this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("tenant_id", "=", tenantId);

        if (options?.channel) {
            query = query.where("channel", "=", options.channel);
        }
        if (options?.reason) {
            query = query.where("reason", "=", options.reason);
        }

        query = query.orderBy("suppressed_at", "desc");
        query = query.limit(options?.limit ?? 100).offset(options?.offset ?? 0);

        const rows = await query.execute();
        return rows.map((r: any) => this.mapRow(r));
    }

    /**
     * Add a suppression entry. Uses ON CONFLICT to upsert
     * (update reason/source/metadata if the address is already suppressed).
     */
    async create(input: CreateSuppressionInput): Promise<NotificationSuppression> {
        const id = crypto.randomUUID();
        const now = new Date();

        await this.db
            .insertInto(TABLE as any)
            .values({
                id,
                tenant_id: input.tenantId,
                channel: input.channel,
                address: input.address,
                reason: input.reason,
                source: input.source ?? null,
                provider_code: input.providerCode ?? null,
                metadata: input.metadata ? JSON.stringify(input.metadata) : null,
                suppressed_at: now,
                expires_at: input.expiresAt ?? null,
                created_by_principal_id: input.createdByPrincipalId ?? null,
                created_by_service: input.createdByService ?? null,
            })
            .onConflict((oc: any) =>
                oc.columns(["tenant_id", "channel", "address"]).doUpdateSet({
                    reason: input.reason,
                    source: input.source ?? null,
                    provider_code: input.providerCode ?? null,
                    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
                    suppressed_at: now,
                    expires_at: input.expiresAt ?? null,
                }),
            )
            .execute();

        return {
            id: id as SuppressionId,
            tenantId: input.tenantId,
            channel: input.channel,
            address: input.address,
            reason: input.reason,
            source: input.source ?? null,
            providerCode: input.providerCode ?? null,
            metadata: input.metadata ?? null,
            suppressedAt: now,
            expiresAt: input.expiresAt ?? null,
            createdByPrincipalId: input.createdByPrincipalId ?? null,
            createdByService: input.createdByService ?? null,
        };
    }

    /**
     * Remove a suppression (e.g., admin un-suppresses an address).
     */
    async remove(tenantId: string, channel: ChannelCode, address: string): Promise<void> {
        await this.db
            .deleteFrom(TABLE as any)
            .where("tenant_id", "=", tenantId)
            .where("channel", "=", channel)
            .where("address", "=", address)
            .execute();
    }

    /**
     * Clean up expired suppressions.
     */
    async cleanupExpired(): Promise<number> {
        const result = await this.db
            .deleteFrom(TABLE as any)
            .where("expires_at", "is not", null)
            .where("expires_at", "<", new Date())
            .executeTakeFirst();

        return Number((result as any).numDeletedRows ?? 0);
    }

    private mapRow(row: any): NotificationSuppression {
        return {
            id: row.id as SuppressionId,
            tenantId: row.tenant_id,
            channel: row.channel,
            address: row.address,
            reason: row.reason,
            source: row.source,
            providerCode: row.provider_code,
            metadata: this.parseJson(row.metadata),
            suppressedAt: new Date(row.suppressed_at),
            expiresAt: row.expires_at ? new Date(row.expires_at) : null,
            createdByPrincipalId: row.created_by_principal_id ?? null,
            createdByService: row.created_by_service ?? null,
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
