/**
 * Letterhead admin handlers — CRUD for letterheads.
 */

import { TOKENS } from "../../../../../kernel/tokens.js";

import type {
  RouteHandler,
  HttpHandlerContext,
} from "../../../../platform/foundation/http/types.js";
import type { DocLetterheadService } from "../../domain/services/DocLetterheadService.js";
import type { LetterheadId } from "../../domain/types.js";
import type { Request, Response } from "express";

export class ListLetterheadsHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const service = await ctx.container.resolve<DocLetterheadService>(
      TOKENS.documentLetterheadService,
    );
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const letterheads = await service.list(tenantId);
    res.status(200).json({ success: true, data: letterheads });
  }
}

export class CreateLetterheadHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const service = await ctx.container.resolve<DocLetterheadService>(
      TOKENS.documentLetterheadService,
    );
    const tenantId = ctx.tenant.tenantKey ?? "default";
    const userId = ctx.auth.userId ?? "system";

    const body = req.body as {
      code?: string;
      name?: string;
      orgUnitId?: string;
      logoStorageKey?: string;
      headerHtml?: string;
      footerHtml?: string;
      watermarkText?: string;
      watermarkOpacity?: number;
      defaultFonts?: Record<string, unknown>;
      pageMargins?: Record<string, unknown>;
      isDefault?: boolean;
      metadata?: Record<string, unknown>;
    };

    if (!body.code || !body.name) {
      res.status(400).json({
        success: false,
        error: {
          code: "MISSING_FIELDS",
          message: "code and name are required",
        },
      });
      return;
    }

    try {
      const letterhead = await service.create(tenantId, {
        ...body,
        code: body.code,
        name: body.name,
        createdBy: userId,
      });
      res.status(201).json({ success: true, data: letterhead });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res
        .status(409)
        .json({ success: false, error: { code: "CONFLICT", message } });
    }
  }
}

export class GetLetterheadHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const service = await ctx.container.resolve<DocLetterheadService>(
      TOKENS.documentLetterheadService,
    );
    const letterhead = await service.getById(req.params.id as LetterheadId);

    if (!letterhead) {
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Letterhead not found" },
      });
      return;
    }

    res.status(200).json({ success: true, data: letterhead });
  }
}

export class UpdateLetterheadHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const service = await ctx.container.resolve<DocLetterheadService>(
      TOKENS.documentLetterheadService,
    );
    const userId = ctx.auth.userId ?? "system";

    const body = req.body as {
      name?: string;
      logoStorageKey?: string;
      headerHtml?: string;
      footerHtml?: string;
      watermarkText?: string;
      watermarkOpacity?: number;
      defaultFonts?: Record<string, unknown>;
      pageMargins?: Record<string, unknown>;
      isDefault?: boolean;
      metadata?: Record<string, unknown>;
    };

    await service.update(req.params.id as LetterheadId, {
      ...body,
      updatedBy: userId,
    });
    res.status(200).json({ success: true });
  }
}
