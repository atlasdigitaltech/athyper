/**
 * OU Membership Service
 *
 * B5: OU Hierarchy & Membership
 * Manages organizational unit (OU) structure and principal membership
 *
 * Schema changes:
 * - core.ou_node → core.organizational_unit (cols: id, tenant_id, code, name, description, parent_id, metadata)
 * - core.principal_attribute removed entirely
 * - OU membership via core.principal_ou (cols: id, tenant_id, principal_id, ou_id, assigned_at, assigned_by)
 *
 * Tables:
 * - core.organizational_unit
 * - core.principal_ou
 */

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

/**
 * OU Node information
 */
export type OUNodeInfo = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  parentId: string | null;
  description: string | null;
};

/**
 * OU Membership Service
 */
export class OUMembershipService {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Create OU node
   */
  async createOUNode(request: {
    tenantId: string;
    code: string;
    name: string;
    parentId?: string;
    description?: string;
    createdBy: string;
  }): Promise<OUNodeInfo> {
    if (request.parentId) {
      const parent = await this.getOUNode(request.parentId);
      if (!parent) {
        throw new Error(`Parent OU node not found: ${request.parentId}`);
      }
    }

    const id = crypto.randomUUID();
    await this.db
      .insertInto("core.organizational_unit")
      .values({
        id,
        tenant_id: request.tenantId,
        parent_id: request.parentId ?? null,
        code: request.code,
        name: request.name,
        description: request.description ?? null,
        created_by: request.createdBy,
      })
      .execute();

    console.log(
      JSON.stringify({
        msg: "ou_node_created",
        id,
        tenantId: request.tenantId,
        code: request.code,
      })
    );

    return {
      id,
      tenantId: request.tenantId,
      code: request.code,
      name: request.name,
      parentId: request.parentId ?? null,
      description: request.description ?? null,
    };
  }

  /**
   * Get OU node by ID
   */
  async getOUNode(nodeId: string): Promise<OUNodeInfo | undefined> {
    const result = await this.db
      .selectFrom("core.organizational_unit")
      .select([
        "id",
        "tenant_id",
        "code",
        "name",
        "parent_id",
        "description",
      ])
      .where("id", "=", nodeId)
      .executeTakeFirst();

    if (!result) return undefined;

    return {
      id: result.id,
      tenantId: result.tenant_id,
      code: result.code,
      name: result.name,
      parentId: result.parent_id,
      description: result.description,
    };
  }

  /**
   * Get OU node by code
   */
  async getOUNodeByCode(
    tenantId: string,
    code: string
  ): Promise<OUNodeInfo | undefined> {
    const result = await this.db
      .selectFrom("core.organizational_unit")
      .select([
        "id",
        "tenant_id",
        "code",
        "name",
        "parent_id",
        "description",
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
      parentId: result.parent_id,
      description: result.description,
    };
  }

  /**
   * Assign principal to OU
   */
  async assignPrincipalToOU(
    principalId: string,
    tenantId: string,
    ouNodeId: string,
    assignedBy: string
  ): Promise<void> {
    const node = await this.getOUNode(ouNodeId);
    if (!node) {
      throw new Error(`OU node not found: ${ouNodeId}`);
    }

    // Remove existing OU assignment first (principal can only be in one OU)
    await this.removePrincipalFromOU(principalId, tenantId);

    // Create new OU assignment
    await this.db
      .insertInto("core.principal_ou")
      .values({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        principal_id: principalId,
        ou_id: ouNodeId,
        assigned_by: assignedBy,
      })
      .execute();

    console.log(
      JSON.stringify({
        msg: "principal_assigned_to_ou",
        principalId,
        ouNodeId,
      })
    );
  }

  /**
   * Remove principal from OU
   */
  async removePrincipalFromOU(principalId: string, tenantId: string): Promise<void> {
    await this.db
      .deleteFrom("core.principal_ou")
      .where("principal_id", "=", principalId)
      .where("tenant_id", "=", tenantId)
      .execute();

    console.log(
      JSON.stringify({
        msg: "principal_removed_from_ou",
        principalId,
      })
    );
  }

  /**
   * Get principal's OU
   */
  async getPrincipalOU(principalId: string): Promise<OUNodeInfo | undefined> {
    const assignment = await this.db
      .selectFrom("core.principal_ou")
      .select("ou_id")
      .where("principal_id", "=", principalId)
      .executeTakeFirst();

    if (!assignment) return undefined;

    return this.getOUNode(assignment.ou_id);
  }

  /**
   * List OU nodes by tenant
   */
  async listOUNodes(
    tenantId: string,
    filters?: {
      parentId?: string | null;
      limit?: number;
      offset?: number;
    }
  ): Promise<OUNodeInfo[]> {
    let query = this.db
      .selectFrom("core.organizational_unit")
      .select([
        "id",
        "tenant_id",
        "code",
        "name",
        "parent_id",
        "description",
      ])
      .where("tenant_id", "=", tenantId);

    if (filters?.parentId !== undefined) {
      if (filters.parentId === null) {
        query = query.where("parent_id", "is", null);
      } else {
        query = query.where("parent_id", "=", filters.parentId);
      }
    }

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
      parentId: r.parent_id,
      description: r.description,
    }));
  }

  /**
   * Get OU subtree (all descendants) via recursive lookup
   */
  async getOUSubtree(nodeId: string): Promise<OUNodeInfo[]> {
    const node = await this.getOUNode(nodeId);
    if (!node) return [];

    // Since there's no materialized path column, do a breadth-first traversal
    const results: OUNodeInfo[] = [node];
    const queue = [nodeId];

    while (queue.length > 0) {
      const parentId = queue.shift()!;
      const children = await this.db
        .selectFrom("core.organizational_unit")
        .select([
          "id",
          "tenant_id",
          "code",
          "name",
          "parent_id",
          "description",
        ])
        .where("tenant_id", "=", node.tenantId)
        .where("parent_id", "=", parentId)
        .execute();

      for (const child of children) {
        const childInfo: OUNodeInfo = {
          id: child.id,
          tenantId: child.tenant_id,
          code: child.code,
          name: child.name,
          parentId: child.parent_id,
          description: child.description,
        };
        results.push(childInfo);
        queue.push(child.id);
      }
    }

    return results;
  }
}
