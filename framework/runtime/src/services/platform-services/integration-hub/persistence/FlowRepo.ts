/**
 * Persistence — CRUD for wf.integration_flow.
 */

import type {
    IntegrationFlow,
    CreateFlowInput,
    UpdateFlowInput,
} from "../domain/models/IntegrationFlow.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "wf.integration_flow" as keyof DB & string;

export class FlowRepo {
    constructor(private readonly db: Kysely<DB>) {}

    async getById(tenantId: string, id: string): Promise<IntegrationFlow | undefined> {
        const row = await (this.db as any)
            .selectFrom(TABLE)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("id", "=", id)
            .executeTakeFirst();
        return row ? this.mapRow(row) : undefined;
    }

    async getByCode(tenantId: string, code: string): Promise<IntegrationFlow | undefined> {
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
        opts?: { triggerType?: string; isActive?: boolean; limit?: number; offset?: number },
    ): Promise<IntegrationFlow[]> {
        let q = (this.db as any)
            .selectFrom(TABLE)
            .selectAll()
            .where("tenant_id", "=", tenantId);

        if (opts?.triggerType) q = q.where("trigger_type", "=", opts.triggerType);
        if (opts?.isActive !== undefined) q = q.where("is_active", "=", opts.isActive);
        q = q.orderBy("created_at", "desc");
        if (opts?.limit) q = q.limit(opts.limit);
        if (opts?.offset) q = q.offset(opts.offset);

        const rows = await q.execute();
        return rows.map((r: any) => this.mapRow(r));
    }

    async create(input: CreateFlowInput): Promise<IntegrationFlow> {
        const row = await (this.db as any)
            .insertInto(TABLE)
            .values({
                tenant_id: input.tenantId,
                code: input.code,
                name: input.name,
                description: input.description ?? null,
                steps: JSON.stringify(input.steps),
                trigger_type: input.triggerType ?? "MANUAL",
                trigger_config: JSON.stringify(input.triggerConfig ?? {}),
                created_by: input.createdBy,
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        return this.mapRow(row);
    }

    async update(tenantId: string, id: string, input: UpdateFlowInput): Promise<void> {
        const values: Record<string, unknown> = { updated_at: new Date(), updated_by: input.updatedBy };
        if (input.name !== undefined) values.name = input.name;
        if (input.description !== undefined) values.description = input.description;
        if (input.steps !== undefined) values.steps = JSON.stringify(input.steps);
        if (input.triggerType !== undefined) values.trigger_type = input.triggerType;
        if (input.triggerConfig !== undefined) values.trigger_config = JSON.stringify(input.triggerConfig);
        if (input.isActive !== undefined) values.is_active = input.isActive;

        await (this.db as any)
            .updateTable(TABLE)
            .set(values)
            .where("tenant_id", "=", tenantId)
            .where("id", "=", id)
            .execute();
    }

    async incrementVersion(tenantId: string, id: string): Promise<number> {
        const result = await (this.db as any)
            .updateTable(TABLE)
            .set((eb: any) => ({ version: eb("version", "+", 1), updated_at: new Date() }))
            .where("tenant_id", "=", tenantId)
            .where("id", "=", id)
            .returning("version")
            .executeTakeFirstOrThrow();

        return result.version as number;
    }

    async delete(tenantId: string, id: string): Promise<void> {
        await (this.db as any)
            .deleteFrom(TABLE)
            .where("tenant_id", "=", tenantId)
            .where("id", "=", id)
            .execute();
    }

    private mapRow(row: any): IntegrationFlow {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            code: row.code,
            name: row.name,
            description: row.description ?? null,
            steps: this.parseJson(row.steps) ?? [],
            triggerType: row.trigger_type,
            triggerConfig: this.parseJson(row.trigger_config) ?? {},
            isActive: row.is_active,
            version: row.version,
            createdAt: new Date(row.created_at),
            createdBy: row.created_by,
            updatedAt: row.updated_at ? new Date(row.updated_at) : null,
            updatedBy: row.updated_by ?? null,
        };
    }

    private parseJson(value: unknown): any {
        if (value == null) return null;
        if (typeof value === "object") return value;
        if (typeof value === "string") {
            try { return JSON.parse(value); } catch { return null; }
        }
        return null;
    }
}
