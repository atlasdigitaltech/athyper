/**
 * ShareAuditService — Logs all sharing events to collab.share_audit.
 *
 * Provides append-only audit trail for sharing actions.
 */

import { sql } from "kysely";

import type {
    ShareAuditEntry,
    CreateShareAuditInput,
    ShareAuditQueryOptions,
} from "../types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

export class ShareAuditService {
    constructor(private readonly db: Kysely<DB>) {}

    async log(input: CreateShareAuditInput): Promise<void> {
        await sql`
            INSERT INTO collab.share_audit
                (tenant_id, grant_id, grant_type, action, actor_id, target_id,
                 entity_type, entity_id, details)
            VALUES
                (${input.tenantId}::uuid, ${input.grantId ?? null}::uuid,
                 ${input.grantType}, ${input.action}, ${input.actorId},
                 ${input.targetId ?? null}, ${input.entityType ?? null},
                 ${input.entityId ?? null},
                 ${input.details ? JSON.stringify(input.details) : null}::jsonb)
        `.execute(this.db);
    }

    async query(
        tenantId: string,
        opts: ShareAuditQueryOptions = {},
    ): Promise<{ entries: ShareAuditEntry[]; totalCount: number }> {
        const limit = opts.limit ?? 50;
        const offset = opts.offset ?? 0;

        // Build WHERE clauses
        const conditions: string[] = [`tenant_id = '${tenantId}'::uuid`];
        const params: unknown[] = [];

        if (opts.actorId) {
            conditions.push(`actor_id = ${sql.lit(opts.actorId)}`);
        }
        if (opts.entityType) {
            conditions.push(`entity_type = ${sql.lit(opts.entityType)}`);
        }
        if (opts.entityId) {
            conditions.push(`entity_id = ${sql.lit(opts.entityId)}`);
        }
        if (opts.action) {
            conditions.push(`action = ${sql.lit(opts.action)}`);
        }
        if (opts.startDate) {
            conditions.push(`created_at >= ${sql.lit(opts.startDate.toISOString())}::timestamptz`);
        }
        if (opts.endDate) {
            conditions.push(`created_at <= ${sql.lit(opts.endDate.toISOString())}::timestamptz`);
        }

        const whereClause = conditions.join(" AND ");

        const countResult = await sql<any>`
            SELECT count(*)::int as total FROM collab.share_audit
            WHERE ${sql.raw(whereClause)}
        `.execute(this.db);

        const totalCount = countResult.rows?.[0]?.total ?? 0;

        const result = await sql<any>`
            SELECT * FROM collab.share_audit
            WHERE ${sql.raw(whereClause)}
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `.execute(this.db);

        const entries = (result.rows ?? []).map((r: any) => this.toDomain(r));
        return { entries, totalCount };
    }

    async getForEntity(
        tenantId: string,
        entityType: string,
        entityId: string,
        opts: ShareAuditQueryOptions = {},
    ): Promise<{ entries: ShareAuditEntry[]; totalCount: number }> {
        return this.query(tenantId, { ...opts, entityType, entityId });
    }

    async getForGrant(tenantId: string, grantId: string): Promise<ShareAuditEntry[]> {
        const result = await sql<any>`
            SELECT * FROM collab.share_audit
            WHERE tenant_id = ${tenantId}::uuid AND grant_id = ${grantId}::uuid
            ORDER BY created_at DESC
        `.execute(this.db);

        return (result.rows ?? []).map((r: any) => this.toDomain(r));
    }

    private toDomain(row: any): ShareAuditEntry {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            grantId: row.grant_id ?? undefined,
            grantType: row.grant_type,
            action: row.action,
            actorId: row.actor_id,
            targetId: row.target_id ?? undefined,
            entityType: row.entity_type ?? undefined,
            entityId: row.entity_id ?? undefined,
            details: row.details ?? undefined,
            createdAt: new Date(row.created_at),
        };
    }
}
