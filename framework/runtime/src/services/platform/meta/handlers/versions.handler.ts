/**
 * META Versions HTTP Handlers
 *
 * Handlers for entity version management operations
 */

import { META_TOKENS } from "@athyper/core/meta";

import { TOKENS } from "../../../../kernel/tokens.js";

import type { RouteHandler, HttpHandlerContext } from "../../foundation/http/types.js";
import type { EntitySchema, MetaRegistry, RequestContext } from "@athyper/core/meta";
import type { Request, Response } from "express";



// ============================================================================
// Helper Functions
// ============================================================================

function toMetaRequestContext(ctx: HttpHandlerContext): RequestContext {
  return {
    userId: ctx.auth.userId ?? ctx.auth.subject ?? "system",
    tenantId: ctx.tenant.tenantKey ?? "default",
    realmId: ctx.tenant.realmKey,
    roles: ctx.auth.roles,
  };
}

// ============================================================================
// Create Version Handler
// ============================================================================

export class CreateVersionHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { name } = req.params as { name: string };
    const { version, schema } = req.body as { version: string; schema: EntitySchema };

    // Validate required fields
    if (!version || !schema) {
      res.status(400).json({
        success: false,
        error: {
          code: "MISSING_REQUIRED_FIELDS",
          message: "Fields 'version' and 'schema' are required",
        },
      });
      return;
    }

    const registry = await ctx.container.resolve<MetaRegistry>(META_TOKENS.registry);
    const metaCtx = toMetaRequestContext(ctx);

    try {
      // Check if entity exists
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

      const entityVersion = await registry.createVersion(name, version, schema, metaCtx);

      res.status(201).json({
        success: true,
        data: entityVersion,
      });
    } catch (error) {
      const logger = await ctx.container.resolve<any>(TOKENS.logger);
      logger.error({ error, name, version }, "Failed to create version");

      if (error instanceof Error && error.message.includes("duplicate")) {
        res.status(409).json({
          success: false,
          error: {
            code: "VERSION_ALREADY_EXISTS",
            message: `Version '${version}' already exists for entity '${name}'`,
          },
        });
        return;
      }

      if (error instanceof Error && error.message.includes("validation")) {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_SCHEMA",
            message: error.message,
          },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create version",
        },
      });
    }
  }
}

// ============================================================================
// List Versions Handler
// ============================================================================

export class ListVersionsHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { name } = req.params as { name: string };

    const registry = await ctx.container.resolve<MetaRegistry>(META_TOKENS.registry);

    try {
      const result = await registry.listVersions(name);

      res.status(200).json({
        success: true,
        data: result.data,
        meta: {
          ...result.meta,
          entityName: name,
        },
      });
    } catch (error) {
      const logger = await ctx.container.resolve<any>(TOKENS.logger);
      logger.error({ error, name }, "Failed to list versions");

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to list versions",
        },
      });
    }
  }
}

// ============================================================================
// Get Version Handler
// ============================================================================

export class GetVersionHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { name, version } = req.params as { name: string; version: string };

    const registry = await ctx.container.resolve<MetaRegistry>(META_TOKENS.registry);

    try {
      const entityVersion = await registry.getVersion(name, version);

      if (!entityVersion) {
        res.status(404).json({
          success: false,
          error: {
            code: "VERSION_NOT_FOUND",
            message: `Version '${version}' not found for entity '${name}'`,
          },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: entityVersion,
      });
    } catch (error) {
      const logger = await ctx.container.resolve<any>(TOKENS.logger);
      logger.error({ error, name, version }, "Failed to get version");

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to get version",
        },
      });
    }
  }
}

// ============================================================================
// Activate Version Handler
// ============================================================================

export class ActivateVersionHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { name, version } = req.params as { name: string; version: string };

    const registry = await ctx.container.resolve<MetaRegistry>(META_TOKENS.registry);
    const metaCtx = toMetaRequestContext(ctx);

    try {
      const entityVersion = await registry.activateVersion(name, version, metaCtx);

      res.status(200).json({
        success: true,
        data: entityVersion,
        message: `Version '${version}' activated for entity '${name}'`,
      });
    } catch (error) {
      const logger = await ctx.container.resolve<any>(TOKENS.logger);
      logger.error({ error, name, version }, "Failed to activate version");

      if (error instanceof Error && error.message.includes("not found")) {
        res.status(404).json({
          success: false,
          error: {
            code: "VERSION_NOT_FOUND",
            message: `Version '${version}' not found for entity '${name}'`,
          },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to activate version",
        },
      });
    }
  }
}

// ============================================================================
// Delete Version Handler
// ============================================================================

export class DeleteVersionHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { name, version } = req.params as { name: string; version: string };

    const registry = await ctx.container.resolve<MetaRegistry>(META_TOKENS.registry);
    const metaCtx = toMetaRequestContext(ctx);

    try {
      // Check if this is the active version
      const entity = await registry.getEntity(name);
      if (entity?.activeVersion === version) {
        res.status(400).json({
          success: false,
          error: {
            code: "CANNOT_DELETE_ACTIVE_VERSION",
            message: `Cannot delete active version '${version}'. Activate another version first.`,
          },
        });
        return;
      }

      await registry.deleteVersion(name, version, metaCtx);

      res.status(200).json({
        success: true,
        message: `Version '${version}' deleted successfully`,
      });
    } catch (error) {
      const logger = await ctx.container.resolve<any>(TOKENS.logger);
      logger.error({ error, name, version }, "Failed to delete version");

      if (error instanceof Error && error.message.includes("not found")) {
        res.status(404).json({
          success: false,
          error: {
            code: "VERSION_NOT_FOUND",
            message: `Version '${version}' not found for entity '${name}'`,
          },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to delete version",
        },
      });
    }
  }
}
