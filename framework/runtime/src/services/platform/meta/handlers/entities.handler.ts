/**
 * META Entities HTTP Handlers
 *
 * Handlers for entity CRUD operations
 */

import { META_TOKENS } from "@athyper/core/meta";

import { TOKENS } from "../../../../kernel/tokens.js";

import type { RouteHandler, HttpHandlerContext } from "../../foundation/http/types.js";
import type { MetaRegistry, RequestContext } from "@athyper/core/meta";
import type { Request, Response } from "express";



// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert HttpHandlerContext to META RequestContext
 */
function toMetaRequestContext(ctx: HttpHandlerContext): RequestContext {
  return {
    userId: ctx.auth.userId ?? ctx.auth.subject ?? "system",
    tenantId: ctx.tenant.tenantKey ?? "default",
    realmId: ctx.tenant.realmKey,
    roles: ctx.auth.roles,
  };
}

// ============================================================================
// Create Entity Handler
// ============================================================================

export class CreateEntityHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const {
      name, description, kind, moduleId, tableSchema, tableName, governanceLevel, engineTag,
    } = req.body as {
      name: string;
      description?: string;
      kind?: string;
      moduleId?: string;
      tableSchema?: string;
      tableName?: string;
      governanceLevel?: string;
      engineTag?: string;
    };

    // Validate required fields
    if (!name) {
      res.status(400).json({
        success: false,
        error: {
          code: "MISSING_REQUIRED_FIELD",
          message: "Field 'name' is required",
        },
      });
      return;
    }

    const registry = await ctx.container.resolve<MetaRegistry>(META_TOKENS.registry);
    const metaCtx = toMetaRequestContext(ctx);

    try {
      const entity = await registry.createEntity(name, description, metaCtx, {
        kind, moduleId, tableSchema, tableName, governanceLevel, engineTag,
      });

      res.status(201).json({
        success: true,
        data: entity,
      });
    } catch (error) {
      const logger = await ctx.container.resolve<any>(TOKENS.logger);
      logger.error({ error, name }, "Failed to create entity");

      if (error instanceof Error && error.message.includes("duplicate")) {
        res.status(409).json({
          success: false,
          error: {
            code: "ENTITY_ALREADY_EXISTS",
            message: `Entity '${name}' already exists`,
          },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create entity",
        },
      });
    }
  }
}

// ============================================================================
// List Entities Handler
// ============================================================================

export class ListEntitiesHandler implements RouteHandler {
  async handle(_req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const registry = await ctx.container.resolve<MetaRegistry>(META_TOKENS.registry);

    try {
      const result = await registry.listEntities();

      res.status(200).json({
        success: true,
        data: result.data,
        meta: result.meta,
      });
    } catch (error) {
      const logger = await ctx.container.resolve<any>(TOKENS.logger);
      logger.error({ error }, "Failed to list entities");

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to list entities",
        },
      });
    }
  }
}

// ============================================================================
// Get Entity Handler
// ============================================================================

export class GetEntityHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { name } = req.params as { name: string };

    const registry = await ctx.container.resolve<MetaRegistry>(META_TOKENS.registry);

    try {
      const entity = await registry.getEntity(name);

      if (!entity) {
        res.status(404).json({
          success: false,
          error: {
            code: "ENTITY_NOT_FOUND",
            message: `Entity '${name}' not found`,
          },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: entity,
      });
    } catch (error) {
      const logger = await ctx.container.resolve<any>(TOKENS.logger);
      logger.error({ error, name }, "Failed to get entity");

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to get entity",
        },
      });
    }
  }
}

// ============================================================================
// Update Entity Handler
// ============================================================================

export class UpdateEntityHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { name } = req.params as { name: string };
    const { description } = req.body as { description?: string };

    const registry = await ctx.container.resolve<MetaRegistry>(META_TOKENS.registry);
    const metaCtx = toMetaRequestContext(ctx);

    try {
      const entity = await registry.updateEntity(name, { description }, metaCtx);

      res.status(200).json({
        success: true,
        data: entity,
      });
    } catch (error) {
      const logger = await ctx.container.resolve<any>(TOKENS.logger);
      logger.error({ error, name }, "Failed to update entity");

      if (error instanceof Error && error.message.includes("not found")) {
        res.status(404).json({
          success: false,
          error: {
            code: "ENTITY_NOT_FOUND",
            message: `Entity '${name}' not found`,
          },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to update entity",
        },
      });
    }
  }
}

// ============================================================================
// Delete Entity Handler
// ============================================================================

export class DeleteEntityHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { name } = req.params as { name: string };

    const registry = await ctx.container.resolve<MetaRegistry>(META_TOKENS.registry);
    const metaCtx = toMetaRequestContext(ctx);

    try {
      await registry.deleteEntity(name, metaCtx);

      res.status(200).json({
        success: true,
        message: `Entity '${name}' deleted successfully`,
      });
    } catch (error) {
      const logger = await ctx.container.resolve<any>(TOKENS.logger);
      logger.error({ error, name }, "Failed to delete entity");

      if (error instanceof Error && error.message.includes("not found")) {
        res.status(404).json({
          success: false,
          error: {
            code: "ENTITY_NOT_FOUND",
            message: `Entity '${name}' not found`,
          },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to delete entity",
        },
      });
    }
  }
}
