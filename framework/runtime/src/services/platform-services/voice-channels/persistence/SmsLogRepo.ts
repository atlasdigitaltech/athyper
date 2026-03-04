/**
 * Persistence — CRUD for collab.sms_log.
 */

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

const TABLE = "collab.sms_log" as keyof DB & string;

// ── Types ────────────────────────────────────────────────────────────

export interface SmsLog {
    id: string;
    tenantId: string;
    direction: "inbound" | "outbound";
    fromNumber: string;
    toNumber: string;
    body: string;
    messageRef: string | null;
    status: string;
    crmEntityType: string | null;
    crmEntityId: string | null;
    createdAt: Date;
    createdBy: string;
    updatedAt: Date | null;
}

export interface CreateSmsLogInput {
    tenantId: string;
    direction: "inbound" | "outbound";
    fromNumber: string;
    toNumber: string;
    body: string;
    messageRef?: string;
    status?: string;
    createdBy: string;
}

export interface SmsDailyAggregate {
    date: string;
    sent: number;
    received: number;
    failed: number;
}

// ── Repository ───────────────────────────────────────────────────────

export class SmsLogRepo {
    constructor(private readonly db: Kysely<DB>) {}

    async getById(tenantId: string, id: string): Promise<SmsLog | undefined> {
        const row = await (this.db as any)
            .selectFrom(TABLE)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("id", "=", id)
            .executeTakeFirst();
        return row ? this.mapRow(row) : undefined;
    }

    async list(
        tenantId: string,
        opts?: { direction?: string; status?: string; limit?: number; offset?: number },
    ): Promise<SmsLog[]> {
        let q = (this.db as any)
            .selectFrom(TABLE)
            .selectAll()
            .where("tenant_id", "=", tenantId);

        if (opts?.direction) q = q.where("direction", "=", opts.direction);
        if (opts?.status) q = q.where("status", "=", opts.status);
        q = q.orderBy("created_at", "desc");
        if (opts?.limit) q = q.limit(opts.limit);
        if (opts?.offset) q = q.offset(opts.offset);

        const rows = await q.execute();
        return rows.map((r: any) => this.mapRow(r));
    }

    async create(input: CreateSmsLogInput): Promise<SmsLog> {
        const row = await (this.db as any)
            .insertInto(TABLE)
            .values({
                tenant_id: input.tenantId,
                direction: input.direction,
                from_number: input.fromNumber,
                to_number: input.toNumber,
                body: input.body,
                message_ref: input.messageRef ?? null,
                status: input.status ?? "queued",
                created_by: input.createdBy,
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        return this.mapRow(row);
    }

    async updateStatus(tenantId: string, id: string, status: string, messageRef?: string): Promise<void> {
        const values: Record<string, unknown> = {
            status,
            updated_at: new Date(),
        };
        if (messageRef) values.message_ref = messageRef;

        await (this.db as any)
            .updateTable(TABLE)
            .set(values)
            .where("tenant_id", "=", tenantId)
            .where("id", "=", id)
            .execute();
    }

    async updateCrmLink(
        tenantId: string,
        id: string,
        entityType: string,
        entityId: string,
    ): Promise<void> {
        await (this.db as any)
            .updateTable(TABLE)
            .set({
                crm_entity_type: entityType,
                crm_entity_id: entityId,
                updated_at: new Date(),
            })
            .where("tenant_id", "=", tenantId)
            .where("id", "=", id)
            .execute();
    }

    async listByCrmEntity(
        tenantId: string,
        entityType: string,
        entityId: string,
    ): Promise<SmsLog[]> {
        const rows = await (this.db as any)
            .selectFrom(TABLE)
            .selectAll()
            .where("tenant_id", "=", tenantId)
            .where("crm_entity_type", "=", entityType)
            .where("crm_entity_id", "=", entityId)
            .orderBy("created_at", "desc")
            .execute();
        return rows.map((r: any) => this.mapRow(r));
    }

    async aggregateByDay(
        tenantId: string,
        from: Date,
        to: Date,
    ): Promise<SmsDailyAggregate[]> {
        const rows = await (this.db as any)
            .selectFrom(TABLE)
            .select([
                (eb: any) => eb.fn("date_trunc", ["day", eb.ref("created_at")]).as("day"),
                (eb: any) => eb.fn.count("id").filterWhere("direction", "=", "outbound").as("sent"),
                (eb: any) => eb.fn.count("id").filterWhere("direction", "=", "inbound").as("received"),
                (eb: any) => eb.fn.count("id").filterWhere("status", "=", "failed").as("failed"),
            ])
            .where("tenant_id", "=", tenantId)
            .where("created_at", ">=", from)
            .where("created_at", "<", to)
            .groupBy((eb: any) => eb.fn("date_trunc", ["day", eb.ref("created_at")]))
            .orderBy("day", "asc")
            .execute();

        return rows.map((r: any) => ({
            date: new Date(r.day).toISOString().slice(0, 10),
            sent: Number(r.sent ?? 0),
            received: Number(r.received ?? 0),
            failed: Number(r.failed ?? 0),
        }));
    }

    async countByDateRange(
        tenantId: string,
        from: Date,
        to: Date,
    ): Promise<number> {
        const result = await (this.db as any)
            .selectFrom(TABLE)
            .select((eb: any) => eb.fn.count("id").as("count"))
            .where("tenant_id", "=", tenantId)
            .where("created_at", ">=", from)
            .where("created_at", "<", to)
            .executeTakeFirst();
        return Number(result?.count ?? 0);
    }

    private mapRow(row: any): SmsLog {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            direction: row.direction,
            fromNumber: row.from_number,
            toNumber: row.to_number,
            body: row.body,
            messageRef: row.message_ref ?? null,
            status: row.status,
            crmEntityType: row.crm_entity_type ?? null,
            crmEntityId: row.crm_entity_id ?? null,
            createdAt: new Date(row.created_at),
            createdBy: row.created_by,
            updatedAt: row.updated_at ? new Date(row.updated_at) : null,
        };
    }
}
