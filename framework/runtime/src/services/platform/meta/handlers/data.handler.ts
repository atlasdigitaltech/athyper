/**
 * Generic Data API HTTP Handlers
 *
 * Handlers for generic CRUD operations on META-defined entities
 */

import { META_TOKENS } from "@athyper/core/meta";

import { TOKENS } from "../../../../kernel/tokens.js";

import type { RouteHandler, HttpHandlerContext } from "../../foundation/http/types.js";
import type { GenericDataAPI, ListOptions, RequestContext } from "@athyper/core/meta";
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
// List Records Handler
// ============================================================================

export class ListRecordsHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { entity } = req.params as { entity: string };
    const { page, pageSize, orderBy, orderDir } = req.query as {
      page?: string;
      pageSize?: string;
      orderBy?: string;
      orderDir?: "asc" | "desc";
    };

    const dataAPI = await ctx.container.resolve<GenericDataAPI>(META_TOKENS.dataAPI);
    const metaCtx = toMetaRequestContext(ctx);

    // Parse query parameters
    const parsedPage = page ? parseInt(page, 10) : 1;
    const parsedPageSize = pageSize ? parseInt(pageSize, 10) : 20;

    const options: ListOptions = {
      page: parsedPage,
      pageSize: parsedPageSize,
      orderBy: orderBy ?? "created_at",
      orderDir: orderDir ?? "desc",
    };

    // Validate pagination
    if (parsedPage < 1) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_PAGE",
          message: "Page must be >= 1",
        },
      });
      return;
    }

    if (parsedPageSize < 1 || parsedPageSize > 100) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_PAGE_SIZE",
          message: "Page size must be between 1 and 100",
        },
      });
      return;
    }

    try {
      const result = await dataAPI.list(entity, metaCtx, options);

      res.status(200).json({
        success: true,
        data: result.data,
        meta: result.meta,
      });
    } catch (error) {
      const logger = await ctx.container.resolve<any>(TOKENS.logger);
      logger.error({ error, entity }, "Failed to list records");

      if (error instanceof Error) {
        if (error.message.includes("not found")) {
          res.status(404).json({
            success: false,
            error: {
              code: "ENTITY_NOT_FOUND",
              message: `Entity '${entity}' not found`,
            },
          });
          return;
        }

        if (error.message.includes("permission") || error.message.includes("denied")) {
          res.status(403).json({
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: `Permission denied for entity '${entity}'`,
            },
          });
          return;
        }
      }

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to list records",
        },
      });
    }
  }
}

// ============================================================================
// Get Record Handler
// ============================================================================

export class GetRecordHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { entity, id } = req.params as { entity: string; id: string };

    const dataAPI = await ctx.container.resolve<GenericDataAPI>(META_TOKENS.dataAPI);
    const metaCtx = toMetaRequestContext(ctx);

    try {
      const record = await dataAPI.get(entity, id, metaCtx);

      if (!record) {
        res.status(404).json({
          success: false,
          error: {
            code: "RECORD_NOT_FOUND",
            message: `Record '${id}' not found in entity '${entity}'`,
          },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: record,
      });
    } catch (error) {
      const logger = await ctx.container.resolve<any>(TOKENS.logger);
      logger.error({ error, entity, id }, "Failed to get record");

      if (error instanceof Error) {
        if (error.message.includes("not found")) {
          res.status(404).json({
            success: false,
            error: {
              code: "ENTITY_NOT_FOUND",
              message: `Entity '${entity}' not found`,
            },
          });
          return;
        }

        if (error.message.includes("permission") || error.message.includes("denied")) {
          res.status(403).json({
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: `Permission denied for entity '${entity}'`,
            },
          });
          return;
        }
      }

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to get record",
        },
      });
    }
  }
}

// ============================================================================
// Create Record Handler
// ============================================================================

export class CreateRecordHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { entity } = req.params as { entity: string };
    const data = req.body;

    // Validate request body
    if (!data || typeof data !== "object") {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST_BODY",
          message: "Request body must be an object",
        },
      });
      return;
    }

    const dataAPI = await ctx.container.resolve<GenericDataAPI>(META_TOKENS.dataAPI);
    const metaCtx = toMetaRequestContext(ctx);

    try {
      const record = await dataAPI.create(entity, data, metaCtx);

      res.status(201).json({
        success: true,
        data: record,
      });
    } catch (error) {
      const logger = await ctx.container.resolve<any>(TOKENS.logger);
      logger.error({ error, entity }, "Failed to create record");

      if (error instanceof Error) {
        if (error.message.includes("not found")) {
          res.status(404).json({
            success: false,
            error: {
              code: "ENTITY_NOT_FOUND",
              message: `Entity '${entity}' not found`,
            },
          });
          return;
        }

        if (error.message.includes("permission") || error.message.includes("denied")) {
          res.status(403).json({
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: `Permission denied for entity '${entity}'`,
            },
          });
          return;
        }

        if (error.message.includes("validation") || error.message.includes("Validation")) {
          res.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: error.message,
            },
          });
          return;
        }
      }

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create record",
        },
      });
    }
  }
}

// ============================================================================
// Update Record Handler
// ============================================================================

export class UpdateRecordHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { entity, id } = req.params as { entity: string; id: string };
    const data = req.body;

    // Validate request body
    if (!data || typeof data !== "object") {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST_BODY",
          message: "Request body must be an object",
        },
      });
      return;
    }

    const dataAPI = await ctx.container.resolve<GenericDataAPI>(META_TOKENS.dataAPI);
    const metaCtx = toMetaRequestContext(ctx);

    try {
      const record = await dataAPI.update(entity, id, data, metaCtx);

      res.status(200).json({
        success: true,
        data: record,
      });
    } catch (error) {
      const logger = await ctx.container.resolve<any>(TOKENS.logger);
      logger.error({ error, entity, id }, "Failed to update record");

      if (error instanceof Error) {
        if (error.message.includes("not found") || error.message.includes("Record not found")) {
          res.status(404).json({
            success: false,
            error: {
              code: "RECORD_NOT_FOUND",
              message: `Record '${id}' not found in entity '${entity}'`,
            },
          });
          return;
        }

        if (error.message.includes("permission") || error.message.includes("denied")) {
          res.status(403).json({
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: `Permission denied for entity '${entity}'`,
            },
          });
          return;
        }

        if (error.message.includes("validation") || error.message.includes("Validation")) {
          res.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: error.message,
            },
          });
          return;
        }

        if (error.message.includes("Version conflict")) {
          res.status(409).json({
            success: false,
            error: {
              code: "VERSION_CONFLICT",
              message: error.message,
            },
          });
          return;
        }
      }

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to update record",
        },
      });
    }
  }
}

// ============================================================================
// Delete Record Handler
// ============================================================================

export class DeleteRecordHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { entity, id } = req.params as { entity: string; id: string };

    const dataAPI = await ctx.container.resolve<GenericDataAPI>(META_TOKENS.dataAPI);
    const metaCtx = toMetaRequestContext(ctx);

    try {
      await dataAPI.delete(entity, id, metaCtx);

      res.status(200).json({
        success: true,
        message: `Record '${id}' deleted successfully`,
      });
    } catch (error) {
      const logger = await ctx.container.resolve<any>(TOKENS.logger);
      logger.error({ error, entity, id }, "Failed to delete record");

      if (error instanceof Error) {
        if (error.message.includes("not found") || error.message.includes("Record not found")) {
          res.status(404).json({
            success: false,
            error: {
              code: "RECORD_NOT_FOUND",
              message: `Record '${id}' not found in entity '${entity}'`,
            },
          });
          return;
        }

        if (error.message.includes("permission") || error.message.includes("denied")) {
          res.status(403).json({
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: `Permission denied for entity '${entity}'`,
            },
          });
          return;
        }
      }

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to delete record",
        },
      });
    }
  }
}

// ============================================================================
// Count Records Handler
// ============================================================================

export class CountRecordsHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { entity } = req.params as { entity: string };

    const dataAPI = await ctx.container.resolve<GenericDataAPI>(META_TOKENS.dataAPI);
    const metaCtx = toMetaRequestContext(ctx);

    try {
      const count = await dataAPI.count(entity, metaCtx);

      res.status(200).json({
        success: true,
        data: {
          count,
        },
      });
    } catch (error) {
      const logger = await ctx.container.resolve<any>(TOKENS.logger);
      logger.error({ error, entity }, "Failed to count records");

      if (error instanceof Error) {
        if (error.message.includes("not found")) {
          res.status(404).json({
            success: false,
            error: {
              code: "ENTITY_NOT_FOUND",
              message: `Entity '${entity}' not found`,
            },
          });
          return;
        }

        if (error.message.includes("permission") || error.message.includes("denied")) {
          res.status(403).json({
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: `Permission denied for entity '${entity}'`,
            },
          });
          return;
        }
      }

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to count records",
        },
      });
    }
  }
}

// ============================================================================
// Restore Record Handler
// ============================================================================

export class RestoreRecordHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { entity, id } = req.params as { entity: string; id: string };

    const dataAPI = await ctx.container.resolve<GenericDataAPI>(META_TOKENS.dataAPI);
    const metaCtx = toMetaRequestContext(ctx);

    try {
      await dataAPI.restore(entity, id, metaCtx);

      res.status(200).json({
        success: true,
        message: `Record '${id}' restored successfully`,
      });
    } catch (error) {
      const logger = await ctx.container.resolve<any>(TOKENS.logger);
      logger.error({ error, entity, id }, "Failed to restore record");

      if (error instanceof Error) {
        if (error.message.includes("not found") || error.message.includes("Deleted record not found")) {
          res.status(404).json({
            success: false,
            error: {
              code: "RECORD_NOT_FOUND",
              message: `Deleted record '${id}' not found in entity '${entity}'`,
            },
          });
          return;
        }

        if (error.message.includes("permission") || error.message.includes("denied")) {
          res.status(403).json({
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: `Permission denied for entity '${entity}'`,
            },
          });
          return;
        }
      }

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to restore record",
        },
      });
    }
  }
}

// ============================================================================
// Bulk Create Records Handler
// ============================================================================

export class BulkCreateRecordsHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { entity } = req.params as { entity: string };
    const data = req.body;

    // Validate request body is an array
    if (!Array.isArray(data)) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST_BODY",
          message: "Request body must be an array of objects",
        },
      });
      return;
    }

    // Validate array is not empty
    if (data.length === 0) {
      res.status(400).json({
        success: false,
        error: {
          code: "EMPTY_ARRAY",
          message: "Request body must contain at least one item",
        },
      });
      return;
    }

    const dataAPI = await ctx.container.resolve<GenericDataAPI>(META_TOKENS.dataAPI);
    const metaCtx = toMetaRequestContext(ctx);

    try {
      const result = await dataAPI.bulkCreate(entity, data, metaCtx);

      res.status(result.succeeded > 0 ? 201 : 400).json({
        success: result.succeeded > 0,
        data: result,
      });
    } catch (error) {
      const logger = await ctx.container.resolve<any>(TOKENS.logger);
      logger.error({ error, entity }, "Failed to bulk create records");

      if (error instanceof Error) {
        if (error.message.includes("not found")) {
          res.status(404).json({
            success: false,
            error: {
              code: "ENTITY_NOT_FOUND",
              message: `Entity '${entity}' not found`,
            },
          });
          return;
        }

        if (error.message.includes("permission") || error.message.includes("denied")) {
          res.status(403).json({
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: `Permission denied for entity '${entity}'`,
            },
          });
          return;
        }
      }

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to bulk create records",
        },
      });
    }
  }
}

// ============================================================================
// Bulk Update Records Handler
// ============================================================================

export class BulkUpdateRecordsHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { entity } = req.params as { entity: string };
    const updates = req.body;

    // Validate request body is an array
    if (!Array.isArray(updates)) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST_BODY",
          message: "Request body must be an array of {id, data} objects",
        },
      });
      return;
    }

    // Validate array is not empty
    if (updates.length === 0) {
      res.status(400).json({
        success: false,
        error: {
          code: "EMPTY_ARRAY",
          message: "Request body must contain at least one item",
        },
      });
      return;
    }

    // Validate each item has id and data
    for (let i = 0; i < updates.length; i++) {
      const item = updates[i];
      if (!item || typeof item !== "object" || !item.id || !item.data) {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_UPDATE_FORMAT",
            message: `Item at index ${i} must have 'id' and 'data' properties`,
          },
        });
        return;
      }
    }

    const dataAPI = await ctx.container.resolve<GenericDataAPI>(META_TOKENS.dataAPI);
    const metaCtx = toMetaRequestContext(ctx);

    try {
      const result = await dataAPI.bulkUpdate(entity, updates, metaCtx);

      res.status(result.succeeded > 0 ? 200 : 400).json({
        success: result.succeeded > 0,
        data: result,
      });
    } catch (error) {
      const logger = await ctx.container.resolve<any>(TOKENS.logger);
      logger.error({ error, entity }, "Failed to bulk update records");

      if (error instanceof Error) {
        if (error.message.includes("not found")) {
          res.status(404).json({
            success: false,
            error: {
              code: "ENTITY_NOT_FOUND",
              message: `Entity '${entity}' not found`,
            },
          });
          return;
        }

        if (error.message.includes("permission") || error.message.includes("denied")) {
          res.status(403).json({
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: `Permission denied for entity '${entity}'`,
            },
          });
          return;
        }
      }

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to bulk update records",
        },
      });
    }
  }
}

// ============================================================================
// Bulk Delete Records Handler
// ============================================================================

export class BulkDeleteRecordsHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { entity } = req.params as { entity: string };
    const { ids } = req.body as { ids: string[] };

    // Validate request body has ids array
    if (!Array.isArray(ids)) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST_BODY",
          message: "Request body must have 'ids' property as an array of strings",
        },
      });
      return;
    }

    // Validate array is not empty
    if (ids.length === 0) {
      res.status(400).json({
        success: false,
        error: {
          code: "EMPTY_ARRAY",
          message: "'ids' array must contain at least one ID",
        },
      });
      return;
    }

    const dataAPI = await ctx.container.resolve<GenericDataAPI>(META_TOKENS.dataAPI);
    const metaCtx = toMetaRequestContext(ctx);

    try {
      const result = await dataAPI.bulkDelete(entity, ids, metaCtx);

      res.status(result.succeeded > 0 ? 200 : 400).json({
        success: result.succeeded > 0,
        data: result,
      });
    } catch (error) {
      const logger = await ctx.container.resolve<any>(TOKENS.logger);
      logger.error({ error, entity }, "Failed to bulk delete records");

      if (error instanceof Error) {
        if (error.message.includes("not found")) {
          res.status(404).json({
            success: false,
            error: {
              code: "ENTITY_NOT_FOUND",
              message: `Entity '${entity}' not found`,
            },
          });
          return;
        }

        if (error.message.includes("permission") || error.message.includes("denied")) {
          res.status(403).json({
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: `Permission denied for entity '${entity}'`,
            },
          });
          return;
        }
      }

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to bulk delete records",
        },
      });
    }
  }
}

// ============================================================================
// Permanent Delete Record Handler
// ============================================================================

export class PermanentDeleteRecordHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { entity, id } = req.params as { entity: string; id: string };

    const dataAPI = await ctx.container.resolve<GenericDataAPI>(META_TOKENS.dataAPI);
    const metaCtx = toMetaRequestContext(ctx);

    try {
      await dataAPI.permanentDelete(entity, id, metaCtx);

      res.status(200).json({
        success: true,
        message: `Record '${id}' permanently deleted`,
      });
    } catch (error) {
      const logger = await ctx.container.resolve<any>(TOKENS.logger);
      logger.error({ error, entity, id }, "Failed to permanently delete record");

      if (error instanceof Error) {
        if (error.message.includes("not found") || error.message.includes("Record not found")) {
          res.status(404).json({
            success: false,
            error: {
              code: "RECORD_NOT_FOUND",
              message: `Record '${id}' not found in entity '${entity}'`,
            },
          });
          return;
        }

        if (error.message.includes("permission") || error.message.includes("denied")) {
          res.status(403).json({
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: `Permission denied for entity '${entity}'`,
            },
          });
          return;
        }
      }

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to permanently delete record",
        },
      });
    }
  }
}
