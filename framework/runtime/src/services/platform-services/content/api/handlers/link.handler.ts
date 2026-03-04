/**
 * Link Handlers - Entity-document link management
 */

import { TOKENS } from "../../../../../kernel/tokens.js";

import type {
  RouteHandler,
  HttpHandlerContext,
} from "../../../../platform/foundation/http/types.js";
import type { LinkService } from "../../domain/services/LinkService.js";
import type { Request, Response } from "express";

/**
 * POST /api/content/link
 * Link document to entity
 */
export class LinkDocumentHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const linkService = await ctx.container.resolve<LinkService>(
      TOKENS.linkService,
    );
    const tenantId = ctx.tenant.tenantKey ?? "default";
    const actorId = ctx.auth.userId ?? "anonymous";

    const body = req.body as {
      attachmentId: string;
      entityType: string;
      entityId: string;
      linkKind?: string;
      displayOrder?: number;
      metadata?: Record<string, unknown>;
    };

    if (!body.attachmentId || !body.entityType || !body.entityId) {
      res.status(400).json({
        success: false,
        error: {
          code: "MISSING_FIELDS",
          message: "attachmentId, entityType, and entityId are required",
        },
      });
      return;
    }

    try {
      const link = await linkService.linkDocument({
        tenantId,
        attachmentId: body.attachmentId,
        entityType: body.entityType,
        entityId: body.entityId,
        linkKind: body.linkKind ?? "related",
        displayOrder: body.displayOrder,
        metadata: body.metadata,
        actorId,
      });

      res.status(201).json({ success: true, data: link });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("not found")) {
        res
          .status(404)
          .json({ success: false, error: { code: "NOT_FOUND", message } });
      } else if (message.includes("already linked")) {
        res
          .status(409)
          .json({ success: false, error: { code: "ALREADY_LINKED", message } });
      } else {
        res
          .status(500)
          .json({ success: false, error: { code: "LINK_ERROR", message } });
      }
    }
  }
}

/**
 * DELETE /api/content/unlink/:id
 * Unlink document from entity
 */
export class UnlinkDocumentHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const linkService = await ctx.container.resolve<LinkService>(
      TOKENS.linkService,
    );
    const tenantId = ctx.tenant.tenantKey ?? "default";
    const actorId = ctx.auth.userId ?? "anonymous";

    const linkId = req.params.id;
    if (!linkId) {
      res.status(400).json({
        success: false,
        error: { code: "MISSING_ID", message: "Link ID is required" },
      });
      return;
    }

    try {
      await linkService.unlinkDocument({
        linkId,
        tenantId,
        actorId,
      });

      res.status(200).json({ success: true, data: { linkId } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("not found")) {
        res
          .status(404)
          .json({ success: false, error: { code: "NOT_FOUND", message } });
      } else {
        res
          .status(500)
          .json({ success: false, error: { code: "UNLINK_ERROR", message } });
      }
    }
  }
}

/**
 * GET /api/content/links/:id
 * Get entities linked to a document
 */
export class GetLinkedEntitiesHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const linkService = await ctx.container.resolve<LinkService>(
      TOKENS.linkService,
    );
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const attachmentId = req.params.id;
    if (!attachmentId) {
      res.status(400).json({
        success: false,
        error: { code: "MISSING_ID", message: "Attachment ID is required" },
      });
      return;
    }

    try {
      const links = await linkService.getLinkedEntities(attachmentId, tenantId);

      res.status(200).json({ success: true, data: links });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res
        .status(500)
        .json({ success: false, error: { code: "LINK_LIST_ERROR", message } });
    }
  }
}
