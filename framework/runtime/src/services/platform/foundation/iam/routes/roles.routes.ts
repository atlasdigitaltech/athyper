/**
 * Roles Routes
 *
 * REST API for managing roles (personas).
 * System roles are read-only; custom roles can be created per tenant.
 */

import { z } from "zod";

import { PERSONA_CODES } from "../persona-model/types.js";

import type { Logger } from "../../../../../kernel/logger.js";
import type { NextFunction, Request, Response, Router } from "express";
import type { Kysely } from "kysely";


// ============================================================================
// Validation Schemas
// ============================================================================

const ListRolesQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  includeSystem: z.coerce.boolean().default(true),
  search: z.string().optional(),
});

const CreateRoleBodySchema = z.object({
  code: z.string().min(1).max(100).regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  scopeMode: z.enum(["tenant", "ou", "module"]).default("tenant"),
  basePersona: z.enum(PERSONA_CODES as unknown as [string, ...string[]]).optional(),
});

const UpdateRoleBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  scopeMode: z.enum(["tenant", "ou", "module"]).optional(),
});

// ============================================================================
// Route Factory
// ============================================================================

export interface RolesRoutesDependencies {
  db: Kysely<any>;
  logger: Logger;
  getTenantId: (req: Request) => string;
}

/**
 * Create roles routes
 */
export function createRolesRoutes(
  router: Router,
  deps: RolesRoutesDependencies
): Router {
  const { db, logger, getTenantId } = deps;

  /**
   * GET /roles
   * List all roles (system + custom)
   */
  router.get(
    "/roles",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const query = ListRolesQuerySchema.parse(req.query);

        // Get system personas
        let systemPersonas: Array<{
          id: string;
          code: string;
          name: string;
          description: string | null;
          scopeMode: string;
          priority: number;
          isSystem: boolean;
        }> = [];

        if (query.includeSystem) {
          const personas = await db
            .selectFrom("core.persona")
            .select([
              "id",
              "code",
              "name",
              "description",
              "scope_mode as scopeMode",
              "priority",
            ])
            .orderBy("priority", "asc")
            .execute();

          systemPersonas = personas.map((p) => ({
            ...p,
            isSystem: true,
          }));
        }

        // Get custom roles for tenant
        let customRolesQb = db
          .selectFrom("core.role")
          .select([
            "id",
            "code",
            "name",
            "description",
            "scope_mode as scopeMode",
            "base_persona as basePersona",
            "created_at as createdAt",
          ])
          .where("tenant_id", "=", tenantId);

        if (query.search) {
          customRolesQb = customRolesQb.where((eb) =>
            eb.or([
              eb("code", "ilike", `%${query.search}%`),
              eb("name", "ilike", `%${query.search}%`),
            ])
          );
        }

        const customRoles = await customRolesQb
          .orderBy("name", "asc")
          .limit(query.limit)
          .offset(query.offset)
          .execute();

        const customRolesWithFlag = customRoles.map((r) => ({
          ...r,
          isSystem: false,
        }));

        // Combine and return
        const allRoles = [...systemPersonas, ...customRolesWithFlag];

        return res.json({
          data: allRoles,
          pagination: {
            limit: query.limit,
            offset: query.offset,
          },
        });
      } catch (error) {
        logger.error("Failed to list roles", { error });
        return next(error);
      }
    }
  );

  /**
   * POST /roles
   * Create a custom role
   */
  router.post(
    "/roles",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);

        const parseResult = CreateRoleBodySchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            error: "INVALID_REQUEST",
            message: "Invalid request body",
            details: parseResult.error.errors,
          });
        }

        const { code, name, description, scopeMode, basePersona } =
          parseResult.data;

        // Check for duplicate code (including system personas)
        const existingPersona = await db
          .selectFrom("core.persona")
          .select("id")
          .where("code", "=", code)
          .executeTakeFirst();

        if (existingPersona) {
          return res.status(409).json({
            error: "DUPLICATE",
            message: `Role code '${code}' conflicts with system persona`,
          });
        }

        const existingRole = await db
          .selectFrom("core.role")
          .select("id")
          .where("code", "=", code)
          .where("tenant_id", "=", tenantId)
          .executeTakeFirst();

        if (existingRole) {
          return res.status(409).json({
            error: "DUPLICATE",
            message: `Role with code '${code}' already exists`,
          });
        }

        const result = await db
          .insertInto("core.role")
          .values({
            code,
            name,
            description,
            scope_mode: scopeMode,
            base_persona: basePersona,
            tenant_id: tenantId,
          })
          .returning([
            "id",
            "code",
            "name",
            "description",
            "scope_mode as scopeMode",
            "base_persona as basePersona",
            "created_at as createdAt",
          ])
          .executeTakeFirstOrThrow();

        return res.status(201).json({
          ...result,
          isSystem: false,
        });
      } catch (error) {
        logger.error("Failed to create role", { error });
        return next(error);
      }
    }
  );

  /**
   * GET /roles/:id
   * Get role by ID (system or custom)
   */
  router.get(
    "/roles/:id",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const roleId = req.params.id;

        // Try system persona first
        const persona = await db
          .selectFrom("core.persona")
          .select([
            "id",
            "code",
            "name",
            "description",
            "scope_mode as scopeMode",
            "priority",
          ])
          .where("id", "=", roleId)
          .executeTakeFirst();

        if (persona) {
          return res.json({
            ...persona,
            isSystem: true,
          });
        }

        // Try custom role
        const role = await db
          .selectFrom("core.role")
          .select([
            "id",
            "code",
            "name",
            "description",
            "scope_mode as scopeMode",
            "base_persona as basePersona",
            "created_at as createdAt",
            "updated_at as updatedAt",
          ])
          .where("id", "=", roleId)
          .where("tenant_id", "=", tenantId)
          .executeTakeFirst();

        if (!role) {
          return res.status(404).json({
            error: "NOT_FOUND",
            message: `Role not found: ${roleId}`,
          });
        }

        return res.json({
          ...role,
          isSystem: false,
        });
      } catch (error) {
        logger.error("Failed to get role", { error });
        return next(error);
      }
    }
  );

  /**
   * PATCH /roles/:id
   * Update custom role (system roles are read-only)
   */
  router.patch(
    "/roles/:id",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const roleId = req.params.id;

        const parseResult = UpdateRoleBodySchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            error: "INVALID_REQUEST",
            message: "Invalid request body",
            details: parseResult.error.errors,
          });
        }

        // Check if it's a system persona
        const persona = await db
          .selectFrom("core.persona")
          .select("id")
          .where("id", "=", roleId)
          .executeTakeFirst();

        if (persona) {
          return res.status(403).json({
            error: "FORBIDDEN",
            message: "Cannot modify system personas",
          });
        }

        // Check role exists
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

        const updates: Record<string, unknown> = {};
        if (parseResult.data.name) updates.name = parseResult.data.name;
        if (parseResult.data.description !== undefined)
          updates.description = parseResult.data.description;
        if (parseResult.data.scopeMode)
          updates.scope_mode = parseResult.data.scopeMode;

        if (Object.keys(updates).length === 0) {
          return res.status(400).json({
            error: "INVALID_REQUEST",
            message: "No fields to update",
          });
        }

        updates.updated_at = new Date();

        const result = await db
          .updateTable("core.role")
          .set(updates)
          .where("id", "=", roleId)
          .returning([
            "id",
            "code",
            "name",
            "description",
            "scope_mode as scopeMode",
          ])
          .executeTakeFirstOrThrow();

        return res.json({
          ...result,
          isSystem: false,
        });
      } catch (error) {
        logger.error("Failed to update role", { error });
        return next(error);
      }
    }
  );

  /**
   * DELETE /roles/:id
   * Delete custom role (system roles cannot be deleted)
   */
  router.delete(
    "/roles/:id",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const roleId = req.params.id;

        // Check if it's a system persona
        const persona = await db
          .selectFrom("core.persona")
          .select("id")
          .where("id", "=", roleId)
          .executeTakeFirst();

        if (persona) {
          return res.status(403).json({
            error: "FORBIDDEN",
            message: "Cannot delete system personas",
          });
        }

        // Check role exists
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

        // Check for existing bindings
        const bindings = await db
          .selectFrom("core.role_binding")
          .select("id")
          .where("role_id", "=", roleId)
          .limit(1)
          .execute();

        if (bindings.length > 0) {
          return res.status(409).json({
            error: "CONFLICT",
            message:
              "Cannot delete role with existing bindings. Remove bindings first.",
          });
        }

        await db.deleteFrom("core.role").where("id", "=", roleId).execute();

        return res.status(204).send();
      } catch (error) {
        logger.error("Failed to delete role", { error });
        return next(error);
      }
    }
  );

  /**
   * GET /roles/:id/capabilities
   * Get capabilities for a role (system persona or custom role via base_persona)
   */
  router.get(
    "/roles/:id/capabilities",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const roleId = req.params.id;

        let personaCode: string | null = null;

        // Check if it's a system persona
        const persona = await db
          .selectFrom("core.persona")
          .select(["code"])
          .where("id", "=", roleId)
          .executeTakeFirst();

        if (persona) {
          personaCode = persona.code;
        } else {
          // Try custom role
          const role = await db
            .selectFrom("core.role")
            .select(["base_persona as basePersona"])
            .where("id", "=", roleId)
            .where("tenant_id", "=", tenantId)
            .executeTakeFirst();

          if (!role) {
            return res.status(404).json({
              error: "NOT_FOUND",
              message: `Role not found: ${roleId}`,
            });
          }

          personaCode = role.basePersona;
        }

        if (!personaCode) {
          return res.json({
            capabilities: [],
            message: "Custom role has no base persona assigned",
          });
        }

        // Get capabilities for the persona
        const capabilities = await db
          .selectFrom("core.persona_capability as pc")
          .innerJoin("core.operation as o", "o.id", "pc.operation_id")
          .innerJoin(
            "core.operation_category as oc",
            "oc.id",
            "o.category_id"
          )
          .select([
            "oc.code as categoryCode",
            "o.code as operationCode",
            "o.name as operationName",
            "pc.is_granted as isGranted",
            "pc.constraint_type as constraintType",
          ])
          .where("pc.persona_code", "=", personaCode)
          .where("pc.is_granted", "=", true)
          .orderBy("oc.sort_order", "asc")
          .orderBy("o.sort_order", "asc")
          .execute();

        return res.json({
          personaCode,
          capabilities,
        });
      } catch (error) {
        logger.error("Failed to get role capabilities", { error });
        return next(error);
      }
    }
  );

  return router;
}
