/**
 * Output handlers — List, get, download (streaming), deliver, revoke, verify.
 *
 * Enhancements:
 * - DownloadOutputHandler streams PDF directly via storageAdapter.retrieve()
 * - Audit events emitted for download, deliver, and revoke actions
 */

import { TOKENS } from "../../../../../kernel/tokens.js";

import type { RuntimeConfig } from "../../../../../kernel/config.schema.js";
import type {
  RouteHandler,
  HttpHandlerContext,
} from "../../../../platform/foundation/http/types.js";
import type { DocAuditEmitter } from "../../domain/services/DocAuditEmitter.js";
import type { DocOutputService } from "../../domain/services/DocOutputService.js";
import type { OutputId, OutputListFilters } from "../../domain/types.js";
import type { Request, Response } from "express";

export class ListOutputsHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const service = await ctx.container.resolve<DocOutputService>(
      TOKENS.documentOutputService,
    );
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const filters: OutputListFilters = {
      entityName: req.query.entityName as string | undefined,
      entityId: req.query.entityId as string | undefined,
      status: req.query.status as any,
      operation: req.query.operation as string | undefined,
      limit: Number(req.query.limit) || 100,
      offset: Number(req.query.offset) || 0,
    };

    const outputs = await service.list(tenantId, filters);
    res.status(200).json({ success: true, data: outputs });
  }
}

export class GetOutputHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const service = await ctx.container.resolve<DocOutputService>(
      TOKENS.documentOutputService,
    );
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const output = await service.getById(tenantId, req.params.id as OutputId);
    if (!output) {
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Output not found" },
      });
      return;
    }

    res.status(200).json({ success: true, data: output });
  }
}

export class DownloadOutputHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const service = await ctx.container.resolve<DocOutputService>(
      TOKENS.documentOutputService,
    );
    const config = await ctx.container.resolve<RuntimeConfig>(TOKENS.config);
    const tenantId = ctx.tenant.tenantKey ?? "default";
    const userId = ctx.auth.userId ?? "system";
    const downloadMode = config.document?.storage?.downloadMode ?? "stream";

    try {
      // Emit audit event for download (best-effort)
      try {
        const auditEmitter = await ctx.container.resolve<DocAuditEmitter>(
          TOKENS.documentAuditEmitter,
        );
        await auditEmitter.outputDownloaded(
          { kind: "user", userId },
          tenantId,
          req.params.id,
        );
      } catch {
        // audit is best-effort
      }

      if (downloadMode === "presigned") {
        const url = await service.getDownloadUrl(
          req.params.id as OutputId,
          tenantId,
        );
        res.redirect(302, url);
        return;
      }

      // Default: stream mode
      const result = await service.getStreamableOutput(
        req.params.id as OutputId,
        tenantId,
      );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Length", String(result.sizeBytes));
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${result.filename}"`,
      );
      if (result.checksum) {
        res.setHeader("X-Checksum", result.checksum);
      }
      res.status(200).send(result.buffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes("not found")
        ? 404
        : message.includes("revoked")
          ? 403
          : 500;
      res
        .status(status)
        .json({ success: false, error: { code: "DOWNLOAD_ERROR", message } });
    }
  }
}

export class MarkDeliveredHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const service = await ctx.container.resolve<DocOutputService>(
      TOKENS.documentOutputService,
    );

    try {
      await service.markDelivered(req.params.id as OutputId);

      // Emit audit event (best-effort)
      try {
        const tenantId = ctx.tenant.tenantKey ?? "default";
        const auditEmitter = await ctx.container.resolve<DocAuditEmitter>(
          TOKENS.documentAuditEmitter,
        );
        await auditEmitter.outputDelivered(tenantId, req.params.id);
      } catch {
        // audit is best-effort
      }

      res.status(200).json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res
        .status(400)
        .json({ success: false, error: { code: "STATUS_ERROR", message } });
    }
  }
}

export class RevokeOutputHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const service = await ctx.container.resolve<DocOutputService>(
      TOKENS.documentOutputService,
    );
    const userId = ctx.auth.userId ?? "system";
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const body = req.body as { reason?: string };
    if (!body.reason) {
      res.status(400).json({
        success: false,
        error: { code: "MISSING_FIELDS", message: "reason is required" },
      });
      return;
    }

    try {
      await service.revoke(req.params.id as OutputId, userId, body.reason);

      // Emit audit event (best-effort)
      try {
        const auditEmitter = await ctx.container.resolve<DocAuditEmitter>(
          TOKENS.documentAuditEmitter,
        );
        await auditEmitter.outputRevoked(
          { kind: "user", userId },
          tenantId,
          req.params.id,
          body.reason,
        );
      } catch {
        // audit is best-effort
      }

      res.status(200).json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res
        .status(400)
        .json({ success: false, error: { code: "REVOKE_ERROR", message } });
    }
  }
}

export class VerifyOutputHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const service = await ctx.container.resolve<DocOutputService>(
      TOKENS.documentOutputService,
    );
    const tenantId = ctx.tenant.tenantKey ?? "default";

    try {
      const result = await service.verifyIntegrity(
        req.params.id as OutputId,
        tenantId,
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res
        .status(404)
        .json({ success: false, error: { code: "VERIFY_ERROR", message } });
    }
  }
}
