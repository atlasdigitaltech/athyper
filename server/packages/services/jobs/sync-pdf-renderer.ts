/**
 * Structural contract for any synchronous PDF renderer the render-document
 * worker can call. Defined locally inside svc-jobs so the package builds
 * without reaching into the runtime foundation render package.
 *
 * The concrete implementation lives at
 * server/packages/foundation/render/gotenberg-client.ts (Gotenberg HTTP client).
 * Bootstrap injects an instance of that class wherever this interface is
 * required — TypeScript's structural typing makes the connection at the
 * call site without an import.
 *
 * Mirrors server/packages/foundation/render/pdf-renderer-client.ts intentionally; if
 * either side adds an option, mirror it here.
 */

export interface PdfRenderOptions {
  format?:              "A4" | "A3" | "Letter" | "Legal";
  printBackground?:     boolean;
  margin?:              { top?: string; bottom?: string; left?: string; right?: string };
  headerTemplate?:      string;
  footerTemplate?:      string;
  displayHeaderFooter?: boolean;
  scale?:               number;
  landscape?:           boolean;
}

export interface SyncPdfRenderer {
  renderSync(html: string, options?: PdfRenderOptions): Promise<Buffer>;
  isAvailable(): Promise<boolean>;
}
