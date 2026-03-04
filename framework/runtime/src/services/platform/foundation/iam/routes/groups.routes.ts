/**
 * Groups Routes
 *
 * REST API for managing groups and group memberships.
 */

import { z } from "zod";

import type { Logger } from "../../../../../kernel/logger.js";
import type { NextFunction, Request, Response, Router } from "express";
import type { Kysely } from "kysely";

// ============================================================================
// Validation Schemas
// ============================================================================

const ListGroupsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  source: z.enum(["idp", "local"]).optional(),
  search: z.string().optional(),
});

const CreateGroupBodySchema = z.object({
  code: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
});

const UpdateGroupBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
});

const AddMemberBodySchema = z.object({
  principalId: z.string().uuid(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
});

// ============================================================================
// Route Factory
// ============================================================================

export interface GroupsRoutesDependencies {
  db: Kysely<any>;
  logger: Logger;
  getTenantId: (req: Request) => string;
}

/**
 * Create groups routes
 */
export function createGroupsRoutes(
  router: Router,
  deps: GroupsRoutesDependencies
): Router {
  const { db, logger, getTenantId } = deps;

  /**
   * GET /groups
   * List groups for tenant
   */
  router.get(
    "/groups",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const query = ListGroupsQuerySchema.parse(req.query);

        let qb = db
          .selectFrom("core.group")
          .select([
            "id",
            "code",
            "name",
            "description",
            "source",
            "created_at as createdAt",
          ])
          .where("tenant_id", "=", tenantId);

        if (query.source) {
          qb = qb.where("source", "=", query.source);
        }

        if (query.search) {
          qb = qb.where((eb) =>
            eb.or([
              eb("code", "ilike", `%${query.search}%`),
              eb("name", "ilike", `%${query.search}%`),
            ])
          );
        }

        const groups = await qb
          .orderBy("name", "asc")
          .limit(query.limit)
          .offset(query.offset)
          .execute();

        return res.json({
          data: groups,
          pagination: {
            limit: query.limit,
            offset: query.offset,
          },
        });
      } catch (error) {
        logger.error("Failed to list groups", { error });
        return next(error);
      }
    }
  );

  /**
   * POST /groups
   * Create a local group
   */
  router.post(
    "/groups",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);

        const parseResult = CreateGroupBodySchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            error: "INVALID_REQUEST",
            message: "Invalid request body",
            details: parseResult.error.errors,
          });
        }

        const { code, name, description } = parseResult.data;

        // Check for duplicate
        const existing = await db
          .selectFrom("core.group")
          .select("id")
          .where("code", "=", code)
          .where("tenant_id", "=", tenantId)
          .executeTakeFirst();

        if (existing) {
          return res.status(409).json({
            error: "DUPLICATE",
            message: `Group with code '${code}' already exists`,
          });
        }

        const result = await db
          .insertInto("core.group")
          .values({
            code,
            name,
            description,
            source: "local",
            tenant_id: tenantId,
          })
          .returning(["id", "code", "name", "description", "source", "created_at as createdAt"])
          .executeTakeFirstOrThrow();

        return res.status(201).json(result);
      } catch (error) {
        logger.error("Failed to create group", { error });
        return next(error);
      }
    }
  );

  /**
   * GET /groups/:id
   * Get group by ID
   */
  router.get(
    "/groups/:id",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const groupId = req.params.id;

        const group = await db
          .selectFrom("core.group")
          .select([
            "id",
            "code",
            "name",
            "description",
            "source",
            "idp_ref as idpRef",
            "created_at as createdAt",
            "updated_at as updatedAt",
          ])
          .where("id", "=", groupId)
          .where("tenant_id", "=", tenantId)
          .executeTakeFirst();

        if (!group) {
          return res.status(404).json({
            error: "NOT_FOUND",
            message: `Group not found: ${groupId}`,
          });
        }

        return res.json(group);
      } catch (error) {
        logger.error("Failed to get group", { error });
        return next(error);
      }
    }
  );

  /**
   * PATCH /groups/:id
   * Update group (local groups only)
   */
  router.patch(
    "/groups/:id",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const groupId = req.params.id;

        const parseResult = UpdateGroupBodySchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            error: "INVALID_REQUEST",
            message: "Invalid request body",
            details: parseResult.error.errors,
          });
        }

        // Check group exists and is local
        const group = await db
          .selectFrom("core.group")
          .select(["id", "source"])
          .where("id", "=", groupId)
          .where("tenant_id", "=", tenantId)
          .executeTakeFirst();

        if (!group) {
          return res.status(404).json({
            error: "NOT_FOUND",
            message: `Group not found: ${groupId}`,
          });
        }

        if (group.source !== "local") {
          return res.status(403).json({
            error: "FORBIDDEN",
            message: "Cannot modify IdP-synced groups",
          });
        }

        const updates: Record<string, unknown> = {};
        if (parseResult.data.name) updates.name = parseResult.data.name;
        if (parseResult.data.description !== undefined)
          updates.description = parseResult.data.description;

        if (Object.keys(updates).length === 0) {
          return res.status(400).json({
            error: "INVALID_REQUEST",
            message: "No fields to update",
          });
        }

        updates.updated_at = new Date();

        const result = await db
          .updateTable("core.group")
          .set(updates)
          .where("id", "=", groupId)
          .returning(["id", "code", "name", "description"])
          .executeTakeFirstOrThrow();

        return res.json(result);
      } catch (error) {
        logger.error("Failed to update group", { error });
        return next(error);
      }
    }
  );

  /**
   * DELETE /groups/:id
   * Delete group (local groups only)
   */
  router.delete(
    "/groups/:id",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const groupId = req.params.id;

        // Check group exists and is local
        const group = await db
          .selectFrom("core.group")
          .select(["id", "source"])
          .where("id", "=", groupId)
          .where("tenant_id", "=", tenantId)
          .executeTakeFirst();

        if (!group) {
          return res.status(404).json({
            error: "NOT_FOUND",
            message: `Group not found: ${groupId}`,
          });
        }

        if (group.source !== "local") {
          return res.status(403).json({
            error: "FORBIDDEN",
            message: "Cannot delete IdP-synced groups",
          });
        }

        await db.deleteFrom("core.group").where("id", "=", groupId).execute();

        return res.status(204).send();
      } catch (error) {
        logger.error("Failed to delete group", { error });
        return next(error);
      }
    }
  );

  /**
   * GET /groups/:id/members
   * List group members
   */
  router.get(
    "/groups/:id/members",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const groupId = req.params.id;

        // Verify group exists
        const group = await db
          .selectFrom("core.group")
          .select("id")
          .where("id", "=", groupId)
          .where("tenant_id", "=", tenantId)
          .executeTakeFirst();

        if (!group) {
          return res.status(404).json({
            error: "NOT_FOUND",
            message: `Group not found: ${groupId}`,
          });
        }

        const members = await db
          .selectFrom("core.group_member as gm")
          .innerJoin("core.principal as p", "p.id", "gm.principal_id")
          .leftJoin("core.principal_profile as pp", "pp.principal_id", "p.id")
          .select([
            "gm.id as membershipId",
            "p.id as principalId",
            "p.type as principalType",
            "pp.display_name as displayName",
            "pp.email",
            "gm.valid_from as validFrom",
            "gm.valid_until as validUntil",
          ])
          .where("gm.group_id", "=", groupId)
          .execute();

        return res.json({ members });
      } catch (error) {
        logger.error("Failed to list group members", { error });
        return next(error);
      }
    }
  );

  /**
   * POST /groups/:id/members
   * Add member to group
   */
  router.post(
    "/groups/:id/members",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const groupId = req.params.id;

        const parseResult = AddMemberBodySchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            error: "INVALID_REQUEST",
            message: "Invalid request body",
            details: parseResult.error.errors,
          });
        }

        const { principalId, validFrom, validUntil } = parseResult.data;

        // Verify group exists and is local
        const group = await db
          .selectFrom("core.group")
          .select(["id", "source"])
          .where("id", "=", groupId)
          .where("tenant_id", "=", tenantId)
          .executeTakeFirst();

        if (!group) {
          return res.status(404).json({
            error: "NOT_FOUND",
            message: `Group not found: ${groupId}`,
          });
        }

        if (group.source !== "local") {
          return res.status(403).json({
            error: "FORBIDDEN",
            message: "Cannot modify members of IdP-synced groups",
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

        // Add membership
        const result = await db
          .insertInto("core.group_member")
          .values({
            group_id: groupId,
            principal_id: principalId,
            valid_from: validFrom ? new Date(validFrom) : new Date(),
            valid_until: validUntil ? new Date(validUntil) : null,
          })
          .onConflict((oc) =>
            oc.columns(["group_id", "principal_id"]).doUpdateSet({
              valid_from: validFrom ? new Date(validFrom) : new Date(),
              valid_until: validUntil ? new Date(validUntil) : null,
            })
          )
          .returning(["id", "group_id as groupId", "principal_id as principalId"])
          .executeTakeFirstOrThrow();

        // Invalidate entitlement cache
        await db
          .deleteFrom("core.entitlement_snapshot")
          .where("principal_id", "=", principalId)
          .execute();

        return res.status(201).json(result);
      } catch (error) {
        logger.error("Failed to add group member", { error });
        return next(error);
      }
    }
  );

  /**
   * DELETE /groups/:id/members/:principalId
   * Remove member from group
   */
  router.delete(
    "/groups/:id/members/:principalId",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const groupId = req.params.id;
        const principalId = req.params.principalId;

        // Verify group exists and is local
        const group = await db
          .selectFrom("core.group")
          .select(["id", "source"])
          .where("id", "=", groupId)
          .where("tenant_id", "=", tenantId)
          .executeTakeFirst();

        if (!group) {
          return res.status(404).json({
            error: "NOT_FOUND",
            message: `Group not found: ${groupId}`,
          });
        }

        if (group.source !== "local") {
          return res.status(403).json({
            error: "FORBIDDEN",
            message: "Cannot modify members of IdP-synced groups",
          });
        }

        await db
          .deleteFrom("core.group_member")
          .where("group_id", "=", groupId)
          .where("principal_id", "=", principalId)
          .execute();

        // Invalidate entitlement cache
        await db
          .deleteFrom("core.entitlement_snapshot")
          .where("principal_id", "=", principalId)
          .execute();

        return res.status(204).send();
      } catch (error) {
        logger.error("Failed to remove group member", { error });
        return next(error);
      }
    }
  );

  return router;
}
