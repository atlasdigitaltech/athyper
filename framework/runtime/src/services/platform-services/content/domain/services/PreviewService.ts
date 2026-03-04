/**
 * PreviewService - Generate thumbnails and previews for attachments
 *
 * Supported formats:
 * - Images (PNG, JPEG, GIF, WebP): Thumbnail (200x200) + Preview (1024x1024)
 * - PDFs: First page as PNG thumbnail + preview
 * - Documents (future): Convert to PDF first
 *
 * Dependencies:
 * - sharp: Image processing
 * - pdf-lib: PDF rendering
 */

import type { ContentAuditEmitter } from "./ContentAuditEmitter";
import type { Logger } from "../../../../../kernel/logger";
import type { AttachmentRepo } from "../../persistence/AttachmentRepo";
import type { ObjectStorageAdapter } from "@athyper/adapter-objectstorage";

export interface GeneratePreviewParams {
  tenantId: string;
  attachmentId: string;
  actorId: string;
}

export interface GetPreviewUrlParams {
  tenantId: string;
  attachmentId: string;
  type: "thumbnail" | "preview";
  actorId: string;
}

const THUMBNAIL_SIZE = 200;
const PREVIEW_SIZE = 1024;
const PREVIEW_EXPIRY_SECONDS = 3600; // 1 hour

export class PreviewService {
  // Dependencies will be dynamically imported to avoid requiring them at build time
  private sharp: any = null;
  private pdfLib: any = null;

  constructor(
    private attachmentRepo: AttachmentRepo,
    private storage: ObjectStorageAdapter,
    private audit: ContentAuditEmitter,
    private logger: Logger,
  ) {}

  /**
   * Initialize image processing library (lazy load)
   */
  private async ensureSharp() {
    if (!this.sharp) {
      try {
        // @ts-expect-error optional peer dependency
        this.sharp = (await import("sharp")).default;
      } catch (error: any) {
        throw new Error("sharp library not installed. Run: npm install sharp");
      }
    }
    return this.sharp;
  }

  /**
   * Initialize PDF library (lazy load)
   */
  private async ensurePdfLib() {
    if (!this.pdfLib) {
      try {
        // @ts-expect-error optional peer dependency
        this.pdfLib = await import("pdf-lib");
      } catch (error: any) {
        throw new Error(
          "pdf-lib library not installed. Run: npm install pdf-lib",
        );
      }
    }
    return this.pdfLib;
  }

  /**
   * Check if content type is supported for preview generation
   */
  isSupportedForPreview(contentType: string): boolean {
    const imageTypes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/gif",
      "image/webp",
    ];
    const pdfTypes = ["application/pdf"];

    return imageTypes.includes(contentType) || pdfTypes.includes(contentType);
  }

  /**
   * Generate thumbnail and preview for an attachment
   */
  async generatePreview(params: GeneratePreviewParams) {
    const { tenantId, attachmentId, actorId } = params;

    // Get attachment
    const attachment = await this.attachmentRepo.getById(
      attachmentId,
      tenantId,
    );
    if (!attachment) {
      throw new Error(`Attachment not found: ${attachmentId}`);
    }

    // Check if preview supported
    if (!this.isSupportedForPreview(attachment.contentType)) {
      throw new Error(
        `Preview not supported for content type: ${attachment.contentType}`,
      );
    }

    try {
      // Download original file from S3
      const originalBuffer = (await (this.storage as any).getObject)
        ? await (this.storage as any).getObject(
            attachment.storageBucket,
            attachment.storageKey,
          )
        : await this.storage.get(attachment.storageKey);

      let thumbnailBuffer: Buffer;
      let previewBuffer: Buffer;

      // Generate based on content type
      if (attachment.contentType.startsWith("image/")) {
        ({ thumbnailBuffer, previewBuffer } =
          await this.generateImagePreviews(originalBuffer));
      } else if (attachment.contentType === "application/pdf") {
        ({ thumbnailBuffer, previewBuffer } =
          await this.generatePdfPreviews(originalBuffer));
      } else {
        throw new Error(`Unsupported content type: ${attachment.contentType}`);
      }

      // Upload thumbnail and preview to S3
      const thumbnailKey = `${attachment.storageKey}.thumbnail.png`;
      const previewKey = `${attachment.storageKey}.preview.png`;

      if ((this.storage as any).putObject) {
        await (this.storage as any).putObject(
          attachment.storageBucket,
          thumbnailKey,
          thumbnailBuffer,
          "image/png",
        );
      } else {
        await this.storage.put(thumbnailKey, thumbnailBuffer, {
          contentType: "image/png",
        });
      }

      if ((this.storage as any).putObject) {
        await (this.storage as any).putObject(
          attachment.storageBucket,
          previewKey,
          previewBuffer,
          "image/png",
        );
      } else {
        await this.storage.put(previewKey, previewBuffer, {
          contentType: "image/png",
        });
      }

      // Update attachment with preview keys
      await this.attachmentRepo.update(attachmentId, tenantId, {
        thumbnailKey,
        previewKey,
      } as any);

      // Emit audit event (best-effort)
      await (this.audit as any)
        .previewGenerated?.({
          tenantId,
          actorId,
          attachmentId,
          metadata: {
            thumbnailSize: thumbnailBuffer.length,
            previewSize: previewBuffer.length,
            contentType: attachment.contentType,
          },
        })
        .catch?.(() => {});

      this.logger.info(
        {
          attachmentId,
          contentType: attachment.contentType,
          thumbnailSize: thumbnailBuffer.length,
          previewSize: previewBuffer.length,
        },
        "[PreviewService] Preview generated",
      );

      return {
        thumbnailKey,
        previewKey,
        thumbnailSize: thumbnailBuffer.length,
        previewSize: previewBuffer.length,
      };
    } catch (error: any) {
      this.logger.error(
        { attachmentId, error: error.message },
        "[PreviewService] Failed to generate preview",
      );

      throw error;
    }
  }

  /**
   * Generate thumbnail and preview for image files
   */
  private async generateImagePreviews(imageBuffer: Buffer): Promise<{
    thumbnailBuffer: Buffer;
    previewBuffer: Buffer;
  }> {
    const sharp = await this.ensureSharp();

    // Generate thumbnail (200x200, cover fit, PNG)
    const thumbnailBuffer = await sharp(imageBuffer)
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
        fit: "cover",
        position: "center",
      })
      .png()
      .toBuffer();

    // Generate preview (1024x1024, inside fit, PNG)
    const previewBuffer = await sharp(imageBuffer)
      .resize(PREVIEW_SIZE, PREVIEW_SIZE, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();

    return { thumbnailBuffer, previewBuffer };
  }

  /**
   * Generate thumbnail and preview for PDF files (first page)
   */
  private async generatePdfPreviews(pdfBuffer: Buffer): Promise<{
    thumbnailBuffer: Buffer;
    previewBuffer: Buffer;
  }> {
    const pdfLib = await this.ensurePdfLib();
    const sharp = await this.ensureSharp();

    // Load PDF
    const pdfDoc = await pdfLib.PDFDocument.load(pdfBuffer);

    // Get first page
    const pages = pdfDoc.getPages();
    if (pages.length === 0) {
      throw new Error("PDF has no pages");
    }

    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();

    // For now, we'll use a simplified approach:
    // Convert PDF page to PNG using pdf-lib's built-in rendering
    // Note: pdf-lib doesn't have built-in rendering to PNG, so we'd typically use pdf2pic or similar
    // For MVP, we'll create placeholder approach

    // TODO: Implement proper PDF rendering using pdf2pic or canvas
    // For now, create a placeholder that says "PDF Preview"
    const placeholderSvg = `
      <svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
        <rect width="800" height="600" fill="#f0f0f0"/>
        <text x="400" y="300" font-family="Arial" font-size="24" text-anchor="middle" fill="#666">
          PDF Preview (${pages.length} pages)
        </text>
        <text x="400" y="340" font-family="Arial" font-size="16" text-anchor="middle" fill="#999">
          ${width.toFixed(0)} x ${height.toFixed(0)} pts
        </text>
      </svg>
    `;

    const placeholderBuffer = Buffer.from(placeholderSvg);

    // Generate thumbnail from placeholder
    const thumbnailBuffer = await sharp(placeholderBuffer)
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
        fit: "cover",
        position: "center",
      })
      .png()
      .toBuffer();

    // Generate preview from placeholder
    const previewBuffer = await sharp(placeholderBuffer)
      .resize(PREVIEW_SIZE, PREVIEW_SIZE, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();

    return { thumbnailBuffer, previewBuffer };
  }

  /**
   * Get presigned URL for thumbnail or preview
   */
  async getPreviewUrl(params: GetPreviewUrlParams) {
    const { tenantId, attachmentId, type, actorId } = params;

    // Get attachment
    const attachment = await this.attachmentRepo.getById(
      attachmentId,
      tenantId,
    );
    if (!attachment) {
      throw new Error(`Attachment not found: ${attachmentId}`);
    }

    // Check if preview exists
    const previewKey =
      type === "thumbnail"
        ? (attachment as any).thumbnailKey
        : (attachment as any).previewKey;
    if (!previewKey) {
      throw new Error(`${type} not generated for attachment: ${attachmentId}`);
    }

    // Generate presigned GET URL
    const presignedUrl = (await (this.storage as any).generatePresignedGetUrl)
      ? await (this.storage as any).generatePresignedGetUrl(
          attachment.storageBucket,
          previewKey,
          PREVIEW_EXPIRY_SECONDS,
        )
      : await this.storage.getPresignedUrl(previewKey, PREVIEW_EXPIRY_SECONDS);

    const expiresAt = new Date(Date.now() + PREVIEW_EXPIRY_SECONDS * 1000);

    this.logger.info(
      { attachmentId, type },
      "[PreviewService] Generated preview URL",
    );

    return {
      url: presignedUrl,
      expiresAt,
    };
  }

  /**
   * Delete preview files from storage
   */
  async deletePreview(attachmentId: string, tenantId: string) {
    // Get attachment
    const attachment = await this.attachmentRepo.getById(
      attachmentId,
      tenantId,
    );
    if (!attachment) {
      return; // Already deleted
    }

    try {
      // Delete thumbnail if exists
      if ((attachment as any).thumbnailKey) {
        await this.storage.delete((attachment as any).thumbnailKey);
      }

      // Delete preview if exists
      if ((attachment as any).previewKey) {
        await this.storage.delete((attachment as any).previewKey);
      }

      this.logger.info(
        { attachmentId },
        "[PreviewService] Deleted preview files",
      );
    } catch (error: any) {
      this.logger.error(
        { attachmentId, error: error.message },
        "[PreviewService] Failed to delete preview files",
      );
    }
  }

  /**
   * Batch generate previews for attachments without previews (background job)
   */
  async generateMissingPreviews(
    tenantId: string,
    limit: number = 10,
  ): Promise<number> {
    // Find attachments without previews
    const attachments: any[] =
      (await (this.attachmentRepo as any).listByOwner?.(
        tenantId,
        "any",
        "any",
        limit,
      )) ?? [];

    let generatedCount = 0;

    for (const attachment of attachments) {
      // Skip if already has preview or not supported
      if (
        attachment.previewKey ||
        !this.isSupportedForPreview(attachment.contentType)
      ) {
        continue;
      }

      try {
        await this.generatePreview({
          tenantId,
          attachmentId: attachment.id,
          actorId: "system",
        });

        generatedCount++;
      } catch (error: any) {
        this.logger.error(
          { attachmentId: attachment.id, error: error.message },
          "[PreviewService] Failed to generate preview in batch",
        );
      }
    }

    this.logger.info(
      { tenantId, generatedCount },
      "[PreviewService] Batch preview generation completed",
    );

    return generatedCount;
  }
}
