/**
 * Version Handlers - Document version management
 */

import { TOKENS } from "../../../../../kernel/tokens.js";

import type {
  RouteHandler,
  HttpHandlerContext,
} from "../../../../platform/foundation/http/types.js";
import type { VersionService } from "../../domain/services/VersionService.js";
import type { Request, Response } from "express";

/**
 * GET /api/content/versions/:id
 * Get version history for document
 */
export class GetVersionsHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const versionService = await ctx.container.resolve<VersionService>(
      TOKENS.versionService,
    );
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const documentId = req.params.id;
    if (!documentId) {
      res.status(400).json({
        success: false,
        error: { code: "MISSING_ID", message: "Document ID is required" },
      });
      return;
    }

    try {
      const versions = await versionService.getVersionHistory(
        documentId,
        tenantId,
      );

      res.status(200).json({ success: true, data: versions });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        error: { code: "VERSION_HISTORY_ERROR", message },
      });
    }
  }
}

/**
 * POST /api/content/version/initiate
 * Initiate new version upload
 */
export class InitiateVersionHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const versionService = await ctx.container.resolve<VersionService>(
      TOKENS.versionService,
    );
    const tenantId = ctx.tenant.tenantKey ?? "default";
    const actorId = ctx.auth.userId ?? "anonymous";

    const body = req.body as {
      documentId: string;
      fileName: string;
      contentType: string;
      sizeBytes: number;
    };

    if (
      !body.documentId ||
      !body.fileName ||
      !body.contentType ||
      !body.sizeBytes
    ) {
      res.status(400).json({
        success: false,
        error: {
          code: "MISSING_FIELDS",
          message:
            "documentId, fileName, contentType, and sizeBytes are required",
        },
      });
      return;
    }

    try {
      const result = await versionService.initiateNewVersion({
        documentId: body.documentId,
        tenantId,
        fileName: body.fileName,
        contentType: body.contentType,
        sizeBytes: body.sizeBytes,
        actorId,
      });

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("not found")) {
        res
          .status(404)
          .json({ success: false, error: { code: "NOT_FOUND", message } });
      } else {
        res.status(500).json({
          success: false,
          error: { code: "VERSION_INIT_ERROR", message },
        });
      }
    }
  }
}

/**
 * POST /api/content/version/complete
 * Complete version upload
 */
export class CompleteVersionHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const versionService = await ctx.container.resolve<VersionService>(
      TOKENS.versionService,
    );
    const tenantId = ctx.tenant.tenantKey ?? "default";
    const actorId = ctx.auth.userId ?? "anonymous";

    const body = req.body as {
      uploadId: string;
      sha256: string;
    };

    if (!body.uploadId || !body.sha256) {
      res.status(400).json({
        success: false,
        error: {
          code: "MISSING_FIELDS",
          message: "uploadId and sha256 are required",
        },
      });
      return;
    }

    try {
      await versionService.completeVersionUpload(
        body.uploadId,
        tenantId,
        body.sha256,
        actorId,
      );

      res
        .status(200)
        .json({ success: true, data: { uploadId: body.uploadId } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        error: { code: "VERSION_COMPLETE_ERROR", message },
      });
    }
  }
}

/**
 * POST /api/content/version/restore
 * Restore previous version
 */
export class RestoreVersionHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const versionService = await ctx.container.resolve<VersionService>(
      TOKENS.versionService,
    );
    const tenantId = ctx.tenant.tenantKey ?? "default";
    const actorId = ctx.auth.userId ?? "anonymous";

    const body = req.body as {
      documentId: string;
      versionNo: number;
    };

    if (!body.documentId || body.versionNo === undefined) {
      res.status(400).json({
        success: false,
        error: {
          code: "MISSING_FIELDS",
          message: "documentId and versionNo are required",
        },
      });
      return;
    }

    try {
      const result = await versionService.restoreVersion({
        documentId: body.documentId,
        versionNo: body.versionNo,
        tenantId,
        actorId,
      });

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("not found")) {
        res
          .status(404)
          .json({ success: false, error: { code: "NOT_FOUND", message } });
      } else {
        res.status(500).json({
          success: false,
          error: { code: "VERSION_RESTORE_ERROR", message },
        });
      }
    }
  }
}
