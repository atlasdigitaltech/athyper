/**
 * GotenbergClient — Track B / B1 sub-task #2
 *
 * HTTP client for the Gotenberg container (HTML/Office → PDF). Replaces
 * the legacy PdfRendererClient for the synchronous render path. The
 * BullMQ render-document worker still uses in-process Puppeteer and is
 * scheduled for migration in a follow-up PR.
 *
 * This client honours the render_dlq contract documented at
 * stack/compose/render/README.md. Failures are thrown as GotenbergError
 * with a category so the caller (RenderService / render worker) can
 * decide retry vs. DLQ policy.
 *
 * Contract:
 *   HTTP 503 (LibreOffice busy, pool exhausted) → category: "transient"
 *   HTTP 504 (conversion timeout)               → category: "timeout"
 *   HTTP 400 (bad template / invalid input)     → category: "permanent"
 *   Connection refused / container crash        → category: "crash"
 *   HTTP 200 with empty body                    → category: "permanent"
 *
 * API surface matches PdfRendererClient.renderSync(html, options) → Buffer
 * so RenderService is a drop-in consumer.
 *
 * Gotenberg REST:
 *   POST /forms/chromium/convert/html
 *     Content-Type: multipart/form-data
 *     Fields: files=index.html (the HTML source, must be named index.html)
 *             paperWidth, paperHeight, marginTop, marginBottom, marginLeft,
 *             marginRight, printBackground, landscape, scale,
 *             printHeaderFooter, headerTemplate, footerTemplate
 *     Response: application/pdf binary
 */

import type { PdfRenderOptions, SyncPdfRenderer } from "./pdf-renderer-client.js";

// ── Error classification ──────────────────────────────────────────────────────

export type GotenbergErrorCategory =
  | "transient"   // retry with backoff
  | "timeout"     // retry once, then DLQ
  | "permanent"   // DLQ immediately
  | "crash";      // DLQ + alert ops

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

// ── Paper size mapping ────────────────────────────────────────────────────────
// PdfRendererClient uses Puppeteer-style size keywords (A4, A3, …). Gotenberg
// expects numeric paperWidth/paperHeight in inches. Convert here.

const PAPER_SIZES_IN: Record<string, { width: number; height: number }> = {
  A3:     { width: 11.69, height: 16.54 },
  A4:     { width: 8.27,  height: 11.69 },
  Letter: { width: 8.5,   height: 11 },
  Legal:  { width: 8.5,   height: 14 },
};

const MARGIN_INCHES_DEFAULT = {
  top:    "0.4",
  bottom: "0.4",
  left:   "0.4",
  right:  "0.4",
};

function parseMargin(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  // Strip "in", "cm", "px" — Gotenberg wants a bare number in inches.
  // Callers that already pass numbers-as-strings ("0.4") pass through.
  const match = value.match(/^\s*([\d.]+)/);
  return match?.[1] ?? fallback;
}

const A4_DEFAULT = { width: 8.27, height: 11.69 };

// ── Client ────────────────────────────────────────────────────────────────────

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
    logger?: {
      error(event: string, fields?: Record<string, unknown>): void;
      warn(event: string, fields?: Record<string, unknown>): void;
    };
  }) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs ?? 120_000;
    this.logger = config.logger;
  }

  /**
   * Synchronous HTML → PDF. Drop-in for PdfRendererClient.renderSync().
   * Throws GotenbergError with .category populated per the render_dlq contract.
   */
  async renderSync(html: string, options?: PdfRenderOptions): Promise<Buffer> {
    const form = this.buildForm(html, options);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(
        `${this.baseUrl}/forms/chromium/convert/html`,
        {
          method: "POST",
          body: form,
          signal: controller.signal,
        },
      );
    } catch (err) {
      clearTimeout(timer);
      if ((err as Error).name === "AbortError") {
        throw new GotenbergError("timeout", `Gotenberg request timed out after ${this.timeoutMs}ms`);
      }
      // ECONNREFUSED, ENOTFOUND, socket hang up — treat as crash.
      throw new GotenbergError("crash", `Gotenberg unreachable: ${(err as Error).message}`);
    }
    clearTimeout(timer);

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      throw this.classifyHttpError(response.status, bodyText);
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      throw new GotenbergError("permanent", "Gotenberg returned 200 with empty body", {
        statusCode: 200,
      });
    }
    return Buffer.from(arrayBuffer);
  }

  /**
   * Health probe — Gotenberg exposes GET /health with a JSON body. Returns
   * true on 200, false on any other response or network error.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private buildForm(html: string, options?: PdfRenderOptions): FormData {
    const form = new FormData();

    // Gotenberg requires the main HTML to be named exactly "index.html".
    const htmlBlob = new Blob([html], { type: "text/html" });
    form.append("files", htmlBlob, "index.html");

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
    form.append("scale",           String(options?.scale ?? 1));

    if (options?.displayHeaderFooter) {
      form.append("printHeaderFooter", "true");
      if (options.headerTemplate) {
        form.append("headerTemplate", options.headerTemplate);
      }
      if (options.footerTemplate) {
        form.append("footerTemplate", options.footerTemplate);
      }
    }

    return form;
  }

  private classifyHttpError(status: number, body: string): GotenbergError {
    const truncated = body.slice(0, 4096);
    switch (status) {
      case 400:
        return new GotenbergError("permanent", `Gotenberg rejected input: ${truncated}`, {
          statusCode: status, responseBody: truncated,
        });
      case 503:
        return new GotenbergError("transient", `Gotenberg busy: ${truncated}`, {
          statusCode: status, responseBody: truncated,
        });
      case 504:
        return new GotenbergError("timeout", `Gotenberg conversion timed out: ${truncated}`, {
          statusCode: status, responseBody: truncated,
        });
      default:
        // Anything else (5xx that isn't 503/504, 4xx that isn't 400) is
        // treated as transient — worst case the worker retries and eventually
        // DLQs on attempt exhaustion.
        return new GotenbergError("transient", `Gotenberg returned ${status}: ${truncated}`, {
          statusCode: status, responseBody: truncated,
        });
    }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createGotenbergClient(config?: {
  baseUrl?: string;
  timeoutMs?: number;
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
}): GotenbergClient | null {
  const baseUrl = config?.baseUrl ?? process.env["DOCRENDER_BASE_URL"] ?? "";
  if (!baseUrl) return null;
  return new GotenbergClient({
    baseUrl,
    timeoutMs: config?.timeoutMs,
    logger: config?.logger,
  });
}
