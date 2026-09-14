import type {
  PdfPageFormat,
  PdfRenderOptions,
  PdfRenderer,
} from "@athyper/server-contract-rendering";

import { RenderingError } from "./rendering.error.js";

export interface GotenbergRendererConfig {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly healthTimeoutMs?: number;
  readonly maxHtmlBytes?: number;
  readonly maxPdfBytes?: number;
}

export interface GotenbergRendererDependencies {
  readonly fetch: typeof fetch;
  readonly now?: () => number;
}

const PAPER_SIZE: Record<PdfPageFormat, { width: number; height: number }> = {
  A3: { width: 11.69, height: 16.54 },
  A4: { width: 8.27, height: 11.69 },
  A5: { width: 5.83, height: 8.27 },
  B4: { width: 9.84, height: 13.9 },
  Letter: { width: 8.5, height: 11 },
  Legal: { width: 8.5, height: 14 },
};
const DEFAULT_MARGIN = 0.4;

export function createGotenbergRenderer(
  config: GotenbergRendererConfig,
  dependencies: GotenbergRendererDependencies = { fetch: globalThis.fetch },
): PdfRenderer {
  const baseUrl = validateBaseUrl(config.baseUrl);
  const timeoutMs = positiveInteger(
    config.timeoutMs ?? 120_000,
    "render timeout",
  );
  const healthTimeoutMs = positiveInteger(
    config.healthTimeoutMs ?? 5_000,
    "health timeout",
  );
  const maxHtmlBytes = positiveInteger(
    config.maxHtmlBytes ?? 5 * 1_024 * 1_024,
    "maximum HTML bytes",
  );
  const maxPdfBytes = positiveInteger(
    config.maxPdfBytes ?? 50 * 1_024 * 1_024,
    "maximum PDF bytes",
  );
  const now = dependencies.now ?? Date.now;

  return {
    async renderPdf(request) {
      const html = request.html.trim();
      if (!html) {
        throw new RenderingError("invalid_input", "HTML input is required", {
          retryable: false,
        });
      }
      const options = validateOptions(request.options);
      const totalHtmlBytes = Buffer.byteLength(
        `${html}${options.headerHtml ?? ""}${options.footerHtml ?? ""}`,
        "utf8",
      );
      if (totalHtmlBytes > maxHtmlBytes) {
        throw new RenderingError(
          "invalid_input",
          `HTML input exceeds ${maxHtmlBytes} bytes`,
          {
            retryable: false,
          },
        );
      }
      const startedAt = now();
      let response: Response;
      try {
        response = await dependencies.fetch(
          `${baseUrl}/forms/chromium/convert/html`,
          {
            method: "POST",
            ...(request.documentName
              ? {
                  headers: {
                    "Gotenberg-Output-Filename": outputName(
                      request.documentName,
                    ),
                  },
                }
              : {}),
            body: buildForm(html, options),
            redirect: "error",
            signal: AbortSignal.timeout(timeoutMs),
          },
        );
      } catch (error) {
        const timedOut =
          error instanceof Error &&
          (error.name === "AbortError" || error.name === "TimeoutError");
        throw new RenderingError(
          timedOut ? "timeout" : "unavailable",
          timedOut
            ? `Gotenberg timed out after ${timeoutMs}ms`
            : "Gotenberg is unavailable",
          { retryable: true, cause: error },
        );
      }
      if (!response.ok) throw await responseError(response);
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > maxPdfBytes) {
        await cancelBody(response);
        throw new RenderingError(
          "invalid_output",
          "Rendered PDF exceeds the output limit",
          {
            retryable: false,
            statusCode: response.status,
          },
        );
      }
      const bytes = await readLimitedBody(response, maxPdfBytes, timeoutMs);
      if (bytes.byteLength === 0) {
        throw new RenderingError(
          "invalid_output",
          "Gotenberg returned an empty PDF",
          {
            retryable: false,
            statusCode: response.status,
          },
        );
      }
      if (Buffer.from(bytes.subarray(0, 5)).toString("ascii") !== "%PDF-") {
        throw new RenderingError(
          "invalid_output",
          "Gotenberg returned non-PDF content",
          {
            retryable: false,
            statusCode: response.status,
          },
        );
      }
      return {
        bytes,
        mediaType: "application/pdf",
        provider: "gotenberg",
        durationMs: Math.max(0, now() - startedAt),
      };
    },
    async health() {
      const startedAt = now();
      try {
        const response = await dependencies.fetch(`${baseUrl}/health`, {
          redirect: "error",
          signal: AbortSignal.timeout(healthTimeoutMs),
        });
        return {
          status: response.ok
            ? "healthy"
            : response.status >= 500
              ? "degraded"
              : "unhealthy",
          latencyMs: Math.max(0, now() - startedAt),
        };
      } catch {
        return {
          status: "unhealthy",
          message: "Gotenberg health request failed",
          latencyMs: Math.max(0, now() - startedAt),
        };
      }
    },
  };
}

function buildForm(html: string, options: RequiredRenderOptions): FormData {
  const form = new FormData();
  form.append(
    "files",
    new Blob([html], { type: "text/html;charset=utf-8" }),
    "index.html",
  );
  const paper = PAPER_SIZE[options.format];
  form.append(
    "paperWidth",
    String(options.landscape ? paper.height : paper.width),
  );
  form.append(
    "paperHeight",
    String(options.landscape ? paper.width : paper.height),
  );
  form.append("marginTop", String(options.margins.top));
  form.append("marginRight", String(options.margins.right));
  form.append("marginBottom", String(options.margins.bottom));
  form.append("marginLeft", String(options.margins.left));
  form.append("printBackground", String(options.printBackground));
  form.append("scale", String(options.scale));
  form.append("failOnHttpStatusCodes", "[499,599]");
  form.append("failOnResourceHttpStatusCodes", "[499,599]");
  form.append("failOnResourceLoadingFailed", "true");
  if (options.headerHtml || options.footerHtml) {
    form.append("printHeaderFooter", "true");
    if (options.headerHtml) {
      form.append(
        "files",
        new Blob([options.headerHtml], { type: "text/html;charset=utf-8" }),
        "header.html",
      );
    }
    if (options.footerHtml) {
      form.append(
        "files",
        new Blob([options.footerHtml], { type: "text/html;charset=utf-8" }),
        "footer.html",
      );
    }
  }
  return form;
}

interface RequiredRenderOptions {
  readonly format: PdfPageFormat;
  readonly landscape: boolean;
  readonly printBackground: boolean;
  readonly scale: number;
  readonly margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  readonly headerHtml?: string;
  readonly footerHtml?: string;
}

function validateOptions(
  options: PdfRenderOptions | undefined,
): RequiredRenderOptions {
  const scale = options?.scale ?? 1;
  if (!Number.isFinite(scale) || scale < 0.1 || scale > 2) {
    throw new RenderingError(
      "invalid_input",
      "PDF scale must be between 0.1 and 2",
      {
        retryable: false,
      },
    );
  }
  const margin = (value: number | undefined): number => {
    const normalized = value ?? DEFAULT_MARGIN;
    if (!Number.isFinite(normalized) || normalized < 0 || normalized > 5) {
      throw new RenderingError(
        "invalid_input",
        "PDF margins must be between 0 and 5 inches",
        {
          retryable: false,
        },
      );
    }
    return normalized;
  };
  return {
    format: options?.format ?? "A4",
    landscape: options?.landscape ?? false,
    printBackground: options?.printBackground ?? true,
    scale,
    margins: {
      top: margin(options?.marginsInches?.top),
      right: margin(options?.marginsInches?.right),
      bottom: margin(options?.marginsInches?.bottom),
      left: margin(options?.marginsInches?.left),
    },
    ...(options?.headerHtml ? { headerHtml: options.headerHtml } : {}),
    ...(options?.footerHtml ? { footerHtml: options.footerHtml } : {}),
  };
}

async function readLimitedBody(
  response: Response,
  maxBytes: number,
  timeoutMs: number,
): Promise<Uint8Array> {
  const body = response.body;
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new RenderingError(
          "invalid_output",
          "Rendered PDF exceeds the output limit",
          {
            retryable: false,
            statusCode: response.status,
          },
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof RenderingError) throw error;
    const timedOut =
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError");
    throw new RenderingError(
      timedOut ? "timeout" : "unavailable",
      timedOut
        ? `Gotenberg timed out after ${timeoutMs}ms`
        : "Gotenberg response could not be read",
      { retryable: true, cause: error },
    );
  } finally {
    reader.releaseLock();
  }
  return concatChunks(chunks, total);
}

async function readBoundedText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const body = response.body;
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = maxBytes - total;
      if (remaining <= 0) {
        await reader.cancel().catch(() => undefined);
        break;
      }
      const slice =
        value.byteLength > remaining ? value.subarray(0, remaining) : value;
      chunks.push(slice);
      total += slice.byteLength;
      if (total >= maxBytes) {
        await reader.cancel().catch(() => undefined);
        break;
      }
    }
  } catch {
    return "";
  } finally {
    reader.releaseLock();
  }
  return Buffer.from(concatChunks(chunks, total)).toString("utf8");
}

async function cancelBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

function concatChunks(
  chunks: readonly Uint8Array[],
  total: number,
): Uint8Array {
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

async function responseError(response: Response): Promise<RenderingError> {
  const body = await readBoundedText(response, 1_024);
  const suffix = body ? `: ${body}` : "";
  if (response.status === 504) {
    return new RenderingError(
      "timeout",
      `Gotenberg conversion timed out${suffix}`,
      {
        retryable: true,
        statusCode: response.status,
      },
    );
  }
  const retryable = response.status === 429 || response.status >= 500;
  return new RenderingError(
    retryable ? "transient" : "invalid_input",
    `Gotenberg rejected the render with HTTP ${response.status}${suffix}`,
    { retryable, statusCode: response.status },
  );
}

function validateBaseUrl(raw: string): string {
  const url = new URL(raw.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Gotenberg base URL must use HTTP or HTTPS");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      "Gotenberg base URL cannot contain credentials, query, or fragment",
    );
  }
  return url.toString().replace(/\/+$/, "");
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0)
    throw new Error(`${name} must be a positive integer`);
  return value;
}

function outputName(documentName: string): string {
  const normalized = documentName
    .trim()
    .replace(/\.pdf$/i, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return normalized || "document";
}
