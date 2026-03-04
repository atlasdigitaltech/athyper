/**
 * RecordShareRepo — CRUD for collab.record_share table.
 *
 * All queries are tenant-scoped.
 */

import { sql } from "kysely";

import type {
  RecordShare,
  CreateRecordShareInput,
  ShareListOptions,
} from "../domain/types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

export class RecordShareRepo {
  constructor(private readonly db: Kysely<DB>) {}

  async create(input: CreateRecordShareInput): Promise<RecordShare> {
    const result = await sql<any>`
            INSERT INTO collab.record_share
                (tenant_id, entity_type, entity_id, shared_with_id, shared_with_type,
                 permission_level, shared_by, reason, expires_at)
            VALUES
                (${input.tenantId}::uuid, ${input.entityType}, ${input.entityId},
                 ${input.sharedWithId}, ${input.sharedWithType},
                 ${input.permissionLevel}, ${input.sharedBy},
                 ${input.reason ?? null}, ${input.expiresAt?.toISOString() ?? null}::timestamptz)
            ON CONFLICT (tenant_id, entity_type, entity_id, shared_with_id, shared_with_type)
                WHERE is_revoked = false
            DO UPDATE SET
                permission_level = EXCLUDED.permission_level,
                expires_at = EXCLUDED.expires_at,
                reason = EXCLUDED.reason,
                updated_at = NOW()
            RETURNING *
        `.execute(this.db);

    return this.toDomain(result.rows[0]);
  }

  async getById(
    tenantId: string,
    id: string,
  ): Promise<RecordShare | undefined> {
    const result = await sql<any>`
            SELECT * FROM collab.record_share
            WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
        `.execute(this.db);

    const row = result.rows?.[0];
    return row ? this.toDomain(row) : undefined;
  }

  async listForEntity(
    tenantId: string,
    entityType: string,
    entityId: string,
  ): Promise<RecordShare[]> {
    const result = await sql<any>`
            SELECT * FROM collab.record_share
            WHERE tenant_id = ${tenantId}::uuid
              AND entity_type = ${entityType}
              AND entity_id = ${entityId}
              AND is_revoked = false
              AND (expires_at IS NULL OR expires_at > NOW())
            ORDER BY created_at DESC
        `.execute(this.db);

    return (result.rows ?? []).map((r: any) => this.toDomain(r));
  }

  async listSharedWithUser(
    tenantId: string,
    userId: string,
    opts: ShareListOptions = {},
  ): Promise<RecordShare[]> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    const result = await sql<any>`
            SELECT * FROM collab.record_share
            WHERE tenant_id = ${tenantId}::uuid
              AND shared_with_id = ${userId}
              AND is_revoked = false
              AND (expires_at IS NULL OR expires_at > NOW())
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `.execute(this.db);

    return (result.rows ?? []).map((r: any) => this.toDomain(r));
  }

  async findActiveShare(
    tenantId: string,
    entityType: string,
    entityId: string,
    userId: string,
  ): Promise<RecordShare | undefined> {
    const result = await sql<any>`
            SELECT * FROM collab.record_share
            WHERE tenant_id = ${tenantId}::uuid
              AND entity_type = ${entityType}
              AND entity_id = ${entityId}
              AND shared_with_id = ${userId}
              AND is_revoked = false
              AND (expires_at IS NULL OR expires_at > NOW())
            ORDER BY
                CASE permission_level
                    WHEN 'admin' THEN 1
                    WHEN 'edit' THEN 2
                    WHEN 'view' THEN 3
                END
            LIMIT 1
        `.execute(this.db);

    const row = result.rows?.[0];
    return row ? this.toDomain(row) : undefined;
  }

  async revoke(tenantId: string, id: string): Promise<boolean> {
    const result = await sql<any>`
            UPDATE collab.record_share
            SET is_revoked = true, revoked_at = NOW(), updated_at = NOW()
            WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid AND is_revoked = false
            RETURNING id
        `.execute(this.db);

    return (result.rows?.length ?? 0) > 0;
  }

  async revokeExpired(): Promise<number> {
    const result = await sql<any>`
            UPDATE collab.record_share
            SET is_revoked = true, revoked_at = NOW(), updated_at = NOW()
            WHERE is_revoked = false
              AND expires_at IS NOT NULL
              AND expires_at <= NOW()
            RETURNING id, tenant_id, entity_type, entity_id
        `.execute(this.db);

    return result.rows?.length ?? 0;
  }

  async updatePermissionLevel(
    tenantId: string,
    id: string,
    permissionLevel: string,
  ): Promise<boolean> {
    const result = await sql<any>`
            UPDATE collab.record_share
            SET permission_level = ${permissionLevel}, updated_at = NOW()
            WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid AND is_revoked = false
            RETURNING id
        `.execute(this.db);

    return (result.rows?.length ?? 0) > 0;
  }

  private toDomain(row: any): RecordShare {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      sharedWithId: row.shared_with_id,
      sharedWithType: row.shared_with_type,
      permissionLevel: row.permission_level,
      sharedBy: row.shared_by,
      reason: row.reason ?? undefined,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      isRevoked: row.is_revoked,
      revokedAt: row.revoked_at ? new Date(row.revoked_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
