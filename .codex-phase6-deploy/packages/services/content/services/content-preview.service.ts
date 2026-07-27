/**
 * ContentPreviewService — Phase 5.4
 *
 * Generates preview thumbnails for content items stored in object storage.
 *
 * Phase 0 decision: preview generation strategy per format:
 *   - Images (PNG, JPEG, GIF, WEBP): Sharp (lightweight, no child process)
 *   - PDFs: athyper-renderer container via /render endpoint (Chromium)
 *   - Office (DOCX, XLSX): Not supported in v1 — no preview generated.
 *     Caller receives status=skipped for office formats.
 *
 * IMPORTANT: Sharp is a native module requiring native bindings.
 * It is imported dynamically — failure to load (e.g. missing native module
 * in some environments) results in status=skipped for image previews.
 *
 * The generate-previews worker runs in the main API container for Sharp
 * (single process, no child process). PDF previews are delegated to
 * the athyper-renderer container (separate process). This satisfies the
 * "must not run in main API container for child-process formats" constraint.
 *
 * Preview storage key: previews/{tenantId}/{contentItemId}/{versionId}.jpg
 * Thumbnail size: 400×400 (fit: inside, background: white).
 */

import type { ObjectStorageAdapter } from "@athyper/adapter-object-storage";
import type { PdfRendererClient } from "@athyper/server-foundation/render/pdf-renderer-client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PreviewStatus = "generated" | "skipped" | "failed";

export interface PreviewResult {
  status:          PreviewStatus;
  previewKey:      string | null;
  previewMimeType: string | null;
  reason?:         string;
}

export type ContentMimeType =
  | "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/svg+xml"
  | "application/pdf"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  | "text/html" | "text/plain"
  | string;

// ── ContentPreviewService ─────────────────────────────────────────────────────

export class ContentPreviewService {
  private readonly storage:  ObjectStorageAdapter | null;
  private readonly renderer: PdfRendererClient | null;

  constructor(
    storage:  ObjectStorageAdapter | null,
    renderer: PdfRendererClient | null,
  ) {
    this.storage  = storage;
    this.renderer = renderer;
  }

  /**
   * Generate a preview thumbnail for a content item version.
   *
   * @param tenantId     Tenant UUID
   * @param contentItemId Content item UUID
   * @param versionId    Content version UUID
   * @param sourceKey    S3 object key of the source file
   * @param mimeType     MIME type of the source file
   */
  async generatePreview(
    tenantId:      string,
    contentItemId: string,
    versionId:     string,
    sourceKey:     string,
    mimeType:      ContentMimeType,
  ): Promise<PreviewResult> {
    if (!this.storage) {
      return { status: "skipped", previewKey: null, previewMimeType: null, reason: "storage_unavailable" };
    }

    const previewKey = `previews/${tenantId}/${contentItemId}/${versionId}.jpg`;

    try {
      if (this.isImageFormat(mimeType)) {
        return await this.generateImagePreview(sourceKey, previewKey);
      }

      if (mimeType === "application/pdf") {
        return await this.generatePdfPreview(sourceKey, previewKey, tenantId);
      }

      // Office formats and others: skip in v1
      return {
        status:          "skipped",
        previewKey:      null,
        previewMimeType: null,
        reason:          `unsupported_format:${mimeType}`,
      };
    } catch (err) {
      return {
        status:          "failed",
        previewKey:      null,
        previewMimeType: null,
        reason:          err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Check if preview exists for a version.
   */
  async previewExists(
    tenantId:      string,
    contentItemId: string,
    versionId:     string,
  ): Promise<boolean> {
    if (!this.storage) return false;
    const key = `previews/${tenantId}/${contentItemId}/${versionId}.jpg`;
    return this.storage.exists(key).catch(() => false);
  }

  /**
   * Get presigned URL for an existing preview.
   */
  async getPreviewUrl(
    tenantId:      string,
    contentItemId: string,
    versionId:     string,
    ttlSeconds = 3600,
  ): Promise<string | null> {
    if (!this.storage) return null;
    const key = `previews/${tenantId}/${contentItemId}/${versionId}.jpg`;
    const exists = await this.storage.exists(key).catch(() => false);
    if (!exists) return null;
    return this.storage.getPresignedUrl(key, ttlSeconds);
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private isImageFormat(mimeType: string): boolean {
    return ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(mimeType);
  }

  private async generateImagePreview(
    sourceKey:  string,
    previewKey: string,
  ): Promise<PreviewResult> {
    // Dynamic import Sharp — may not be available in all environments
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sharp: ((input: Buffer) => any) | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sharp = ((await import("sharp" as string)) as any).default;
    } catch {
      return { status: "skipped", previewKey: null, previewMimeType: null, reason: "sharp_not_available" };
    }

    if (!sharp) {
      return { status: "skipped", previewKey: null, previewMimeType: null, reason: "sharp_not_available" };
    }

    const sourceBuffer = await this.storage!.get(sourceKey);

    const previewBuffer = await sharp(sourceBuffer)
      .resize(400, 400, { fit: "inside", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .jpeg({ quality: 80 })
      .toBuffer();

    await this.storage!.put(previewKey, previewBuffer, { contentType: "image/jpeg" });

    return { status: "generated", previewKey, previewMimeType: "image/jpeg" };
  }

  private async generatePdfPreview(
    sourceKey:  string,
    previewKey: string,
    tenantId:   string,
  ): Promise<PreviewResult> {
    if (!this.renderer) {
      return { status: "skipped", previewKey: null, previewMimeType: null, reason: "renderer_unavailable" };
    }

    // Fetch the PDF, generate a single-page HTML wrapper for the renderer to screenshot
    // The renderer takes HTML + renders to PDF — for preview we ask it to render the first
    // page as an image by wrapping the PDF URL in an embed tag.
    // Phase 5.4 note: This is the v1 approach. A better approach in v2 would be to
    // use a Puppeteer screenshot endpoint on the renderer rather than PDF generation.
    const pdfUrl = await this.storage!.getPresignedUrl(sourceKey, 300).catch(() => null);
    if (!pdfUrl) {
      return { status: "skipped", previewKey: null, previewMimeType: null, reason: "presigned_url_failed" };
    }

    const html = `<!DOCTYPE html>
<html><head><style>
  body { margin: 0; background: white; }
  embed { width: 400px; height: 400px; }
</style></head>
<body><embed src="${pdfUrl}" type="application/pdf" /></body>
</html>`;

    // Render via PDF renderer (produces a preview PDF of the first page)
    const pdfBuffer = await this.renderer.renderSync(html, {
      format:    "A4",
      printBackground: true,
      margin:    { top: "0", bottom: "0", left: "0", right: "0" },
    });

    await this.storage!.put(previewKey, pdfBuffer, { contentType: "application/pdf" });

    // For v1, the preview IS a PDF (not an image thumbnail)
    // v2 will use a dedicated screenshot endpoint to produce a JPEG
    return { status: "generated", previewKey, previewMimeType: "application/pdf" };
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createContentPreviewService(
  storage:  ObjectStorageAdapter | null,
  renderer: PdfRendererClient | null,
): ContentPreviewService {
  return new ContentPreviewService(storage, renderer);
}

