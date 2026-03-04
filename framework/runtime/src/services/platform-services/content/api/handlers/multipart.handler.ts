/**
 * Multipart Upload API Handlers
 *
 * Routes:
 * - POST /api/content/multipart/initiate
 * - POST /api/content/multipart/parts
 * - POST /api/content/multipart/complete
 * - POST /api/content/multipart/abort
 */

import { TOKENS } from "../../../../../kernel/tokens.js";

import type { HttpHandlerContext, RouteHandler } from "../../../../platform/foundation/http/types.js";
import type { MultipartUploadService } from "../../domain/services/MultipartUploadService.js";
import type { Request, Response } from "express";


/**
 * Initiate multipart upload
 * POST /api/content/multipart/initiate
 * Body: { entityType, entityId, kind, fileName, contentType, sizeBytes }
 */
export class InitiateMultipartHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    try {
      const multipartService = await ctx.container.resolve<MultipartUploadService>(
        TOKENS.multipartUploadService
      );

      const tenantId = ctx.tenant.tenantKey ?? "default";
      const actorId = ctx.auth.userId ?? "anonymous";

      const { entityType, entityId, kind, fileName, contentType, sizeBytes } = req.body as {
        entityType?: string;
        entityId?: string;
        kind?: string;
        fileName?: string;
        contentType?: string;
        sizeBytes?: number;
      };

      // Validate required fields
      if (!entityType || !entityId || !kind || !fileName || !contentType || !sizeBytes) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Missing required fields",
          },
        });
        return;
      }

      const result = await multipartService.initiateMultipart({
        tenantId,
        entityType,
        entityId,
        kind: kind as any,
        fileName,
        contentType,
        sizeBytes,
        actorId,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: error.message },
      });
    }
  }
}

/**
 * Get presigned URLs for uploading parts
 * POST /api/content/multipart/parts
 * Body: { uploadId, partNumbers: [1, 2, 3, ...] }
 */
export class GetPartUploadUrlsHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    try {
      const multipartService = await ctx.container.resolve<MultipartUploadService>(
        TOKENS.multipartUploadService
      );

      const tenantId = ctx.tenant.tenantKey ?? "default";
      const actorId = ctx.auth.userId ?? "anonymous";

      const { uploadId, partNumbers } = req.body as {
        uploadId?: string;
        partNumbers?: number[];
      };

      if (!uploadId || !partNumbers || !Array.isArray(partNumbers)) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "uploadId and partNumbers (array) required",
          },
        });
        return;
      }

      const result = await multipartService.getPartUploadUrls({
        uploadId,
        tenantId,
        partNumbers,
        actorId,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      const statusCode = error.message.includes("not found") ? 404 : 500;

      res.status(statusCode).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: error.message },
      });
    }
  }
}

/**
 * Complete multipart upload
 * POST /api/content/multipart/complete
 * Body: { uploadId, parts: [{ PartNumber, ETag }, ...], sha256 }
 */
export class CompleteMultipartHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    try {
      const multipartService = await ctx.container.resolve<MultipartUploadService>(
        TOKENS.multipartUploadService
      );

      const tenantId = ctx.tenant.tenantKey ?? "default";
      const actorId = ctx.auth.userId ?? "anonymous";

      const { uploadId, parts, sha256 } = req.body as {
        uploadId?: string;
        parts?: Array<{ PartNumber: number; ETag: string }>;
        sha256?: string;
      };

      if (!uploadId || !parts || !sha256) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "uploadId, parts, and sha256 required",
          },
        });
        return;
      }

      const result = await multipartService.completeMultipart({
        uploadId,
        tenantId,
        parts,
        sha256,
        actorId,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      const statusCode = error.message.includes("not found") ? 404 : 500;

      res.status(statusCode).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: error.message },
      });
    }
  }
}

/**
 * Abort multipart upload
 * POST /api/content/multipart/abort
 * Body: { uploadId }
 */
export class AbortMultipartHandler implements RouteHandler {
  async handle(req: Request, res: Response, ctx: HttpHandlerContext): Promise<void> {
    try {
      const multipartService = await ctx.container.resolve<MultipartUploadService>(
        TOKENS.multipartUploadService
      );

      const tenantId = ctx.tenant.tenantKey ?? "default";
      const actorId = ctx.auth.userId ?? "anonymous";

      const { uploadId } = req.body as { uploadId?: string };

      if (!uploadId) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "uploadId required" },
        });
        return;
      }

      await multipartService.abortMultipart({
        uploadId,
        tenantId,
        actorId,
      });

      res.status(200).json({
        success: true,
        data: { uploadId },
      });
    } catch (error: any) {
      const statusCode = error.message.includes("not found") ? 404 : 500;

      res.status(statusCode).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: error.message },
      });
    }
  }
}
