/**
 * Renderer port — HTML → PDF/artifact conversion contract.
 *
 * Implemented by:
 *   adapters/rendering/gotenberg         — Gotenberg container (recommended)
 *   adapters/rendering/legacy-pdf-renderer — athyper-renderer container (legacy)
 */

export interface PdfRenderOptions {
  /** Paper format. Default: A4 */
  format?:               "A4" | "A3" | "Letter" | "Legal";
  printBackground?:      boolean;
  margin?:               { top?: string; bottom?: string; left?: string; right?: string };
  headerTemplate?:       string;
  footerTemplate?:       string;
  displayHeaderFooter?:  boolean;
  scale?:                number;
  landscape?:            boolean;
}

export interface RenderJobStatus {
  jobId:       string;
  status:      "pending" | "processing" | "completed" | "failed";
  downloadUrl: string | null;
  error:       string | null;
}

export interface RendererHealth {
  healthy:     boolean;
  browserPool: { active: number; idle: number; waiting: number } | null;
}

/** Synchronous HTML → PDF port injected by RenderDocumentService. */
export interface SyncPdfRenderer {
  renderSync(html: string, options?: PdfRenderOptions): Promise<Buffer>;
  isAvailable(): Promise<boolean>;
}
