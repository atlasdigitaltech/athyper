/**
 * GotenbergClient — HTML → PDF via the Gotenberg container.
 * Implements the SyncPdfRenderer port from @athyper/platform-rendering.
 */

import type { PdfRenderOptions, SyncPdfRenderer } from "@athyper/platform-rendering";

export type GotenbergErrorCategory = "transient" | "timeout" | "permanent" | "crash";

export class GotenbergError extends Error {
  readonly category: GotenbergErrorCategory;
  readonly statusCode: number | null;
  readonly responseBody: string | null;

  constructor(
    category: GotenbergErrorCategory,
    message: string,
    opts?: { statusCode?: number | null; responseBody?: string | null },
  ) {
    super(message);
    this.name = "GotenbergError";
    this.category = category;
    this.statusCode = opts?.statusCode ?? null;
    this.responseBody = opts?.responseBody ?? null;
  }
}

const PAPER_SIZES_IN: Record<string, { width: number; height: number }> = {
  A3:     { width: 11.69, height: 16.54 },
  A4:     { width: 8.27,  height: 11.69 },
  Letter: { width: 8.5,   height: 11 },
  Legal:  { width: 8.5,   height: 14 },
};

const MARGIN_INCHES_DEFAULT = { top: "0.4", bottom: "0.4", left: "0.4", right: "0.4" };
const A4_DEFAULT = { width: 8.27, height: 11.69 };

function parseMargin(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const match = value.match(/^\s*([\d.]+)/);
  return match?.[1] ?? fallback;
}

export class GotenbergClient implements SyncPdfRenderer {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };

  constructor(config: {
    baseUrl: string;
    timeoutMs?: number;
    logger?: { error(event: string, fields?: Record<string, unknown>): void; warn(event: string, fields?: Record<string, unknown>): void };
  }) {
    this.baseUrl   = config.baseUrl.replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs ?? 120_000;
    this.logger    = config.logger;
  }

  async renderSync(html: string, options?: PdfRenderOptions): Promise<Buffer> {
    const form = this.buildForm(html, options);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/forms/chromium/convert/html`, {
        method: "POST", body: form, signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if ((err as Error).name === "AbortError") {
        throw new GotenbergError("timeout", `Gotenberg request timed out after ${this.timeoutMs}ms`);
      }
      throw new GotenbergError("crash", `Gotenberg unreachable: ${(err as Error).message}`);
    }
    clearTimeout(timer);

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      throw this.classifyHttpError(response.status, bodyText);
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      throw new GotenbergError("permanent", "Gotenberg returned 200 with empty body", { statusCode: 200 });
    }
    return Buffer.from(arrayBuffer);
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(5_000) });
      return response.ok;
    } catch {
      return false;
    }
  }

  private buildForm(html: string, options?: PdfRenderOptions): FormData {
    const form = new FormData();
    form.append("files", new Blob([html], { type: "text/html" }), "index.html");
    const paper = PAPER_SIZES_IN[options?.format ?? "A4"] ?? A4_DEFAULT;
    if (options?.landscape) {
      form.append("paperWidth", String(paper.height));
      form.append("paperHeight", String(paper.width));
    } else {
      form.append("paperWidth", String(paper.width));
      form.append("paperHeight", String(paper.height));
    }
    form.append("marginTop",    parseMargin(options?.margin?.top,    MARGIN_INCHES_DEFAULT.top));
    form.append("marginBottom", parseMargin(options?.margin?.bottom, MARGIN_INCHES_DEFAULT.bottom));
    form.append("marginLeft",   parseMargin(options?.margin?.left,   MARGIN_INCHES_DEFAULT.left));
    form.append("marginRight",  parseMargin(options?.margin?.right,  MARGIN_INCHES_DEFAULT.right));
    form.append("printBackground", String(options?.printBackground ?? true));
    form.append("scale", String(options?.scale ?? 1));
    if (options?.displayHeaderFooter) {
      form.append("printHeaderFooter", "true");
      if (options.headerTemplate) form.append("headerTemplate", options.headerTemplate);
      if (options.footerTemplate) form.append("footerTemplate", options.footerTemplate);
    }
    return form;
  }

  private classifyHttpError(status: number, body: string): GotenbergError {
    const truncated = body.slice(0, 4096);
    switch (status) {
      case 400: return new GotenbergError("permanent", `Gotenberg rejected input: ${truncated}`, { statusCode: status, responseBody: truncated });
      case 503: return new GotenbergError("transient", `Gotenberg busy: ${truncated}`, { statusCode: status, responseBody: truncated });
      case 504: return new GotenbergError("timeout", `Gotenberg conversion timed out: ${truncated}`, { statusCode: status, responseBody: truncated });
      default:  return new GotenbergError("transient", `Gotenberg returned ${status}: ${truncated}`, { statusCode: status, responseBody: truncated });
    }
  }
}

export function createGotenbergClient(config?: {
  baseUrl?: string;
  timeoutMs?: number;
  logger?: { error(event: string, fields?: Record<string, unknown>): void; warn(event: string, fields?: Record<string, unknown>): void };
}): GotenbergClient | null {
  const baseUrl = config?.baseUrl ?? process.env["DOCRENDER_BASE_URL"] ?? "";
  if (!baseUrl) return null;
  return new GotenbergClient({ baseUrl, timeoutMs: config?.timeoutMs, logger: config?.logger });
}
