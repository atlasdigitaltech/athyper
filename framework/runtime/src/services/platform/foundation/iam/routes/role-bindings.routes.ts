/**
 * Role Bindings Routes
 *
 * REST API for managing role assignments to principals.
 * Supports both system personas and custom roles.
 */

import { z } from "zod";

import type { Logger } from "../../../../../kernel/logger.js";
import type { NextFunction, Request, Response, Router } from "express";
import type { Kysely } from "kysely";

// ============================================================================
// Validation Schemas
// ============================================================================

const ListBindingsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  principalId: z.string().uuid().optional(),
  roleId: z.string().uuid().optional(),
  personaCode: z.string().optional(),
  ouNodeId: z.string().uuid().optional(),
  includeExpired: z.coerce.boolean().default(false),
});

const CreateBindingBodySchema = z.object({
  principalId: z.string().uuid(),
  // Either roleId (custom role) or personaCode (system persona)
  roleId: z.string().uuid().optional(),
  personaCode: z.string().optional(),
  // Optional scoping
  ouNodeId: z.string().uuid().optional(),
  moduleCode: z.string().optional(),
  // Validity period
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
}).refine(
  (data) => data.roleId || data.personaCode,
  { message: "Either roleId or personaCode must be provided" }
);

// ============================================================================
// Route Factory
// ============================================================================

export interface RoleBindingsRoutesDependencies {
  db: Kysely<any>;
  logger: Logger;
  getTenantId: (req: Request) => string;
}

/**
 * Create role bindings routes
 */
export function createRoleBindingsRoutes(
  router: Router,
  deps: RoleBindingsRoutesDependencies
): Router {
  const { db, logger, getTenantId } = deps;

  /**
   * GET /role-bindings
   * List role bindings for tenant
   */
  router.get(
    "/role-bindings",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const query = ListBindingsQuerySchema.parse(req.query);

        let qb = db
          .selectFrom("core.role_binding as rb")
          .leftJoin("core.principal as p", "p.id", "rb.principal_id")
          .leftJoin("core.principal_profile as pp", "pp.principal_id", "p.id")
          .leftJoin("core.persona as persona", "persona.code", "rb.persona_code")
          .leftJoin("core.role as r", "r.id", "rb.role_id")
          .leftJoin("core.ou_node as ou", "ou.id", "rb.ou_node_id")
          .select([
            "rb.id",
            "rb.principal_id as principalId",
            "p.type as principalType",
            "pp.display_name as principalDisplayName",
            "rb.persona_code as personaCode",
            "persona.name as personaName",
            "rb.role_id as roleId",
            "r.name as roleName",
            "rb.ou_node_id as ouNodeId",
            "ou.name as ouNodeName",
            "rb.module_code as moduleCode",
            "rb.valid_from as validFrom",
            "rb.valid_until as validUntil",
            "rb.created_at as createdAt",
          ])
          .where("rb.tenant_id", "=", tenantId);

        // Filter by principal
        if (query.principalId) {
          qb = qb.where("rb.principal_id", "=", query.principalId);
        }

        // Filter by role
        if (query.roleId) {
          qb = qb.where("rb.role_id", "=", query.roleId);
        }

        // Filter by persona
        if (query.personaCode) {
          qb = qb.where("rb.persona_code", "=", query.personaCode);
        }

        // Filter by OU
        if (query.ouNodeId) {
          qb = qb.where("rb.ou_node_id", "=", query.ouNodeId);
        }

        // Exclude expired bindings by default
        if (!query.includeExpired) {
          qb = qb.where((eb) =>
            eb.or([
              eb("rb.valid_until", "is", null),
              eb("rb.valid_until", ">", new Date()),
            ])
          );
        }

        const bindings = await qb
          .orderBy("rb.created_at", "desc")
          .limit(query.limit)
          .offset(query.offset)
          .execute();

        return res.json({
          data: bindings,
          pagination: {
            limit: query.limit,
            offset: query.offset,
          },
        });
      } catch (error) {
        logger.error("Failed to list role bindings", { error });
        return next(error);
      }
    }
  );

  /**
   * POST /role-bindings
   * Create a role binding
   */
  router.post(
    "/role-bindings",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);

        const parseResult = CreateBindingBodySchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            error: "INVALID_REQUEST",
            message: "Invalid request body",
            details: parseResult.error.errors,
          });
        }

        const {
          principalId,
          roleId,
          personaCode,
          ouNodeId,
          moduleCode,
          validFrom,
          validUntil,
        } = parseResult.data;

        // Verify principal exists in tenant
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

        // Verify persona exists if provided
        if (personaCode) {
          const persona = await db
            .selectFrom("core.persona")
            .select("id")
            .where("code", "=", personaCode)
            .executeTakeFirst();

          if (!persona) {
            return res.status(404).json({
              error: "NOT_FOUND",
              message: `Persona not found: ${personaCode}`,
            });
          }
        }

        // Verify role exists if provided
        if (roleId) {
          const role = await db
            .selectFrom("core.role")
            .select("id")
            .where("id", "=", roleId)
            .where("tenant_id", "=", tenantId)
            .executeTakeFirst();

          if (!role) {
            return res.status(404).json({
              error: "NOT_FOUND",
              message: `Role not found: ${roleId}`,
            });
          }
        }

        // Verify OU exists if provided
        if (ouNodeId) {
          const ouNode = await db
            .selectFrom("core.ou_node")
            .select("id")
            .where("id", "=", ouNodeId)
            .where("tenant_id", "=", tenantId)
            .executeTakeFirst();

          if (!ouNode) {
            return res.status(404).json({
              error: "NOT_FOUND",
              message: `OU node not found: ${ouNodeId}`,
            });
          }
        }

        // Verify module exists if provided
        if (moduleCode) {
          const module = await db
            .selectFrom("core.module")
            .select("id")
            .where("code", "=", moduleCode)
            .executeTakeFirst();

          if (!module) {
            return res.status(404).json({
              error: "NOT_FOUND",
              message: `Module not found: ${moduleCode}`,
            });
          }
        }

        // Check for duplicate binding
        let dupCheck = db
          .selectFrom("core.role_binding")
          .select("id")
          .where("principal_id", "=", principalId)
          .where("tenant_id", "=", tenantId);

        if (personaCode) {
          dupCheck = dupCheck.where("persona_code", "=", personaCode);
        }
        if (roleId) {
          dupCheck = dupCheck.where("role_id", "=", roleId);
        }
        if (ouNodeId) {
          dupCheck = dupCheck.where("ou_node_id", "=", ouNodeId);
        } else {
          dupCheck = dupCheck.where("ou_node_id", "is", null);
        }
        if (moduleCode) {
          dupCheck = dupCheck.where("module_code", "=", moduleCode);
        } else {
          dupCheck = dupCheck.where("module_code", "is", null);
        }

        const existing = await dupCheck.executeTakeFirst();

        if (existing) {
          return res.status(409).json({
            error: "DUPLICATE",
            message: "Binding already exists",
            existingId: existing.id,
          });
        }

        // Create binding
        const result = await db
          .insertInto("core.role_binding")
          .values({
            principal_id: principalId,
            persona_code: personaCode || null,
            role_id: roleId || null,
            ou_node_id: ouNodeId || null,
            module_code: moduleCode || null,
            valid_from: validFrom ? new Date(validFrom) : new Date(),
            valid_until: validUntil ? new Date(validUntil) : null,
            tenant_id: tenantId,
          })
          .returning([
            "id",
            "principal_id as principalId",
            "persona_code as personaCode",
            "role_id as roleId",
            "ou_node_id as ouNodeId",
            "module_code as moduleCode",
            "valid_from as validFrom",
            "valid_until as validUntil",
            "created_at as createdAt",
          ])
          .executeTakeFirstOrThrow();

        // Invalidate entitlement cache
        await db
          .deleteFrom("core.entitlement_snapshot")
          .where("principal_id", "=", principalId)
          .execute();

        return res.status(201).json(result);
      } catch (error) {
        logger.error("Failed to create role binding", { error });
        return next(error);
      }
    }
  );

  /**
   * GET /role-bindings/:id
   * Get a specific role binding
   */
  router.get(
    "/role-bindings/:id",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const bindingId = req.params.id;

        const binding = await db
          .selectFrom("core.role_binding as rb")
          .leftJoin("core.principal as p", "p.id", "rb.principal_id")
          .leftJoin("core.principal_profile as pp", "pp.principal_id", "p.id")
          .leftJoin("core.persona as persona", "persona.code", "rb.persona_code")
          .leftJoin("core.role as r", "r.id", "rb.role_id")
          .leftJoin("core.ou_node as ou", "ou.id", "rb.ou_node_id")
          .select([
            "rb.id",
            "rb.principal_id as principalId",
            "p.type as principalType",
            "pp.display_name as principalDisplayName",
            "pp.email as principalEmail",
            "rb.persona_code as personaCode",
            "persona.name as personaName",
            "rb.role_id as roleId",
            "r.name as roleName",
            "rb.ou_node_id as ouNodeId",
            "ou.name as ouNodeName",
            "ou.path as ouPath",
            "rb.module_code as moduleCode",
            "rb.valid_from as validFrom",
            "rb.valid_until as validUntil",
            "rb.created_at as createdAt",
          ])
          .where("rb.id", "=", bindingId)
          .where("rb.tenant_id", "=", tenantId)
          .executeTakeFirst();

        if (!binding) {
          return res.status(404).json({
            error: "NOT_FOUND",
            message: `Role binding not found: ${bindingId}`,
          });
        }

        return res.json(binding);
      } catch (error) {
        logger.error("Failed to get role binding", { error });
        return next(error);
      }
    }
  );

  /**
   * DELETE /role-bindings/:id
   * Remove a role binding
   */
  router.delete(
    "/role-bindings/:id",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const bindingId = req.params.id;

        // Get binding to find principal for cache invalidation
        const binding = await db
          .selectFrom("core.role_binding")
          .select(["id", "principal_id as principalId"])
          .where("id", "=", bindingId)
          .where("tenant_id", "=", tenantId)
          .executeTakeFirst();

        if (!binding) {
          return res.status(404).json({
            error: "NOT_FOUND",
            message: `Role binding not found: ${bindingId}`,
          });
        }

        await db
          .deleteFrom("core.role_binding")
          .where("id", "=", bindingId)
          .execute();

        // Invalidate entitlement cache
        await db
          .deleteFrom("core.entitlement_snapshot")
          .where("principal_id", "=", binding.principalId)
          .execute();

        return res.status(204).send();
      } catch (error) {
        logger.error("Failed to delete role binding", { error });
        return next(error);
      }
    }
  );

  /**
   * POST /role-bindings/:id/extend
   * Extend validity period of a binding
   */
  router.post(
    "/role-bindings/:id/extend",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const bindingId = req.params.id;

        const bodySchema = z.object({
          validUntil: z.string().datetime(),
        });

        const parseResult = bodySchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            error: "INVALID_REQUEST",
            message: "Invalid request body",
            details: parseResult.error.errors,
          });
        }

        const binding = await db
          .selectFrom("core.role_binding")
          .select(["id", "valid_until as validUntil"])
          .where("id", "=", bindingId)
          .where("tenant_id", "=", tenantId)
          .executeTakeFirst();

        if (!binding) {
          return res.status(404).json({
            error: "NOT_FOUND",
            message: `Role binding not found: ${bindingId}`,
          });
        }

        const newValidUntil = new Date(parseResult.data.validUntil);

        // Don't allow shortening
        if (binding.validUntil && newValidUntil <= binding.validUntil) {
          return res.status(400).json({
            error: "INVALID_REQUEST",
            message: "New validUntil must be later than current value",
          });
        }

        const result = await db
          .updateTable("core.role_binding")
          .set({
            valid_until: newValidUntil,
            updated_at: new Date(),
          })
          .where("id", "=", bindingId)
          .returning([
            "id",
            "valid_from as validFrom",
            "valid_until as validUntil",
          ])
          .executeTakeFirstOrThrow();

        return res.json(result);
      } catch (error) {
        logger.error("Failed to extend role binding", { error });
        return next(error);
      }
    }
  );

  /**
   * POST /role-bindings/:id/revoke
   * Immediately revoke a binding (set validUntil to now)
   */
  router.post(
    "/role-bindings/:id/revoke",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const bindingId = req.params.id;

        const binding = await db
          .selectFrom("core.role_binding")
          .select(["id", "principal_id as principalId"])
          .where("id", "=", bindingId)
          .where("tenant_id", "=", tenantId)
          .executeTakeFirst();

        if (!binding) {
          return res.status(404).json({
            error: "NOT_FOUND",
            message: `Role binding not found: ${bindingId}`,
          });
        }

        const result = await db
          .updateTable("core.role_binding")
          .set({
            valid_until: new Date(),
            updated_at: new Date(),
          })
          .where("id", "=", bindingId)
          .returning([
            "id",
            "valid_from as validFrom",
            "valid_until as validUntil",
          ])
          .executeTakeFirstOrThrow();

        // Invalidate entitlement cache
        await db
          .deleteFrom("core.entitlement_snapshot")
          .where("principal_id", "=", binding.principalId)
          .execute();

        return res.json({
          ...result,
          message: "Binding revoked successfully",
        });
      } catch (error) {
        logger.error("Failed to revoke role binding", { error });
        return next(error);
      }
    }
  );

  return router;
}
