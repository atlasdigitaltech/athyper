/**
 * Organization Units Routes
 *
 * REST API for managing OU hierarchy (materialized path tree).
 */

import { z } from "zod";

import type { Logger } from "../../../../../kernel/logger.js";
import type { NextFunction, Request, Response, Router } from "express";
import type { Kysely } from "kysely";

// ============================================================================
// Validation Schemas
// ============================================================================

const CreateOuNodeBodySchema = z.object({
  code: z.string().min(1).max(100).regex(/^[a-z][a-z0-9_-]*$/),
  name: z.string().min(1).max(255),
  parentId: z.string().uuid().optional(),
  description: z.string().max(1000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const UpdateOuNodeBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const MoveOuNodeBodySchema = z.object({
  newParentId: z.string().uuid().nullable(),
});

const AssignMemberBodySchema = z.object({
  principalId: z.string().uuid(),
  isPrimary: z.boolean().default(false),
});

// ============================================================================
// Route Factory
// ============================================================================

export interface OusRoutesDependencies {
  db: Kysely<any>;
  logger: Logger;
  getTenantId: (req: Request) => string;
}

/**
 * Create OUs routes
 */
export function createOusRoutes(
  router: Router,
  deps: OusRoutesDependencies
): Router {
  const { db, logger, getTenantId } = deps;

  /**
   * Helper: Build path for a node
   */
  async function buildPath(parentId: string | null, code: string): Promise<string> {
    if (!parentId) {
      return `/${code}/`;
    }

    const parent = await db
      .selectFrom("core.ou_node")
      .select("path")
      .where("id", "=", parentId)
      .executeTakeFirst();

    if (!parent) {
      throw new Error(`Parent OU not found: ${parentId}`);
    }

    return `${parent.path}${code}/`;
  }

  /**
   * Helper: Calculate depth from path
   */
  function getDepth(path: string): number {
    return (path.match(/\//g) || []).length - 1;
  }

  /**
   * GET /ous
   * Get OU tree for tenant
   */
  router.get(
    "/ous",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);

        const nodes = await db
          .selectFrom("core.ou_node")
          .select([
            "id",
            "code",
            "name",
            "description",
            "path",
            "depth",
            "parent_id as parentId",
            "metadata",
            "created_at as createdAt",
          ])
          .where("tenant_id", "=", tenantId)
          .orderBy("path", "asc")
          .execute();

        // Build tree structure
        const nodeMap = new Map<string, any>();
        const roots: any[] = [];

        for (const node of nodes) {
          nodeMap.set(node.id, { ...node, children: [] });
        }

        for (const node of nodes) {
          const nodeWithChildren = nodeMap.get(node.id);
          if (node.parentId && nodeMap.has(node.parentId)) {
            nodeMap.get(node.parentId).children.push(nodeWithChildren);
          } else {
            roots.push(nodeWithChildren);
          }
        }

        return res.json({
          tree: roots,
          flat: nodes,
        });
      } catch (error) {
        logger.error("Failed to get OU tree", { error });
        return next(error);
      }
    }
  );

  /**
   * POST /ous
   * Create OU node
   */
  router.post(
    "/ous",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);

        const parseResult = CreateOuNodeBodySchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            error: "INVALID_REQUEST",
            message: "Invalid request body",
            details: parseResult.error.errors,
          });
        }

        const { code, name, parentId, description, metadata } = parseResult.data;

        // Verify parent exists if provided
        if (parentId) {
          const parent = await db
            .selectFrom("core.ou_node")
            .select("id")
            .where("id", "=", parentId)
            .where("tenant_id", "=", tenantId)
            .executeTakeFirst();

          if (!parent) {
            return res.status(404).json({
              error: "NOT_FOUND",
              message: `Parent OU not found: ${parentId}`,
            });
          }
        }

        // Check for duplicate code at same level
        let dupCheckQb = db
          .selectFrom("core.ou_node")
          .select("id")
          .where("code", "=", code)
          .where("tenant_id", "=", tenantId);

        if (parentId) {
          dupCheckQb = dupCheckQb.where("parent_id", "=", parentId);
        } else {
          dupCheckQb = dupCheckQb.where("parent_id", "is", null);
        }

        const existing = await dupCheckQb.executeTakeFirst();

        if (existing) {
          return res.status(409).json({
            error: "DUPLICATE",
            message: `OU with code '${code}' already exists at this level`,
          });
        }

        const path = await buildPath(parentId || null, code);
        const depth = getDepth(path);

        const result = await db
          .insertInto("core.ou_node")
          .values({
            code,
            name,
            description,
            path,
            depth,
            parent_id: parentId || null,
            metadata: metadata ? JSON.stringify(metadata) : null,
            tenant_id: tenantId,
          })
          .returning([
            "id",
            "code",
            "name",
            "description",
            "path",
            "depth",
            "parent_id as parentId",
            "created_at as createdAt",
          ])
          .executeTakeFirstOrThrow();

        return res.status(201).json(result);
      } catch (error) {
        logger.error("Failed to create OU node", { error });
        return next(error);
      }
    }
  );

  /**
   * GET /ous/:id
   * Get OU node by ID
   */
  router.get(
    "/ous/:id",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const nodeId = req.params.id;

        const node = await db
          .selectFrom("core.ou_node")
          .select([
            "id",
            "code",
            "name",
            "description",
            "path",
            "depth",
            "parent_id as parentId",
            "metadata",
            "created_at as createdAt",
            "updated_at as updatedAt",
          ])
          .where("id", "=", nodeId)
          .where("tenant_id", "=", tenantId)
          .executeTakeFirst();

        if (!node) {
          return res.status(404).json({
            error: "NOT_FOUND",
            message: `OU node not found: ${nodeId}`,
          });
        }

        // Get children
        const children = await db
          .selectFrom("core.ou_node")
          .select(["id", "code", "name", "path"])
          .where("parent_id", "=", nodeId)
          .orderBy("name", "asc")
          .execute();

        // Get ancestors (from path)
        const pathParts = node.path.split("/").filter(Boolean);
        const ancestorPaths: string[] = [];
        let currentPath = "/";
        for (let i = 0; i < pathParts.length - 1; i++) {
          currentPath += pathParts[i] + "/";
          ancestorPaths.push(currentPath);
        }

        let ancestors: any[] = [];
        if (ancestorPaths.length > 0) {
          ancestors = await db
            .selectFrom("core.ou_node")
            .select(["id", "code", "name", "path"])
            .where("path", "in", ancestorPaths)
            .where("tenant_id", "=", tenantId)
            .orderBy("depth", "asc")
            .execute();
        }

        return res.json({
          ...node,
          children,
          ancestors,
        });
      } catch (error) {
        logger.error("Failed to get OU node", { error });
        return next(error);
      }
    }
  );

  /**
   * PATCH /ous/:id
   * Update OU node
   */
  router.patch(
    "/ous/:id",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const nodeId = req.params.id;

        const parseResult = UpdateOuNodeBodySchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            error: "INVALID_REQUEST",
            message: "Invalid request body",
            details: parseResult.error.errors,
          });
        }

        const node = await db
          .selectFrom("core.ou_node")
          .select("id")
          .where("id", "=", nodeId)
          .where("tenant_id", "=", tenantId)
          .executeTakeFirst();

        if (!node) {
          return res.status(404).json({
            error: "NOT_FOUND",
            message: `OU node not found: ${nodeId}`,
          });
        }

        const updates: Record<string, unknown> = {};
        if (parseResult.data.name) updates.name = parseResult.data.name;
        if (parseResult.data.description !== undefined)
          updates.description = parseResult.data.description;
        if (parseResult.data.metadata !== undefined)
          updates.metadata = JSON.stringify(parseResult.data.metadata);

        if (Object.keys(updates).length === 0) {
          return res.status(400).json({
            error: "INVALID_REQUEST",
            message: "No fields to update",
          });
        }

        updates.updated_at = new Date();

        const result = await db
          .updateTable("core.ou_node")
          .set(updates)
          .where("id", "=", nodeId)
          .returning(["id", "code", "name", "description", "path"])
          .executeTakeFirstOrThrow();

        return res.json(result);
      } catch (error) {
        logger.error("Failed to update OU node", { error });
        return next(error);
      }
    }
  );

  /**
   * POST /ous/:id/move
   * Move OU node to a new parent
   */
  router.post(
    "/ous/:id/move",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const nodeId = req.params.id;

        const parseResult = MoveOuNodeBodySchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            error: "INVALID_REQUEST",
            message: "Invalid request body",
            details: parseResult.error.errors,
          });
        }

        const { newParentId } = parseResult.data;

        // Get current node
        const node = await db
          .selectFrom("core.ou_node")
          .select(["id", "code", "path"])
          .where("id", "=", nodeId)
          .where("tenant_id", "=", tenantId)
          .executeTakeFirst();

        if (!node) {
          return res.status(404).json({
            error: "NOT_FOUND",
            message: `OU node not found: ${nodeId}`,
          });
        }

        // Verify new parent exists if provided
        if (newParentId) {
          const newParent = await db
            .selectFrom("core.ou_node")
            .select(["id", "path"])
            .where("id", "=", newParentId)
            .where("tenant_id", "=", tenantId)
            .executeTakeFirst();

          if (!newParent) {
            return res.status(404).json({
              error: "NOT_FOUND",
              message: `New parent OU not found: ${newParentId}`,
            });
          }

          // Prevent circular reference
          if (newParent.path.startsWith(node.path)) {
            return res.status(400).json({
              error: "INVALID_REQUEST",
              message: "Cannot move node to its own descendant",
            });
          }
        }

        // Build new path
        const oldPath = node.path;
        const newPath = await buildPath(newParentId, node.code);
        const newDepth = getDepth(newPath);

        // Update this node
        await db
          .updateTable("core.ou_node")
          .set({
            parent_id: newParentId,
            path: newPath,
            depth: newDepth,
            updated_at: new Date(),
          })
          .where("id", "=", nodeId)
          .execute();

        // Update all descendants (replace old path prefix with new)
        const descendants = await db
          .selectFrom("core.ou_node")
          .select(["id", "path"])
          .where("path", "like", `${oldPath}%`)
          .where("id", "!=", nodeId)
          .where("tenant_id", "=", tenantId)
          .execute();

        for (const desc of descendants) {
          const updatedPath = desc.path.replace(oldPath, newPath);
          const updatedDepth = getDepth(updatedPath);

          await db
            .updateTable("core.ou_node")
            .set({
              path: updatedPath,
              depth: updatedDepth,
              updated_at: new Date(),
            })
            .where("id", "=", desc.id)
            .execute();
        }

        // Invalidate entitlement cache for members of moved nodes
        await db
          .deleteFrom("core.entitlement_snapshot")
          .where(
            "principal_id",
            "in",
            db
              .selectFrom("core.ou_membership")
              .select("principal_id")
              .where("ou_node_id", "=", nodeId)
          )
          .execute();

        return res.json({
          id: nodeId,
          oldPath,
          newPath,
          descendantsUpdated: descendants.length,
        });
      } catch (error) {
        logger.error("Failed to move OU node", { error });
        return next(error);
      }
    }
  );

  /**
   * DELETE /ous/:id
   * Delete OU node (must have no children)
   */
  router.delete(
    "/ous/:id",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const nodeId = req.params.id;

        const node = await db
          .selectFrom("core.ou_node")
          .select(["id", "path"])
          .where("id", "=", nodeId)
          .where("tenant_id", "=", tenantId)
          .executeTakeFirst();

        if (!node) {
          return res.status(404).json({
            error: "NOT_FOUND",
            message: `OU node not found: ${nodeId}`,
          });
        }

        // Check for children
        const children = await db
          .selectFrom("core.ou_node")
          .select("id")
          .where("parent_id", "=", nodeId)
          .limit(1)
          .execute();

        if (children.length > 0) {
          return res.status(409).json({
            error: "CONFLICT",
            message: "Cannot delete OU with children. Remove children first.",
          });
        }

        // Check for members
        const members = await db
          .selectFrom("core.ou_membership")
          .select("id")
          .where("ou_node_id", "=", nodeId)
          .limit(1)
          .execute();

        if (members.length > 0) {
          return res.status(409).json({
            error: "CONFLICT",
            message: "Cannot delete OU with members. Remove members first.",
          });
        }

        await db.deleteFrom("core.ou_node").where("id", "=", nodeId).execute();

        return res.status(204).send();
      } catch (error) {
        logger.error("Failed to delete OU node", { error });
        return next(error);
      }
    }
  );

  /**
   * GET /ous/:id/members
   * List principals in OU
   */
  router.get(
    "/ous/:id/members",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const nodeId = req.params.id;
        const includeDescendants = req.query.includeDescendants === "true";

        // Verify OU exists
        const node = await db
          .selectFrom("core.ou_node")
          .select(["id", "path"])
          .where("id", "=", nodeId)
          .where("tenant_id", "=", tenantId)
          .executeTakeFirst();

        if (!node) {
          return res.status(404).json({
            error: "NOT_FOUND",
            message: `OU node not found: ${nodeId}`,
          });
        }

        let qb = db
          .selectFrom("core.ou_membership as om")
          .innerJoin("core.principal as p", "p.id", "om.principal_id")
          .leftJoin("core.principal_profile as pp", "pp.principal_id", "p.id")
          .innerJoin("core.ou_node as ou", "ou.id", "om.ou_node_id")
          .select([
            "om.id as membershipId",
            "p.id as principalId",
            "p.type as principalType",
            "pp.display_name as displayName",
            "pp.email",
            "om.is_primary as isPrimary",
            "ou.id as ouNodeId",
            "ou.name as ouNodeName",
            "ou.path as ouPath",
          ]);

        if (includeDescendants) {
          // Include all descendants using path prefix
          qb = qb.where("ou.path", "like", `${node.path}%`);
        } else {
          qb = qb.where("om.ou_node_id", "=", nodeId);
        }

        qb = qb.where("ou.tenant_id", "=", tenantId);

        const members = await qb.orderBy("pp.display_name", "asc").execute();

        return res.json({ members });
      } catch (error) {
        logger.error("Failed to list OU members", { error });
        return next(error);
      }
    }
  );

  /**
   * POST /ous/:id/members
   * Assign principal to OU
   */
  router.post(
    "/ous/:id/members",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const nodeId = req.params.id;

        const parseResult = AssignMemberBodySchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            error: "INVALID_REQUEST",
            message: "Invalid request body",
            details: parseResult.error.errors,
          });
        }

        const { principalId, isPrimary } = parseResult.data;

        // Verify OU exists
        const node = await db
          .selectFrom("core.ou_node")
          .select(["id", "path"])
          .where("id", "=", nodeId)
          .where("tenant_id", "=", tenantId)
          .executeTakeFirst();

        if (!node) {
          return res.status(404).json({
            error: "NOT_FOUND",
            message: `OU node not found: ${nodeId}`,
          });
        }

        // Verify principal exists
        const principal = await db
          .selectFrom("core.principal")
          .select("id")
          .where("id", "=", principalId)
          .where("tenant_id", "=", tenantId)
          .executeTakeFirst();

        if (!principal) {
          return res.status(404).json({
            error: "NOT_FOUND",
            message: `Principal not found: ${principalId}`,
          });
        }

        // If setting as primary, unset other primary memberships
        if (isPrimary) {
          await db
            .updateTable("core.ou_membership")
            .set({ is_primary: false })
            .where("principal_id", "=", principalId)
            .where("is_primary", "=", true)
            .execute();
        }

        // Upsert membership
        const result = await db
          .insertInto("core.ou_membership")
          .values({
            principal_id: principalId,
            ou_node_id: nodeId,
            ou_path: node.path,
            is_primary: isPrimary,
          })
          .onConflict((oc) =>
            oc.columns(["principal_id", "ou_node_id"]).doUpdateSet({
              is_primary: isPrimary,
              updated_at: new Date(),
            })
          )
          .returning([
            "id",
            "principal_id as principalId",
            "ou_node_id as ouNodeId",
            "ou_path as ouPath",
            "is_primary as isPrimary",
          ])
          .executeTakeFirstOrThrow();

        // Invalidate entitlement cache
        await db
          .deleteFrom("core.entitlement_snapshot")
          .where("principal_id", "=", principalId)
          .execute();

        return res.status(201).json(result);
      } catch (error) {
        logger.error("Failed to assign OU member", { error });
        return next(error);
      }
    }
  );

  /**
   * DELETE /ous/:id/members/:principalId
   * Remove principal from OU
   */
  router.delete(
    "/ous/:id/members/:principalId",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const nodeId = req.params.id;
        const principalId = req.params.principalId;

        // Verify OU exists
        const node = await db
          .selectFrom("core.ou_node")
          .select("id")
          .where("id", "=", nodeId)
          .where("tenant_id", "=", tenantId)
          .executeTakeFirst();

        if (!node) {
          return res.status(404).json({
            error: "NOT_FOUND",
            message: `OU node not found: ${nodeId}`,
          });
        }

        await db
          .deleteFrom("core.ou_membership")
          .where("ou_node_id", "=", nodeId)
          .where("principal_id", "=", principalId)
          .execute();

        // Invalidate entitlement cache
        await db
          .deleteFrom("core.entitlement_snapshot")
          .where("principal_id", "=", principalId)
          .execute();

        return res.status(204).send();
      } catch (error) {
        logger.error("Failed to remove OU member", { error });
        return next(error);
      }
    }
  );

  return router;
}
