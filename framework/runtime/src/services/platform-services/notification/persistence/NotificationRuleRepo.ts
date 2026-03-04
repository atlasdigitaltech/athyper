/**
 * NotificationRuleRepo — Kysely repo for notify.notification_rule
 */

import type {
    NotificationRule,
    CreateRuleInput,
    UpdateRuleInput,
} from "../domain/models/NotificationRule.js";
import type { RuleId } from "../domain/types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "notify.notification_rule" as keyof DB & string;

export class NotificationRuleRepo {
    constructor(private readonly db: Kysely<DB>) {}

    async getById(id: RuleId): Promise<NotificationRule | undefined> {
        const row = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("id", "=", id)
            .executeTakeFirst();

        return row ? this.mapRow(row) : undefined;
    }

    async getByCode(tenantId: string | null, code: string): Promise<NotificationRule | undefined> {
        let query = this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("code", "=", code);

        if (tenantId) {
            query = query.where("tenant_id", "=", tenantId);
        } else {
            query = query.where("tenant_id", "is", null);
        }

        const row = await query.executeTakeFirst();
        return row ? this.mapRow(row) : undefined;
    }

    /**
     * Find all enabled rules matching an event type.
     * Returns both system rules (tenant_id IS NULL) and tenant-specific rules.
     */
    async findByEventType(tenantId: string, eventType: string): Promise<NotificationRule[]> {
        const rows = await this.db
            .selectFrom(TABLE as any)
            .selectAll()
            .where("event_type", "=", eventType)
            .where("is_enabled", "=", true)
            .where((eb: any) =>
                eb.or([
                    eb("tenant_id", "is", null),
                    eb("tenant_id", "=", tenantId),
                ]),
            )
            .orderBy("sort_order", "asc")
            .execute();

        return rows.map((r: any) => this.mapRow(r));
    }

    async list(
        tenantId?: string,
        options?: {
            eventType?: string;
            isEnabled?: boolean;
            limit?: number;
            offset?: number;
        },
    ): Promise<NotificationRule[]> {
        let query = this.db
            .selectFrom(TABLE as any)
            .selectAll();

        if (tenantId) {
            query = query.where((eb: any) =>
                eb.or([
                    eb("tenant_id", "is", null),
                    eb("tenant_id", "=", tenantId),
                ]),
            );
        }
        if (options?.eventType) {
            query = query.where("event_type", "=", options.eventType);
        }
        if (options?.isEnabled !== undefined) {
            query = query.where("is_enabled", "=", options.isEnabled);
        }

        query = query.orderBy("sort_order", "asc");
        query = query.limit(options?.limit ?? 100).offset(options?.offset ?? 0);

        const rows = await query.execute();
        return rows.map((r: any) => this.mapRow(r));
    }

    async create(input: CreateRuleInput): Promise<NotificationRule> {
        const id = crypto.randomUUID();
        const now = new Date();

        await this.db
            .insertInto(TABLE as any)
            .values({
                id,
                tenant_id: input.tenantId ?? null,
                code: input.code,
                name: input.name,
                description: input.description ?? null,
                event_type: input.eventType,
                entity_type: input.entityType ?? null,
                lifecycle_state: input.lifecycleState ?? null,
                condition_expr: input.conditionExpr ? JSON.stringify(input.conditionExpr) : null,
                template_key: input.templateKey,
                channels: input.channels,
                priority: input.priority ?? "normal",
                recipient_rules: JSON.stringify(input.recipientRules),
                sla_minutes: input.slaMinutes ?? null,
                dedup_window_ms: input.dedupWindowMs ?? 300000,
                is_enabled: true,
                sort_order: input.sortOrder ?? 0,
                created_at: now,
                created_by: input.createdBy,
            })
            .execute();

        return {
            id: id as RuleId,
            tenantId: input.tenantId ?? null,
            code: input.code,
            name: input.name,
            description: input.description ?? null,
            eventType: input.eventType,
            entityType: input.entityType ?? null,
            lifecycleState: input.lifecycleState ?? null,
            conditionExpr: input.conditionExpr ?? null,
            templateKey: input.templateKey,
            channels: input.channels,
            priority: input.priority ?? "normal",
            recipientRules: input.recipientRules,
            slaMinutes: input.slaMinutes ?? null,
            dedupWindowMs: input.dedupWindowMs ?? 300000,
            isEnabled: true,
            sortOrder: input.sortOrder ?? 0,
            createdAt: now,
            createdBy: input.createdBy,
            updatedAt: null,
            updatedBy: null,
        };
    }

    async update(id: RuleId, input: UpdateRuleInput): Promise<void> {
        const data: Record<string, unknown> = {
            updated_at: new Date(),
            updated_by: input.updatedBy,
        };

        if (input.name !== undefined) data.name = input.name;
        if (input.description !== undefined) data.description = input.description;
        if (input.eventType !== undefined) data.event_type = input.eventType;
        if (input.entityType !== undefined) data.entity_type = input.entityType;
        if (input.lifecycleState !== undefined) data.lifecycle_state = input.lifecycleState;
        if (input.conditionExpr !== undefined) data.condition_expr = JSON.stringify(input.conditionExpr);
        if (input.templateKey !== undefined) data.template_key = input.templateKey;
        if (input.channels !== undefined) data.channels = input.channels;
        if (input.priority !== undefined) data.priority = input.priority;
        if (input.recipientRules !== undefined) data.recipient_rules = JSON.stringify(input.recipientRules);
        if (input.slaMinutes !== undefined) data.sla_minutes = input.slaMinutes;
        if (input.dedupWindowMs !== undefined) data.dedup_window_ms = input.dedupWindowMs;
        if (input.isEnabled !== undefined) data.is_enabled = input.isEnabled;
        if (input.sortOrder !== undefined) data.sort_order = input.sortOrder;

        await this.db
            .updateTable(TABLE as any)
            .set(data)
            .where("id", "=", id)
            .execute();
    }

    async delete(id: RuleId): Promise<void> {
        await this.db
            .deleteFrom(TABLE as any)
            .where("id", "=", id)
            .execute();
    }

    private mapRow(row: any): NotificationRule {
        return {
            id: row.id as RuleId,
            tenantId: row.tenant_id,
            code: row.code,
            name: row.name,
            description: row.description,
            eventType: row.event_type,
            entityType: row.entity_type,
            lifecycleState: row.lifecycle_state,
            conditionExpr: this.parseJson(row.condition_expr),
            templateKey: row.template_key,
            channels: row.channels,
            priority: row.priority,
            recipientRules: this.parseJson(row.recipient_rules) ?? [],
            slaMinutes: row.sla_minutes,
            dedupWindowMs: row.dedup_window_ms ?? 300000,
            isEnabled: row.is_enabled,
            sortOrder: row.sort_order,
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
