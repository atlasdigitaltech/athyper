/**
 * Template admin handler — Admin: CRUD templates, preview, test-send.
 */

import { TOKENS } from "../../../../../kernel/tokens.js";

import type {
  RouteHandler,
  HttpHandlerContext,
} from "../../../../platform/foundation/http/types.js";
import type { TemplateRenderer } from "../../domain/services/TemplateRenderer.js";
import type { ChannelCode, TemplateStatus } from "../../domain/types.js";
import type { NotificationTemplateRepo } from "../../persistence/NotificationTemplateRepo.js";
import type { Request, Response } from "express";

const REPO_TOKEN = "notify.repo.template";

export class ListTemplatesHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const repo =
      await ctx.container.resolve<NotificationTemplateRepo>(REPO_TOKEN);
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const templates = await repo.list({
      tenantId,
      channel: req.query.channel as ChannelCode | undefined,
      status: req.query.status as TemplateStatus | undefined,
      limit: Number(req.query.limit) || 100,
      offset: Number(req.query.offset) || 0,
    });

    res.status(200).json({ success: true, data: templates });
  }
}

export class CreateTemplateHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const repo =
      await ctx.container.resolve<NotificationTemplateRepo>(REPO_TOKEN);
    const tenantId = ctx.tenant.tenantKey ?? "default";
    const userId = ctx.auth.userId ?? "system";

    const body = req.body as {
      templateKey?: string;
      channel?: string;
      locale?: string;
      subject?: string;
      bodyText?: string;
      bodyHtml?: string;
      bodyJson?: Record<string, unknown>;
      variablesSchema?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    };

    if (!body.templateKey || !body.channel) {
      res.status(400).json({
        success: false,
        error: {
          code: "MISSING_FIELDS",
          message: "templateKey and channel are required",
        },
      });
      return;
    }

    const template = await repo.create({
      tenantId,
      templateKey: body.templateKey,
      channel: body.channel as ChannelCode,
      locale: body.locale ?? "en",
      subject: body.subject,
      bodyText: body.bodyText,
      bodyHtml: body.bodyHtml,
      bodyJson: body.bodyJson,
      variablesSchema: body.variablesSchema,
      metadata: body.metadata,
      createdBy: userId,
    });

    res.status(201).json({ success: true, data: template });
  }
}

export class PreviewTemplateHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const renderer = await ctx.container.resolve<TemplateRenderer>(
      TOKENS.notificationTemplateRenderer,
    );
    const templateId = req.params.id;

    const body = req.body as { variables?: Record<string, unknown> };

    const rendered = await renderer.preview(templateId, body.variables ?? {});
    if (!rendered) {
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Template not found" },
      });
      return;
    }

    res.status(200).json({ success: true, data: rendered });
  }
}
