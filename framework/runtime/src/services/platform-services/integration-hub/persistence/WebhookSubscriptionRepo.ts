/**
 * Persistence — CRUD for wf.webhook_subscription.
 */

import { createHash } from "node:crypto";

import type {
    WebhookSubscription,
    CreateSubscriptionInput,
    UpdateSubscriptionInput,
} from "../domain/models/WebhookSubscription.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";


const TABLE = "wf.webhook_subscription" as keyof DB & string;

export class WebhookSubscriptionRepo {
    constructor(private readonly db: Kysely<DB>) {}

    async getById(tenantId: string, id: string): Promise<WebhookSubscription | undefined> {
        const row = await (this.db as any)
            .selectFrom(TABLE)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("id", "=", id)
            .executeTakeFirst();
        return row ? this.mapRow(row) : undefined;
    }

    async getByCode(tenantId: string, code: string): Promise<WebhookSubscription | undefined> {
        const row = await (this.db as any)
            .selectFrom(TABLE)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("code", "=", code)
            .executeTakeFirst();
        return row ? this.mapRow(row) : undefined;
    }

    async list(
        tenantId: string,
        opts?: { isActive?: boolean; limit?: number; offset?: number },
    ): Promise<WebhookSubscription[]> {
        let q = (this.db as any)
            .selectFrom(TABLE)
            .selectAll()
            .where("tenant_id", "=", tenantId);

        if (opts?.isActive !== undefined) q = q.where("is_active", "=", opts.isActive);
        q = q.orderBy("created_at", "desc");
        if (opts?.limit) q = q.limit(opts.limit);
        if (opts?.offset) q = q.offset(opts.offset);

        const rows = await q.execute();
        return rows.map((r: any) => this.mapRow(r));
    }

    async findByEventType(tenantId: string, eventType: string): Promise<WebhookSubscription[]> {
        const rows = await (this.db as any)
            .selectFrom(TABLE)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("is_active", "=", true)
            .where("event_types", "@>", `{${eventType}}`)
            .execute();
        return rows.map((r: any) => this.mapRow(r));
    }

    async create(input: CreateSubscriptionInput): Promise<WebhookSubscription> {
        const secretHash = createHash("sha256").update(input.secret).digest("hex");

        const row = await (this.db as any)
            .insertInto(TABLE)
            .values({
                tenant_id: input.tenantId,
                code: input.code,
                name: input.name,
                endpoint_url: input.endpointUrl,
                secret_hash: secretHash,
                event_types: input.eventTypes,
                metadata: input.metadata ? JSON.stringify(input.metadata) : null,
                created_by: input.createdBy,
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        return this.mapRow(row);
    }

    async update(tenantId: string, id: string, input: UpdateSubscriptionInput): Promise<void> {
        const values: Record<string, unknown> = { updated_at: new Date(), updated_by: input.updatedBy };
        if (input.name !== undefined) values.name = input.name;
        if (input.endpointUrl !== undefined) values.endpoint_url = input.endpointUrl;
        if (input.eventTypes !== undefined) values.event_types = input.eventTypes;
        if (input.isActive !== undefined) values.is_active = input.isActive;
        if (input.metadata !== undefined) values.metadata = input.metadata ? JSON.stringify(input.metadata) : null;

        await (this.db as any)
            .updateTable(TABLE)
            .set(values)
            .where("tenant_id", "=", tenantId)
            .where("id", "=", id)
            .execute();
    }

    async updateSecretHash(tenantId: string, id: string, newHash: string): Promise<void> {
        await (this.db as any)
            .updateTable(TABLE)
            .set({ secret_hash: newHash, updated_at: new Date() })
            .where("tenant_id", "=", tenantId)
            .where("id", "=", id)
            .execute();
    }

    async touchLastTriggered(tenantId: string, id: string): Promise<void> {
        await (this.db as any)
            .updateTable(TABLE)
            .set({ last_triggered_at: new Date() })
            .where("tenant_id", "=", tenantId)
            .where("id", "=", id)
            .execute();
    }

    async delete(tenantId: string, id: string): Promise<void> {
        await (this.db as any)
            .deleteFrom(TABLE)
            .where("tenant_id", "=", tenantId)
            .where("id", "=", id)
            .execute();
    }

    private mapRow(row: any): WebhookSubscription {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            code: row.code,
            name: row.name,
            endpointUrl: row.endpoint_url,
            secretHash: row.secret_hash,
            eventTypes: row.event_types ?? [],
            isActive: row.is_active,
            metadata: this.parseJson(row.metadata),
            lastTriggeredAt: row.last_triggered_at ? new Date(row.last_triggered_at) : null,
            createdAt: new Date(row.created_at),
            createdBy: row.created_by,
            updatedAt: row.updated_at ? new Date(row.updated_at) : null,
            updatedBy: row.updated_by ?? null,
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
