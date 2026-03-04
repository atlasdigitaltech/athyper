/**
 * NotificationProviderRepo — Kysely repo for notify.notification_provider
 */

import type {
    ProviderId,
    ChannelDefId,
    ProviderHealth,
    RateLimitConfig,
} from "../domain/types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

export interface ProviderDef {
    id: ProviderId;
    channelId: ChannelDefId;
    code: string;
    name: string;
    adapterKey: string;
    priority: number;
    isEnabled: boolean;
    config: Record<string, unknown>;
    rateLimit: RateLimitConfig | null;
    health: ProviderHealth;
    createdAt: Date;
    createdBy: string;
    updatedAt: Date | null;
    updatedBy: string | null;
}

export interface CreateProviderInput {
    channelId: ChannelDefId;
    code: string;
    name: string;
    adapterKey: string;
    priority?: number;
    config?: Record<string, unknown>;
    rateLimit?: RateLimitConfig;
    createdBy: string;
}

const TABLE = "notify.notification_provider" as keyof DB & string;

export class NotificationProviderRepo {
    constructor(private readonly db: Kysely<DB>) {}

    async getByCode(code: string): Promise<ProviderDef | undefined> {
        const row = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("code", "=", code)
            .executeTakeFirst();

        return row ? this.mapRow(row) : undefined;
    }

    /**
     * Get enabled providers for a channel, ordered by priority (lower = preferred).
     */
    async listByChannelId(channelId: ChannelDefId): Promise<ProviderDef[]> {
        const rows = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("channel_id", "=", channelId)
            .where("is_enabled", "=", true)
            .orderBy("priority", "asc")
            .execute();

        return rows.map((r: any) => this.mapRow(r));
    }

    async listAll(): Promise<ProviderDef[]> {
        const rows = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .orderBy("priority", "asc")
            .execute();

        return rows.map((r: any) => this.mapRow(r));
    }

    async create(input: CreateProviderInput): Promise<ProviderDef> {
        const id = crypto.randomUUID();
        const now = new Date();

        await this.db
            .insertInto(TABLE as any)
            .values({
                id,
                channel_id: input.channelId,
                code: input.code,
                name: input.name,
                adapter_key: input.adapterKey,
                priority: input.priority ?? 1,
                is_enabled: true,
                config: JSON.stringify(input.config ?? {}),
                rate_limit: input.rateLimit ? JSON.stringify(input.rateLimit) : null,
                health: "healthy",
                created_at: now,
                created_by: input.createdBy,
            })
            .execute();

        return {
            id: id as ProviderId,
            channelId: input.channelId,
            code: input.code,
            name: input.name,
            adapterKey: input.adapterKey,
            priority: input.priority ?? 1,
            isEnabled: true,
            config: input.config ?? {},
            rateLimit: input.rateLimit ?? null,
            health: "healthy",
            createdAt: now,
            createdBy: input.createdBy,
            updatedAt: null,
            updatedBy: null,
        };
    }

    async updateHealth(code: string, health: ProviderHealth): Promise<void> {
        await this.db
            .updateTable(TABLE as any)
            .set({ health, updated_at: new Date() })
            .where("code", "=", code)
            .execute();
    }

    async setEnabled(code: string, isEnabled: boolean, updatedBy: string): Promise<void> {
        await this.db
            .updateTable(TABLE as any)
            .set({ is_enabled: isEnabled, updated_at: new Date(), updated_by: updatedBy })
            .where("code", "=", code)
            .execute();
    }

    private mapRow(row: any): ProviderDef {
        return {
            id: row.id as ProviderId,
            channelId: row.channel_id as ChannelDefId,
            code: row.code,
            name: row.name,
            adapterKey: row.adapter_key,
            priority: row.priority,
            isEnabled: row.is_enabled,
            config: this.parseJson(row.config) ?? {},
            rateLimit: this.parseJson(row.rate_limit),
            health: row.health,
            createdAt: new Date(row.created_at),
            createdBy: row.created_by,
            updatedAt: row.updated_at ? new Date(row.updated_at) : null,
            updatedBy: row.updated_by,
        };
    }

    private parseJson(value: unknown): any {
        if (!value) return null;
        if (typeof value === "string") {
            try { return JSON.parse(value); } catch { return null; }
        }
        return value;
    }
}
