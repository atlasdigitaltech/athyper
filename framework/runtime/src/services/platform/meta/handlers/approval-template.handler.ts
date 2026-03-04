/**
 * Approval Template HTTP Handlers
 *
 * Handlers for template authoring, validation, compilation, and versioning.
 */

import { META_TOKENS } from "@athyper/core/meta";

import type {
  RouteHandler,
  HttpHandlerContext,
} from "../../foundation/http/types.js";
import type {
  ApprovalTemplateService,
  ApprovalTemplateCreateInput,
  ApprovalTemplateUpdateInput,
} from "@athyper/core/meta";
import type { Request, Response } from "express";

// ============================================================================
// CRUD Handlers
// ============================================================================

export class ListTemplatesHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { page, pageSize } = req.query as { page?: string; pageSize?: string };
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const service = await ctx.container.resolve<ApprovalTemplateService>(
      META_TOKENS.approvalTemplateService
    );

    try {
      const result = await service.list(tenantId, {
        page: page ? parseInt(page, 10) : 1,
        pageSize: pageSize ? parseInt(pageSize, 10) : 20,
      });

      res.status(200).json({
        success: true,
        data: result.data,
        meta: result.meta,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: String(error) },
      });
    }
  }
}

export class CreateTemplateHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const userId = ctx.auth.userId ?? ctx.auth.subject ?? "system";
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const service = await ctx.container.resolve<ApprovalTemplateService>(
      META_TOKENS.approvalTemplateService
    );

    try {
      const input = req.body as ApprovalTemplateCreateInput;
      const template = await service.create(input, tenantId, userId);

      res.status(201).json({
        success: true,
        data: template,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: { code: "CREATION_FAILED", message: String(error) },
      });
    }
  }
}

export class GetTemplateHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { code } = req.params as { code: string };
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const service = await ctx.container.resolve<ApprovalTemplateService>(
      META_TOKENS.approvalTemplateService
    );

    try {
      const template = await service.get(code, tenantId);

      if (!template) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: `Template not found: ${code}` },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: template,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: String(error) },
      });
    }
  }
}

export class UpdateTemplateHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { code } = req.params as { code: string };
    const userId = ctx.auth.userId ?? ctx.auth.subject ?? "system";
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const service = await ctx.container.resolve<ApprovalTemplateService>(
      META_TOKENS.approvalTemplateService
    );

    try {
      const input = req.body as ApprovalTemplateUpdateInput;
      const template = await service.update(code, input, tenantId, userId);

      res.status(200).json({
        success: true,
        data: template,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: { code: "UPDATE_FAILED", message: String(error) },
      });
    }
  }
}

export class DeleteTemplateHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { code } = req.params as { code: string };
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const service = await ctx.container.resolve<ApprovalTemplateService>(
      META_TOKENS.approvalTemplateService
    );

    try {
      await service.delete(code, tenantId);

      res.status(200).json({
        success: true,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: { code: "DELETE_FAILED", message: String(error) },
      });
    }
  }
}

// ============================================================================
// Nested Resource Handlers
// ============================================================================

export class GetStagesHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { code } = req.params as { code: string };
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const service = await ctx.container.resolve<ApprovalTemplateService>(
      META_TOKENS.approvalTemplateService
    );

    try {
      const template = await service.get(code, tenantId);
      if (!template) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: `Template not found: ${code}` },
        });
        return;
      }

      const stages = await service.getStages(template.id, tenantId);

      res.status(200).json({
        success: true,
        data: stages,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: String(error) },
      });
    }
  }
}

export class GetRulesHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { code } = req.params as { code: string };
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const service = await ctx.container.resolve<ApprovalTemplateService>(
      META_TOKENS.approvalTemplateService
    );

    try {
      const template = await service.get(code, tenantId);
      if (!template) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: `Template not found: ${code}` },
        });
        return;
      }

      const rules = await service.getRules(template.id, tenantId);

      res.status(200).json({
        success: true,
        data: rules,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: String(error) },
      });
    }
  }
}

// ============================================================================
// Validation & Compilation Handlers
// ============================================================================

export class ValidateTemplateHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { code } = req.params as { code: string };
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const service = await ctx.container.resolve<ApprovalTemplateService>(
      META_TOKENS.approvalTemplateService
    );

    try {
      const result = await service.validate(code, tenantId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: String(error) },
      });
    }
  }
}

export class CompileTemplateHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { code } = req.params as { code: string };
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const service = await ctx.container.resolve<ApprovalTemplateService>(
      META_TOKENS.approvalTemplateService
    );

    try {
      const compiled = await service.compile(code, tenantId);

      res.status(200).json({
        success: true,
        data: compiled,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { code: "COMPILATION_ERROR", message: String(error) },
      });
    }
  }
}

// ============================================================================
// Version Management Handlers
// ============================================================================

export class ListVersionsHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { code } = req.params as { code: string };
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const service = await ctx.container.resolve<ApprovalTemplateService>(
      META_TOKENS.approvalTemplateService
    );

    try {
      const versions = await service.listVersions(code, tenantId);

      res.status(200).json({
        success: true,
        data: versions,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: String(error) },
      });
    }
  }
}

export class RollbackHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { code } = req.params as { code: string };
    const { targetVersion } = req.body as { targetVersion: number };
    const userId = ctx.auth.userId ?? ctx.auth.subject ?? "system";
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const service = await ctx.container.resolve<ApprovalTemplateService>(
      META_TOKENS.approvalTemplateService
    );

    try {
      const template = await service.rollback(code, targetVersion, tenantId, userId);

      res.status(200).json({
        success: true,
        data: template,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: { code: "ROLLBACK_FAILED", message: String(error) },
      });
    }
  }
}

export class DiffHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { code } = req.params as { code: string };
    const { v1, v2 } = req.query as { v1?: string; v2?: string };
    const tenantId = ctx.tenant.tenantKey ?? "default";

    if (!v1 || !v2) {
      res.status(400).json({
        success: false,
        error: { code: "MISSING_PARAMS", message: "Query params v1 and v2 are required" },
      });
      return;
    }

    const service = await ctx.container.resolve<ApprovalTemplateService>(
      META_TOKENS.approvalTemplateService
    );

    try {
      const diff = await service.diff(code, parseInt(v1, 10), parseInt(v2, 10), tenantId);

      res.status(200).json({
        success: true,
        data: diff,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { code: "DIFF_ERROR", message: String(error) },
      });
    }
  }
}

export class ImpactAnalysisHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { code } = req.params as { code: string };
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const service = await ctx.container.resolve<ApprovalTemplateService>(
      META_TOKENS.approvalTemplateService
    );

    try {
      const impact = await service.impactAnalysis(code, tenantId);

      res.status(200).json({
        success: true,
        data: impact,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { code: "IMPACT_ANALYSIS_ERROR", message: String(error) },
      });
    }
  }
}

export class TestResolutionHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    const { code } = req.params as { code: string };
    const context = req.body as Record<string, unknown>;
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const service = await ctx.container.resolve<ApprovalTemplateService>(
      META_TOKENS.approvalTemplateService
    );

    try {
      const result = await service.testResolution(code, context, tenantId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { code: "RESOLUTION_ERROR", message: String(error) },
      });
    }
  }
}
