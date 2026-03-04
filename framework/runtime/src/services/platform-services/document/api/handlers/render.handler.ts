/**
 * Render handlers — Async and sync document rendering endpoints.
 */

import { TOKENS } from "../../../../../kernel/tokens.js";

import type {
  RouteHandler,
  HttpHandlerContext,
} from "../../../../platform/foundation/http/types.js";
import type { DocRenderService } from "../../domain/services/DocRenderService.js";
import type { Request, Response } from "express";

export class RenderDocumentHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const renderService = await ctx.container.resolve<DocRenderService>(
      TOKENS.documentRenderService,
    );
    const tenantId = ctx.tenant.tenantKey ?? "default";
    const userId = ctx.auth.userId ?? "system";

    const body = req.body as {
      templateCode?: string;
      templateVersionId?: string;
      letterheadId?: string;
      brandProfileId?: string;
      entityName?: string;
      entityId?: string;
      operation?: string;
      variant?: string;
      locale?: string;
      timezone?: string;
      variables?: Record<string, unknown>;
    };

    if (!body.entityName || !body.entityId || !body.operation) {
      res.status(400).json({
        success: false,
        error: {
          code: "MISSING_FIELDS",
          message: "entityName, entityId, and operation are required",
        },
      });
      return;
    }

    if (!body.templateCode && !body.templateVersionId) {
      res.status(400).json({
        success: false,
        error: {
          code: "MISSING_FIELDS",
          message: "Either templateCode or templateVersionId is required",
        },
      });
      return;
    }

    try {
      const outputId = await renderService.renderAsync({
        tenantId,
        templateCode: body.templateCode,
        templateVersionId: body.templateVersionId as any,
        letterheadId: body.letterheadId as any,
        brandProfileId: body.brandProfileId as any,
        entityName: body.entityName,
        entityId: body.entityId,
        operation: body.operation,
        variant: body.variant,
        locale: body.locale,
        timezone: body.timezone,
        variables: body.variables ?? {},
        createdBy: userId,
      });

      res.status(202).json({ success: true, data: { outputId } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res
        .status(500)
        .json({ success: false, error: { code: "RENDER_ERROR", message } });
    }
  }
}

export class RenderSyncHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const renderService = await ctx.container.resolve<DocRenderService>(
      TOKENS.documentRenderService,
    );
    const tenantId = ctx.tenant.tenantKey ?? "default";
    const userId = ctx.auth.userId ?? "system";

    const body = req.body as {
      templateCode?: string;
      templateVersionId?: string;
      letterheadId?: string;
      brandProfileId?: string;
      entityName?: string;
      entityId?: string;
      operation?: string;
      variant?: string;
      locale?: string;
      timezone?: string;
      variables?: Record<string, unknown>;
    };

    if (!body.entityName || !body.entityId || !body.operation) {
      res.status(400).json({
        success: false,
        error: {
          code: "MISSING_FIELDS",
          message: "entityName, entityId, and operation are required",
        },
      });
      return;
    }

    try {
      const result = await renderService.renderSync({
        tenantId,
        templateCode: body.templateCode,
        templateVersionId: body.templateVersionId as any,
        letterheadId: body.letterheadId as any,
        brandProfileId: body.brandProfileId as any,
        entityName: body.entityName,
        entityId: body.entityId,
        operation: body.operation,
        variant: body.variant,
        locale: body.locale,
        timezone: body.timezone,
        variables: body.variables ?? {},
        createdBy: userId,
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename=${body.entityName}-${body.entityId}.pdf`,
      );
      res.setHeader("X-Render-Checksum", result.checksum);
      res.setHeader(
        "X-Manifest-Version",
        String(result.manifest.manifestVersion),
      );
      res.status(200).send(result.buffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res
        .status(500)
        .json({ success: false, error: { code: "RENDER_ERROR", message } });
    }
  }
}
