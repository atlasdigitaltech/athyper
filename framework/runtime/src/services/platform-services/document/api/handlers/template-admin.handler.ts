/**
 * Template admin handlers — CRUD, versioning, publish/retire, preview, resolve.
 *
 * Enhancements:
 * - ETag support on GetTemplate (304 Not Modified)
 * - ResolveTemplateHandler for template resolution debugging
 * - Preview returns manifest headers
 */

import { createHash } from "node:crypto";

import { TOKENS } from "../../../../../kernel/tokens.js";

import type {
  RouteHandler,
  HttpHandlerContext,
} from "../../../../platform/foundation/http/types.js";
import type { DocRenderService } from "../../domain/services/DocRenderService.js";
import type { DocTemplateService } from "../../domain/services/DocTemplateService.js";
import type {
  TemplateListFilters,
  TemplateId,
  TemplateVersionId,
} from "../../domain/types.js";
import type { DocTemplateRepo } from "../../persistence/DocTemplateRepo.js";
import type { DocTemplateVersionRepo } from "../../persistence/DocTemplateVersionRepo.js";
import type { Request, Response } from "express";

const REPO_TOKEN = "doc.repo.template";
const VERSION_REPO_TOKEN = "doc.repo.templateVersion";

export class ListTemplatesHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const repo = await ctx.container.resolve<DocTemplateRepo>(REPO_TOKEN);
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const filters: TemplateListFilters = {
      status: req.query.status as any,
      kind: req.query.kind as any,
      engine: req.query.engine as any,
      search: req.query.search as string | undefined,
      limit: Number(req.query.limit) || 100,
      offset: Number(req.query.offset) || 0,
    };

    const templates = await repo.list(tenantId, filters);
    res.status(200).json({ success: true, data: templates });
  }
}

export class CreateTemplateHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const service = await ctx.container.resolve<DocTemplateService>(
      TOKENS.documentTemplateService,
    );
    const tenantId = ctx.tenant.tenantKey ?? "default";
    const userId = ctx.auth.userId ?? "system";

    const body = req.body as {
      code?: string;
      name?: string;
      kind?: string;
      engine?: string;
      metadata?: Record<string, unknown>;
    };

    if (!body.code || !body.name || !body.kind) {
      res.status(400).json({
        success: false,
        error: {
          code: "MISSING_FIELDS",
          message: "code, name, and kind are required",
        },
      });
      return;
    }

    try {
      const template = await service.create(tenantId, {
        code: body.code,
        name: body.name,
        kind: body.kind,
        engine: body.engine,
        metadata: body.metadata,
        createdBy: userId,
      });

      res.status(201).json({ success: true, data: template });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res
        .status(409)
        .json({ success: false, error: { code: "CONFLICT", message } });
    }
  }
}

export class GetTemplateHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const repo = await ctx.container.resolve<DocTemplateRepo>(REPO_TOKEN);
    const template = await repo.getById(req.params.id as TemplateId);

    if (!template) {
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Template not found" },
      });
      return;
    }

    // Include versions
    const versionRepo =
      await ctx.container.resolve<DocTemplateVersionRepo>(VERSION_REPO_TOKEN);
    const versions = await versionRepo.listByTemplate(template.id);

    // ETag support — hash based on updatedAt or id
    const etag = createHash("md5")
      .update(
        `${template.id}:${template.updatedAt?.toISOString() ?? template.createdAt.toISOString()}`,
      )
      .digest("hex");

    const ifNoneMatch = req.headers["if-none-match"];
    if (ifNoneMatch === `"${etag}"`) {
      res.status(304).end();
      return;
    }

    res.setHeader("ETag", `"${etag}"`);
    res.setHeader("Cache-Control", "private, max-age=60");
    res.status(200).json({ success: true, data: { ...template, versions } });
  }
}

export class UpdateTemplateHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const repo = await ctx.container.resolve<DocTemplateRepo>(REPO_TOKEN);
    const userId = ctx.auth.userId ?? "system";

    const body = req.body as {
      name?: string;
      kind?: string;
      engine?: string;
      metadata?: Record<string, unknown>;
    };

    await repo.update(req.params.id as TemplateId, {
      ...body,
      updatedBy: userId,
    });
    res.status(200).json({ success: true });
  }
}

export class CreateVersionHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const service = await ctx.container.resolve<DocTemplateService>(
      TOKENS.documentTemplateService,
    );
    const userId = ctx.auth.userId ?? "system";

    const body = req.body as {
      contentHtml?: string;
      contentJson?: Record<string, unknown>;
      headerHtml?: string;
      footerHtml?: string;
      stylesCss?: string;
      variablesSchema?: Record<string, unknown>;
      assetsManifest?: Record<string, string>;
    };

    try {
      const version = await service.createVersion(req.params.id as TemplateId, {
        ...body,
        createdBy: userId,
      });

      res.status(201).json({ success: true, data: version });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res
        .status(400)
        .json({ success: false, error: { code: "VERSION_ERROR", message } });
    }
  }
}

export class PublishTemplateHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const service = await ctx.container.resolve<DocTemplateService>(
      TOKENS.documentTemplateService,
    );
    const userId = ctx.auth.userId ?? "system";

    const body = req.body as { versionId?: string };
    if (!body.versionId) {
      res.status(400).json({
        success: false,
        error: { code: "MISSING_FIELDS", message: "versionId is required" },
      });
      return;
    }

    try {
      await service.publish(
        req.params.id as TemplateId,
        body.versionId as TemplateVersionId,
        userId,
      );
      res.status(200).json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res
        .status(400)
        .json({ success: false, error: { code: "PUBLISH_ERROR", message } });
    }
  }
}

export class RetireTemplateHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const service = await ctx.container.resolve<DocTemplateService>(
      TOKENS.documentTemplateService,
    );
    const userId = ctx.auth.userId ?? "system";

    await service.retire(req.params.id as TemplateId, userId);
    res.status(200).json({ success: true });
  }
}

export class PreviewTemplateHandler implements RouteHandler {
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
      versionId?: string;
      variables?: Record<string, unknown>;
      letterheadId?: string;
      brandProfileId?: string;
    };

    try {
      const result = await renderService.renderSync({
        tenantId,
        templateVersionId: body.versionId as any,
        letterheadId: body.letterheadId as any,
        brandProfileId: body.brandProfileId as any,
        entityName: "preview",
        entityId: "preview",
        operation: "preview",
        variables: body.variables ?? {},
        createdBy: userId,
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline; filename=preview.pdf");
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

/**
 * ResolveTemplateHandler — GET /api/admin/documents/resolve
 *
 * Resolves which template+version would be used for a given entity/operation/variant.
 * Returns the chosen binding, template, version info, and resolution explanation.
 */
export class ResolveTemplateHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const service = await ctx.container.resolve<DocTemplateService>(
      TOKENS.documentTemplateService,
    );
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const entityName = req.query.entity as string | undefined;
    const operation = req.query.operation as string | undefined;
    const variant = req.query.variant as string | undefined;

    if (!entityName || !operation) {
      res.status(400).json({
        success: false,
        error: {
          code: "MISSING_FIELDS",
          message: "entity and operation query params are required",
        },
      });
      return;
    }

    const resolved = await service.resolveTemplate(
      tenantId,
      entityName,
      operation,
      variant,
    );

    if (!resolved) {
      res.status(200).json({
        success: true,
        data: {
          resolved: false,
          explanation: `No active binding found for entity='${entityName}', operation='${operation}', variant='${variant ?? "default"}'`,
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        resolved: true,
        template: {
          id: resolved.template.id,
          code: resolved.template.code,
          name: resolved.template.name,
          kind: resolved.template.kind,
          engine: resolved.template.engine,
          status: resolved.template.status,
          supportsRtl: resolved.template.supportsRtl,
          requiresLetterhead: resolved.template.requiresLetterhead,
          allowedOperations: resolved.template.allowedOperations,
          supportedLocales: resolved.template.supportedLocales,
        },
        version: {
          id: resolved.version.id,
          version: resolved.version.version,
          checksum: resolved.version.checksum,
          publishedAt: resolved.version.publishedAt,
          effectiveFrom: resolved.version.effectiveFrom,
          effectiveTo: resolved.version.effectiveTo,
        },
        binding: {
          id: resolved.binding.id,
          entityName: resolved.binding.entityName,
          operation: resolved.binding.operation,
          variant: resolved.binding.variant,
          priority: resolved.binding.priority,
          active: resolved.binding.active,
        },
        explanation: `Resolved via binding '${resolved.binding.id}' (priority=${resolved.binding.priority}) → template '${resolved.template.code}' v${resolved.version.version}`,
      },
    });
  }
}
