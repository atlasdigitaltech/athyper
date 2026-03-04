/**
 * Group Sync Service
 *
 * B3: Groups Model
 * Manages groups and group memberships
 *
 * Schema changes:
 * - core.group → core.principal_group (cols: id, tenant_id, code, name, description, metadata, created_at, created_by, updated_at, updated_by)
 * - core.group_member (cols: id, tenant_id, group_id, principal_id, joined_at — NO valid_from/valid_until/created_by)
 *
 * Notes:
 * - source_type, source_ref, is_active columns removed from principal_group
 * - Group source tracking now stored in metadata JSON
 *
 * Tables:
 * - core.principal_group
 * - core.group_member
 */

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

/**
 * Group source type (stored in metadata for backward compat)
 */
export type GroupSourceType = "idp" | "local" | "import";

/**
 * Group information
 */
export type GroupInfo = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  metadata: unknown | null;
};

/**
 * Group membership
 */
export type GroupMemberInfo = {
  id: string;
  groupId: string;
  principalId: string;
  joinedAt: Date;
};

/**
 * Group Sync Service
 */
export class GroupSyncService {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Sync IdP group (create or update)
   */
  async syncIdpGroup(
    tenantId: string,
    groupCode: string,
    groupName: string,
    sourceRef: string,
    createdBy: string = "system"
  ): Promise<GroupInfo> {
    // Check if exists by code
    const existing = await this.getGroupByCode(tenantId, groupCode);

    if (existing) {
      // Update name if changed
      if (existing.name !== groupName) {
        await this.db
          .updateTable("core.principal_group")
          .set({ name: groupName, updated_by: createdBy, updated_at: new Date() })
          .where("id", "=", existing.id)
          .execute();
      }
      return { ...existing, name: groupName };
    }

    // Create new
    const id = crypto.randomUUID();
    const metadata = JSON.stringify({ source_type: "idp", source_ref: sourceRef });
    await this.db
      .insertInto("core.principal_group")
      .values({
        id,
        tenant_id: tenantId,
        code: groupCode,
        name: groupName,
        description: null,
        metadata,
        created_by: createdBy,
      })
      .execute();

    console.log(
      JSON.stringify({
        msg: "idp_group_created",
        id,
        tenantId,
        code: groupCode,
        sourceRef,
      })
    );

    return {
      id,
      tenantId,
      code: groupCode,
      name: groupName,
      description: null,
      metadata: { source_type: "idp", source_ref: sourceRef },
    };
  }

  /**
   * Create local group
   */
  async createLocalGroup(
    tenantId: string,
    code: string,
    name: string,
    createdBy: string
  ): Promise<GroupInfo> {
    const id = crypto.randomUUID();
    const metadata = JSON.stringify({ source_type: "local" });
    await this.db
      .insertInto("core.principal_group")
      .values({
        id,
        tenant_id: tenantId,
        code,
        name,
        description: null,
        metadata,
        created_by: createdBy,
      })
      .execute();

    console.log(
      JSON.stringify({
        msg: "local_group_created",
        id,
        tenantId,
        code,
      })
    );

    return {
      id,
      tenantId,
      code,
      name,
      description: null,
      metadata: { source_type: "local" },
    };
  }

  /**
   * Get group by ID
   */
  async getGroup(groupId: string): Promise<GroupInfo | undefined> {
    const result = await this.db
      .selectFrom("core.principal_group")
      .select([
        "id",
        "tenant_id",
        "code",
        "name",
        "description",
        "metadata",
      ])
      .where("id", "=", groupId)
      .executeTakeFirst();

    if (!result) return undefined;

    return {
      id: result.id,
      tenantId: result.tenant_id,
      code: result.code,
      name: result.name,
      description: result.description,
      metadata: result.metadata,
    };
  }

  /**
   * Get group by code within tenant
   */
  private async getGroupByCode(
    tenantId: string,
    code: string
  ): Promise<GroupInfo | undefined> {
    const result = await this.db
      .selectFrom("core.principal_group")
      .select([
        "id",
        "tenant_id",
        "code",
        "name",
        "description",
        "metadata",
      ])
      .where("tenant_id", "=", tenantId)
      .where("code", "=", code)
      .executeTakeFirst();

    if (!result) return undefined;

    return {
      id: result.id,
      tenantId: result.tenant_id,
      code: result.code,
      name: result.name,
      description: result.description,
      metadata: result.metadata,
    };
  }

  /**
   * Sync group members (full sync)
   */
  async syncGroupMembers(
    groupId: string,
    tenantId: string,
    principalIds: string[],
    _createdBy: string = "system"
  ): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      // Get current members
      const current = await trx
        .selectFrom("core.group_member")
        .select("principal_id")
        .where("group_id", "=", groupId)
        .execute();

      const currentSet = new Set(current.map((m) => m.principal_id));
      const newSet = new Set(principalIds);

      // Remove members no longer in list
      const toRemove = [...currentSet].filter((id) => !newSet.has(id));
      if (toRemove.length > 0) {
        await trx
          .deleteFrom("core.group_member")
          .where("group_id", "=", groupId)
          .where("principal_id", "in", toRemove)
          .execute();
      }

      // Add new members
      const toAdd = principalIds.filter((id) => !currentSet.has(id));
      if (toAdd.length > 0) {
        await trx
          .insertInto("core.group_member")
          .values(
            toAdd.map((principalId) => ({
              id: crypto.randomUUID(),
              tenant_id: tenantId,
              group_id: groupId,
              principal_id: principalId,
            }))
          )
          .execute();
      }

      console.log(
        JSON.stringify({
          msg: "group_members_synced",
          groupId,
          added: toAdd.length,
          removed: toRemove.length,
        })
      );
    });
  }

  /**
   * Add member to group
   */
  async addMember(
    groupId: string,
    tenantId: string,
    principalId: string,
    _createdBy: string
  ): Promise<void> {
    await this.db
      .insertInto("core.group_member")
      .values({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        group_id: groupId,
        principal_id: principalId,
      })
      .onConflict((oc) => oc.doNothing())
      .execute();
  }

  /**
   * Remove member from group
   */
  async removeMember(groupId: string, principalId: string): Promise<void> {
    await this.db
      .deleteFrom("core.group_member")
      .where("group_id", "=", groupId)
      .where("principal_id", "=", principalId)
      .execute();
  }

  /**
   * Get groups for principal
   */
  async getPrincipalGroups(principalId: string): Promise<GroupInfo[]> {
    const results = await this.db
      .selectFrom("core.group_member as gm")
      .innerJoin("core.principal_group as g", "g.id", "gm.group_id")
      .select([
        "g.id",
        "g.tenant_id",
        "g.code",
        "g.name",
        "g.description",
        "g.metadata",
      ])
      .where("gm.principal_id", "=", principalId)
      .execute();

    return results.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      code: r.code,
      name: r.name,
      description: r.description,
      metadata: r.metadata,
    }));
  }

  /**
   * List groups by tenant
   */
  async listGroups(
    tenantId: string,
    filters?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<GroupInfo[]> {
    const query = this.db
      .selectFrom("core.principal_group")
      .select([
        "id",
        "tenant_id",
        "code",
        "name",
        "description",
        "metadata",
      ])
      .where("tenant_id", "=", tenantId);

    const results = await query
      .limit(filters?.limit ?? 100)
      .offset(filters?.offset ?? 0)
      .orderBy("name", "asc")
      .execute();

    return results.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      code: r.code,
      name: r.name,
      description: r.description,
      metadata: r.metadata,
    }));
  }
}
