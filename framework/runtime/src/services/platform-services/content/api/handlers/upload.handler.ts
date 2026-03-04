/**
 * Upload Handlers - File upload initiation, completion, download, delete
 */

import { TOKENS } from "../../../../../kernel/tokens.js";
import { DocumentKind } from "../../domain/content-taxonomy.js";

import type {
  RouteHandler,
  HttpHandlerContext,
} from "../../../../platform/foundation/http/types.js";
import type { ContentService } from "../../domain/services/ContentService.js";
import type { Request, Response } from "express";

/**
 * POST /api/content/initiate
 * Initiate file upload
 */
export class InitiateUploadHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const contentService = await ctx.container.resolve<ContentService>(
      TOKENS.contentService,
    );
    const tenantId = ctx.tenant.tenantKey ?? "default";
    const actorId = ctx.auth.userId ?? "anonymous";

    const body = req.body as {
      entityType: string;
      entityId: string;
      kind: string;
      fileName: string;
      contentType: string;
      sizeBytes: number;
    };

    // Validate required fields
    if (
      !body.entityType ||
      !body.entityId ||
      !body.kind ||
      !body.fileName ||
      !body.contentType ||
      !body.sizeBytes
    ) {
      res.status(400).json({
        success: false,
        error: {
          code: "MISSING_FIELDS",
          message:
            "entityType, entityId, kind, fileName, contentType, and sizeBytes are required",
        },
      });
      return;
    }

    // Validate kind
    const kindResult = DocumentKind.safeParse(body.kind);
    if (!kindResult.success) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_KIND",
          message: `Invalid document kind: ${body.kind}`,
        },
      });
      return;
    }

    try {
      const result = await contentService.initiateUpload({
        tenantId,
        entityType: body.entityType,
        entityId: body.entityId,
        kind: kindResult.data,
        fileName: body.fileName,
        contentType: body.contentType,
        sizeBytes: body.sizeBytes,
        actorId,
      });

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        error: { code: "UPLOAD_INIT_ERROR", message },
      });
    }
  }
}

/**
 * POST /api/content/complete
 * Complete file upload
 */
export class CompleteUploadHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const contentService = await ctx.container.resolve<ContentService>(
      TOKENS.contentService,
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
      await contentService.completeUpload({
        uploadId: body.uploadId,
        tenantId,
        sha256: body.sha256,
        actorId,
      });

      res
        .status(200)
        .json({ success: true, data: { uploadId: body.uploadId } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        error: { code: "UPLOAD_COMPLETE_ERROR", message },
      });
    }
  }
}

/**
 * GET /api/content/download/:id
 * Get presigned download URL
 */
export class GetDownloadUrlHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const contentService = await ctx.container.resolve<ContentService>(
      TOKENS.contentService,
    );
    const tenantId = ctx.tenant.tenantKey ?? "default";
    const actorId = ctx.auth.userId ?? "anonymous";

    const attachmentId = req.params.id;
    if (!attachmentId) {
      res.status(400).json({
        success: false,
        error: { code: "MISSING_ID", message: "Attachment ID is required" },
      });
      return;
    }

    try {
      const result = await contentService.getDownloadUrl(
        attachmentId,
        tenantId,
        actorId,
        req.ip,
        req.get("user-agent"),
      );

      // Log access (non-blocking)
      try {
        const accessLogService = await ctx.container.resolve<any>(
          TOKENS.accessLogService,
        );
        await accessLogService.logAccess({
          tenantId,
          attachmentId,
          actorId,
          action: "download",
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
        });
      } catch (logError) {
        // Don't fail the request if logging fails
        console.warn("Failed to log access:", logError);
      }

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("not found")) {
        res
          .status(404)
          .json({ success: false, error: { code: "NOT_FOUND", message } });
      } else {
        res
          .status(500)
          .json({ success: false, error: { code: "DOWNLOAD_ERROR", message } });
      }
    }
  }
}

/**
 * DELETE /api/content/delete/:id
 * Delete file
 */
export class DeleteFileHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const contentService = await ctx.container.resolve<ContentService>(
      TOKENS.contentService,
    );
    const tenantId = ctx.tenant.tenantKey ?? "default";
    const actorId = ctx.auth.userId ?? "anonymous";

    const attachmentId = req.params.id;
    if (!attachmentId) {
      res.status(400).json({
        success: false,
        error: { code: "MISSING_ID", message: "Attachment ID is required" },
      });
      return;
    }

    // Optional: hard delete flag
    const hardDelete = req.query.hard === "true";

    try {
      // Delete preview files if they exist (non-blocking)
      try {
        const previewService = await ctx.container.resolve<any>(
          TOKENS.previewService,
        );
        await previewService.deletePreview(attachmentId, tenantId);
      } catch (previewError) {
        // Don't fail the request if preview deletion fails
        console.warn("Failed to delete preview:", previewError);
      }

      await contentService.deleteFile({
        attachmentId,
        tenantId,
        actorId,
        hardDelete,
      });

      res.status(200).json({ success: true, data: { attachmentId } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("not found")) {
        res
          .status(404)
          .json({ success: false, error: { code: "NOT_FOUND", message } });
      } else {
        res
          .status(500)
          .json({ success: false, error: { code: "DELETE_ERROR", message } });
      }
    }
  }
}

/**
 * GET /api/content/by-entity
 * List attachments for entity
 */
export class ListByEntityHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const contentService = await ctx.container.resolve<ContentService>(
      TOKENS.contentService,
    );
    const tenantId = ctx.tenant.tenantKey ?? "default";

    const entityType = req.query.entity as string;
    const entityId = req.query.id as string;
    const kind = req.query.kind as string | undefined;

    if (!entityType || !entityId) {
      res.status(400).json({
        success: false,
        error: {
          code: "MISSING_PARAMS",
          message: "entity and id query params are required",
        },
      });
      return;
    }

    try {
      const attachments = await contentService.listByEntity(
        tenantId,
        entityType,
        entityId,
        {
          kind,
          currentOnly: true,
        },
      );

      res.status(200).json({ success: true, data: attachments });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res
        .status(500)
        .json({ success: false, error: { code: "LIST_ERROR", message } });
    }
  }
}

/**
 * GET /api/content/meta/:id
 * Get attachment metadata
 */
export class GetMetadataHandler implements RouteHandler {
  async handle(
    req: Request,
    res: Response,
    ctx: HttpHandlerContext,
  ): Promise<void> {
    const contentService = await ctx.container.resolve<ContentService>(
      TOKENS.contentService,
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
      const metadata = await contentService.getMetadata(attachmentId, tenantId);

      if (!metadata) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Attachment not found" },
        });
        return;
      }

      res.status(200).json({ success: true, data: metadata });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res
        .status(500)
        .json({ success: false, error: { code: "METADATA_ERROR", message } });
    }
  }
}
