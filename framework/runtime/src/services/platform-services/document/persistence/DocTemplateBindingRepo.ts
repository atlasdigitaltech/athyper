/**
 * DocTemplateBindingRepo — Kysely repo for core.doc_template_binding
 */

import type { DocTemplateBinding } from "../domain/models/DocTemplateBinding.js";
import type { TemplateBindingId, TemplateId } from "../domain/types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "doc.template_binding" as keyof DB & string;

export interface CreateBindingInput {
    tenantId: string;
    templateId: TemplateId;
    entityName: string;
    operation: string;
    variant?: string;
    priority?: number;
    createdBy: string;
}

export interface UpdateBindingInput {
    templateId?: TemplateId;
    priority?: number;
    active?: boolean;
}

export class DocTemplateBindingRepo {
    constructor(private readonly db: Kysely<DB>) {}

    async getById(id: TemplateBindingId): Promise<DocTemplateBinding | undefined> {
        const row = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("id", "=", id)
            .executeTakeFirst();
        return row ? this.mapRow(row) : undefined;
    }

    async resolve(
        tenantId: string,
        entityName: string,
        operation: string,
        variant?: string,
    ): Promise<DocTemplateBinding | undefined> {
        const row = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("entity_name", "=", entityName)
            .where("operation", "=", operation)
            .where("variant", "=", variant ?? "default")
            .where("active", "=", true)
            .orderBy("priority", "desc")
            .executeTakeFirst();
        return row ? this.mapRow(row) : undefined;
    }

    async listByTemplate(templateId: TemplateId): Promise<DocTemplateBinding[]> {
        const rows = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("template_id", "=", templateId)
            .orderBy("entity_name", "asc")
            .orderBy("operation", "asc")
            .execute();
        return rows.map((r: any) => this.mapRow(r));
    }

    async list(tenantId: string): Promise<DocTemplateBinding[]> {
        const rows = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .orderBy("entity_name", "asc")
            .orderBy("operation", "asc")
            .execute();
        return rows.map((r: any) => this.mapRow(r));
    }

    async create(input: CreateBindingInput): Promise<DocTemplateBinding> {
        const id = crypto.randomUUID();
        const now = new Date();

        await this.db
            .insertInto(TABLE as any)
            .values({
                id,
                tenant_id: input.tenantId,
                template_id: input.templateId,
                entity_name: input.entityName,
                operation: input.operation,
                variant: input.variant ?? "default",
                priority: input.priority ?? 0,
                active: true,
                created_at: now,
                created_by: input.createdBy,
            })
            .execute();

        return {
            id: id as TemplateBindingId,
            tenantId: input.tenantId,
            templateId: input.templateId,
            entityName: input.entityName,
            operation: input.operation,
            variant: input.variant ?? "default",
            priority: input.priority ?? 0,
            active: true,
            createdAt: now,
            createdBy: input.createdBy,
        };
    }

    async update(id: TemplateBindingId, input: UpdateBindingInput): Promise<void> {
        const data: Record<string, unknown> = {};
        if (input.templateId !== undefined) data.template_id = input.templateId;
        if (input.priority !== undefined) data.priority = input.priority;
        if (input.active !== undefined) data.active = input.active;

        if (Object.keys(data).length === 0) return;

        await this.db
            .updateTable(TABLE as any)
            .set(data)
            .where("id", "=", id)
            .execute();
    }

    async deactivate(id: TemplateBindingId): Promise<void> {
        await this.db
            .updateTable(TABLE as any)
            .set({ active: false })
            .where("id", "=", id)
            .execute();
    }

    private mapRow(row: any): DocTemplateBinding {
        return {
            id: row.id as TemplateBindingId,
            tenantId: row.tenant_id,
            templateId: row.template_id as TemplateId,
            entityName: row.entity_name,
            operation: row.operation,
            variant: row.variant,
            priority: row.priority,
            active: row.active,
            createdAt: new Date(row.created_at),
            createdBy: row.created_by,
        };
    }
}
