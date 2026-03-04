/**
 * DelegationGrantRepo — CRUD for collab.delegation_grant table.
 *
 * All queries are tenant-scoped.
 */

import { sql } from "kysely";

import type {
    DelegationGrant,
    CreateDelegationInput,
    ShareListOptions,
} from "../domain/types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

export class DelegationGrantRepo {
    constructor(private readonly db: Kysely<DB>) {}

    async create(input: CreateDelegationInput): Promise<DelegationGrant> {
        const result = await sql<any>`
            INSERT INTO collab.delegation_grant
                (tenant_id, delegator_id, delegate_id, scope_type, scope_ref, permissions, reason, expires_at)
            VALUES
                (${input.tenantId}::uuid, ${input.delegatorId}, ${input.delegateId},
                 ${input.scopeType}, ${input.scopeRef ?? null},
                 ${sql.raw(`ARRAY[${input.permissions.map(p => `'${p}'`).join(",")}]::text[]`)},
                 ${input.reason ?? null}, ${input.expiresAt?.toISOString() ?? null}::timestamptz)
            RETURNING *
        `.execute(this.db);

        return this.toDomain(result.rows[0]);
    }

    async getById(tenantId: string, id: string): Promise<DelegationGrant | undefined> {
        const result = await sql<any>`
            SELECT * FROM collab.delegation_grant
            WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
        `.execute(this.db);

        const row = result.rows?.[0];
        return row ? this.toDomain(row) : undefined;
    }

    async listByDelegator(
        tenantId: string,
        delegatorId: string,
        opts: ShareListOptions = {},
    ): Promise<DelegationGrant[]> {
        const limit = opts.limit ?? 50;
        const offset = opts.offset ?? 0;

        const result = await sql<any>`
            SELECT * FROM collab.delegation_grant
            WHERE tenant_id = ${tenantId}::uuid
              AND delegator_id = ${delegatorId}
              AND is_revoked = false
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `.execute(this.db);

        return (result.rows ?? []).map((r: any) => this.toDomain(r));
    }

    async listByDelegate(
        tenantId: string,
        delegateId: string,
        opts: ShareListOptions = {},
    ): Promise<DelegationGrant[]> {
        const limit = opts.limit ?? 50;
        const offset = opts.offset ?? 0;

        const result = await sql<any>`
            SELECT * FROM collab.delegation_grant
            WHERE tenant_id = ${tenantId}::uuid
              AND delegate_id = ${delegateId}
              AND is_revoked = false
              AND (expires_at IS NULL OR expires_at > NOW())
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `.execute(this.db);

        return (result.rows ?? []).map((r: any) => this.toDomain(r));
    }

    async revoke(tenantId: string, id: string, revokedBy: string): Promise<boolean> {
        const result = await sql<any>`
            UPDATE collab.delegation_grant
            SET is_revoked = true, revoked_at = NOW(), revoked_by = ${revokedBy}, updated_at = NOW()
            WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid AND is_revoked = false
            RETURNING id
        `.execute(this.db);

        return (result.rows?.length ?? 0) > 0;
    }

    async revokeExpired(): Promise<number> {
        const result = await sql<any>`
            UPDATE collab.delegation_grant
            SET is_revoked = true, revoked_at = NOW(), revoked_by = 'system:expiry', updated_at = NOW()
            WHERE is_revoked = false
              AND expires_at IS NOT NULL
              AND expires_at <= NOW()
            RETURNING id
        `.execute(this.db);

        return result.rows?.length ?? 0;
    }

    async findActiveForScope(
        tenantId: string,
        delegateId: string,
        scopeType: string,
        scopeRef?: string,
    ): Promise<DelegationGrant[]> {
        const result = await sql<any>`
            SELECT * FROM collab.delegation_grant
            WHERE tenant_id = ${tenantId}::uuid
              AND delegate_id = ${delegateId}
              AND scope_type = ${scopeType}
              AND (${scopeRef ?? null}::text IS NULL OR scope_ref = ${scopeRef ?? null})
              AND is_revoked = false
              AND (expires_at IS NULL OR expires_at > NOW())
            ORDER BY created_at DESC
        `.execute(this.db);

        return (result.rows ?? []).map((r: any) => this.toDomain(r));
    }

    private toDomain(row: any): DelegationGrant {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            delegatorId: row.delegator_id,
            delegateId: row.delegate_id,
            scopeType: row.scope_type,
            scopeRef: row.scope_ref ?? undefined,
            permissions: row.permissions ?? [],
            reason: row.reason ?? undefined,
            expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
            isRevoked: row.is_revoked,
            revokedAt: row.revoked_at ? new Date(row.revoked_at) : undefined,
            revokedBy: row.revoked_by ?? undefined,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
        };
    }
}
