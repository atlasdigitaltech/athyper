/**
 * Principals Routes
 *
 * REST API for managing principals and their entitlements.
 */

import { z } from "zod";

import type { Logger } from "../../../../../kernel/logger.js";
import type { NextFunction, Request, Response, Router } from "express";
import type { Kysely } from "kysely";

// ============================================================================
// Validation Schemas
// ============================================================================

const ListPrincipalsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  type: z.enum(["user", "service", "external"]).optional(),
  search: z.string().optional(),
});

const SetAttributesBodySchema = z.object({
  attributes: z.record(z.unknown()),
  merge: z.boolean().default(true),
});

// ============================================================================
// Route Factory
// ============================================================================

export interface PrincipalsRoutesDependencies {
  db: Kysely<any>;
  logger: Logger;
  getTenantId: (req: Request) => string;
}

/**
 * Create principals routes
 */
export function createPrincipalsRoutes(
  router: Router,
  deps: PrincipalsRoutesDependencies
): Router {
  const { db, logger, getTenantId } = deps;

  /**
   * GET /principals/search
   * Search principals for autocomplete (optimized for @mentions)
   */
  router.get(
    "/principals/search",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const search = req.query.search as string | undefined;
        const limit = Math.min(
          Math.max(parseInt(String(req.query.limit || "10"), 10), 1),
          50
        );

        // Validate search query
        if (!search || search.trim().length < 2) {
          return res.status(400).json({
            error: "INVALID_REQUEST",
            message: "Search term must be at least 2 characters",
          });
        }

        const searchPattern = `%${search.trim()}%`;

        // Query active principals
        const results = await db
          .selectFrom("core.principal")
          .select([
            "id",
            "username",
            "display_name as displayName",
            "email",
          ])
          .where("tenant_id", "=", tenantId)
          .where("is_active", "=", true)
          .where((eb) =>
            eb.or([
              eb("username", "ilike", searchPattern),
              eb("display_name", "ilike", searchPattern),
              eb("email", "ilike", searchPattern),
            ])
          )
          .orderBy("username", "asc")
          .limit(limit)
          .execute();

        return res.json({
          ok: true,
          data: results.map((p) => ({
            id: p.id,
            username: p.username,
            displayName: p.displayName || p.username,
            email: p.email,
          })),
          meta: {
            total: results.length,
            limit,
            query: search.trim(),
          },
        });
      } catch (error) {
        logger.error("Failed to search principals", { error });
        return next(error);
      }
    }
  );

  /**
   * GET /principals
   * List principals for tenant
   */
  router.get(
    "/principals",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const query = ListPrincipalsQuerySchema.parse(req.query);

        let qb = db
          .selectFrom("core.principal as p")
          .leftJoin("core.principal_profile as pp", "pp.principal_id", "p.id")
          .select([
            "p.id",
            "p.external_id as externalId",
            "p.type",
            "p.status",
            "pp.display_name as displayName",
            "pp.email",
            "p.created_at as createdAt",
          ])
          .where("p.tenant_id", "=", tenantId);

        if (query.type) {
          qb = qb.where("p.type", "=", query.type);
        }

        if (query.search) {
          qb = qb.where((eb) =>
            eb.or([
              eb("pp.display_name", "ilike", `%${query.search}%`),
              eb("pp.email", "ilike", `%${query.search}%`),
            ])
          );
        }

        const principals = await qb
          .orderBy("p.created_at", "desc")
          .limit(query.limit)
          .offset(query.offset)
          .execute();

        return res.json({
          data: principals,
          pagination: {
            limit: query.limit,
            offset: query.offset,
          },
        });
      } catch (error) {
        logger.error("Failed to list principals", { error });
        return next(error);
      }
    }
  );

  /**
   * GET /principals/:id
   * Get principal by ID
   */
  router.get(
    "/principals/:id",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const principalId = req.params.id;

        const principal = await db
          .selectFrom("core.principal as p")
          .leftJoin("core.principal_profile as pp", "pp.principal_id", "p.id")
          .select([
            "p.id",
            "p.external_id as externalId",
            "p.type",
            "p.status",
            "pp.display_name as displayName",
            "pp.email",
            "pp.avatar_url as avatarUrl",
            "pp.locale",
            "pp.timezone",
            "p.created_at as createdAt",
            "p.updated_at as updatedAt",
          ])
          .where("p.id", "=", principalId)
          .where("p.tenant_id", "=", tenantId)
          .executeTakeFirst();

        if (!principal) {
          return res.status(404).json({
            error: "NOT_FOUND",
            message: `Principal not found: ${principalId}`,
          });
        }

        return res.json(principal);
      } catch (error) {
        logger.error("Failed to get principal", { error });
        return next(error);
      }
    }
  );

  /**
   * GET /principals/:id/entitlements
   * Get effective entitlements for a principal
   */
  router.get(
    "/principals/:id/entitlements",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const principalId = req.params.id;

        // Get cached entitlements
        const snapshot = await db
          .selectFrom("core.entitlement_snapshot")
          .select(["effective_roles", "effective_groups", "ou_path", "attributes", "expires_at"])
          .where("principal_id", "=", principalId)
          .where("tenant_id", "=", tenantId)
          .executeTakeFirst();

        if (!snapshot) {
          // No cached snapshot, compute on the fly
          const roles = await db
            .selectFrom("core.role_binding as rb")
            .innerJoin("core.role as r", "r.id", "rb.role_id")
            .select(["r.code", "rb.scope_mode as scopeMode", "rb.scope_ref as scopeRef"])
            .where("rb.principal_id", "=", principalId)
            .where("rb.tenant_id", "=", tenantId)
            .where("rb.is_active", "=", true)
            .execute();

          const groups = await db
            .selectFrom("core.group_member as gm")
            .innerJoin("core.group as g", "g.id", "gm.group_id")
            .select(["g.code", "g.name"])
            .where("gm.principal_id", "=", principalId)
            .execute();

          const attributes = await db
            .selectFrom("core.principal_attribute")
            .select(["attribute_key as key", "attribute_value as value"])
            .where("principal_id", "=", principalId)
            .execute();

          return res.json({
            cached: false,
            roles,
            groups,
            attributes: attributes.reduce(
              (acc, a) => ({ ...acc, [a.key]: a.value }),
              {}
            ),
          });
        }

        return res.json({
          cached: true,
          expiresAt: snapshot.expires_at,
          roles: snapshot.effective_roles,
          groups: snapshot.effective_groups,
          ouPath: snapshot.ou_path,
          attributes: snapshot.attributes,
        });
      } catch (error) {
        logger.error("Failed to get principal entitlements", { error });
        return next(error);
      }
    }
  );

  /**
   * GET /principals/:id/roles
   * Get role bindings for a principal
   */
  router.get(
    "/principals/:id/roles",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const principalId = req.params.id;

        const bindings = await db
          .selectFrom("core.role_binding as rb")
          .innerJoin("core.role as r", "r.id", "rb.role_id")
          .select([
            "rb.id",
            "r.code as roleCode",
            "r.name as roleName",
            "rb.scope_mode as scopeMode",
            "rb.scope_ref as scopeRef",
            "rb.valid_from as validFrom",
            "rb.valid_until as validUntil",
            "rb.is_active as isActive",
          ])
          .where("rb.principal_id", "=", principalId)
          .where("rb.tenant_id", "=", tenantId)
          .execute();

        return res.json({ bindings });
      } catch (error) {
        logger.error("Failed to get principal roles", { error });
        return next(error);
      }
    }
  );

  /**
   * GET /principals/:id/groups
   * Get group memberships for a principal
   */
  router.get(
    "/principals/:id/groups",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const principalId = req.params.id;

        const memberships = await db
          .selectFrom("core.group_member as gm")
          .innerJoin("core.group as g", "g.id", "gm.group_id")
          .select([
            "gm.id",
            "g.id as groupId",
            "g.code as groupCode",
            "g.name as groupName",
            "gm.valid_from as validFrom",
            "gm.valid_until as validUntil",
          ])
          .where("gm.principal_id", "=", principalId)
          .where("g.tenant_id", "=", tenantId)
          .execute();

        return res.json({ memberships });
      } catch (error) {
        logger.error("Failed to get principal groups", { error });
        return next(error);
      }
    }
  );

  /**
   * POST /principals/:id/attributes
   * Set ABAC attributes for a principal
   */
  router.post(
    "/principals/:id/attributes",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const principalId = req.params.id;

        const parseResult = SetAttributesBodySchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            error: "INVALID_REQUEST",
            message: "Invalid request body",
            details: parseResult.error.errors,
          });
        }

        const { attributes, merge } = parseResult.data;

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

        // If not merging, delete existing attributes
        if (!merge) {
          await db
            .deleteFrom("core.principal_attribute")
            .where("principal_id", "=", principalId)
            .execute();
        }

        // Upsert attributes
        for (const [key, value] of Object.entries(attributes)) {
          await db
            .insertInto("core.principal_attribute")
            .values({
              principal_id: principalId,
              attribute_key: key,
              attribute_value: JSON.stringify(value),
            })
            .onConflict((oc) =>
              oc
                .columns(["principal_id", "attribute_key"])
                .doUpdateSet({ attribute_value: JSON.stringify(value) })
            )
            .execute();
        }

        // Invalidate entitlement cache
        await db
          .deleteFrom("core.entitlement_snapshot")
          .where("principal_id", "=", principalId)
          .execute();

        return res.json({ success: true, message: "Attributes updated" });
      } catch (error) {
        logger.error("Failed to set principal attributes", { error });
        return next(error);
      }
    }
  );

  return router;
}
