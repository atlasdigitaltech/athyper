import type { HealthContribution } from "@athyper/server-foundation/observability";

export type PdfPageFormat = "A3" | "A4" | "A5" | "B4" | "Letter" | "Legal";

export interface PdfPageMargins {
  readonly top?: number;
  readonly right?: number;
  readonly bottom?: number;
  readonly left?: number;
}

export interface PdfRenderOptions {
  readonly format?: PdfPageFormat;
  readonly landscape?: boolean;
  readonly printBackground?: boolean;
  readonly marginsInches?: PdfPageMargins;
  readonly scale?: number;
  readonly headerHtml?: string;
  readonly footerHtml?: string;
}

export interface PdfRenderRequest {
  readonly html: string;
  readonly documentName?: string;
  readonly options?: PdfRenderOptions;
}

export interface RenderedPdf {
  readonly bytes: Uint8Array;
  readonly mediaType: "application/pdf";
  readonly provider: string;
  readonly durationMs: number;
}

/** Capability-neutral synchronous HTML-to-PDF boundary. */
export interface PdfRenderer {
  renderPdf(request: PdfRenderRequest): Promise<RenderedPdf>;
  health(): Promise<HealthContribution>;
}
