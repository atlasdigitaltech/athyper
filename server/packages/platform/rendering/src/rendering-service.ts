import type {
  PdfRenderRequest,
  PdfRenderer,
  RenderedPdf,
} from "@athyper/server-contract-rendering";

export class RendererUnavailableError extends Error {
  constructor() {
    super("PDF renderer is not configured");
    this.name = "RendererUnavailableError";
  }
}

export interface RenderingService {
  renderPdf(request: PdfRenderRequest): Promise<RenderedPdf>;
  isAvailable(): Promise<boolean>;
}

/** Capability facade; template resolution, output persistence, and storage remain upstream. */
export function createRenderingService(renderer?: PdfRenderer): RenderingService {
  return {
    async renderPdf(request) {
      if (!renderer) throw new RendererUnavailableError();
      return renderer.renderPdf(request);
    },
    async isAvailable() {
      if (!renderer) return false;
      return (await renderer.health()).status !== "unhealthy";
    },
  };
}
