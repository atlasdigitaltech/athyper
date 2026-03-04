/**
 * Brand profile admin handlers — CRUD for brand profiles.
 */

import { TOKENS } from "../../../../../kernel/tokens.js";

import type {
  RouteHandler,
  HttpHandlerContext,
} from "../../../../platform/foundation/http/types.js";
import type { DocBrandService } from "../../domain/services/DocBrandService.js";
import type { BrandProfileId } from "../../domain/types.js";
import type { Request, Response } from "express";

export class ListBrandProfilesHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const service = await ctx.container.resolve<DocBrandService>(
      TOKENS.documentBrandService,
    );
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const profiles = await service.list(tenantId);
    res.status(200).json({ success: true, data: profiles });
  }
}

export class CreateBrandProfileHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const service = await ctx.container.resolve<DocBrandService>(
      TOKENS.documentBrandService,
    );
    const tenantId = ctx.tenant.tenantKey ?? "default";
    const userId = ctx.auth.userId ?? "system";

    const body = req.body as {
      code?: string;
      name?: string;
      palette?: Record<string, unknown>;
      typography?: Record<string, unknown>;
      spacingScale?: Record<string, unknown>;
      direction?: string;
      defaultLocale?: string;
      supportedLocales?: string[];
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
      const profile = await service.create(tenantId, {
        ...body,
        code: body.code,
        name: body.name,
        createdBy: userId,
      });
      res.status(201).json({ success: true, data: profile });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res
        .status(409)
        .json({ success: false, error: { code: "CONFLICT", message } });
    }
  }
}

export class UpdateBrandProfileHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const service = await ctx.container.resolve<DocBrandService>(
      TOKENS.documentBrandService,
    );
    const userId = ctx.auth.userId ?? "system";

    const body = req.body as {
      name?: string;
      palette?: Record<string, unknown>;
      typography?: Record<string, unknown>;
      spacingScale?: Record<string, unknown>;
      direction?: string;
      defaultLocale?: string;
      supportedLocales?: string[];
      isDefault?: boolean;
      metadata?: Record<string, unknown>;
    };

    await service.update(req.params.id as BrandProfileId, {
      ...body,
      updatedBy: userId,
    });
    res.status(200).json({ success: true });
  }
}
