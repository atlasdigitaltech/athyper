import type { DerivativeRenderInput, DerivativeRenderOutput, DerivativeRenderer } from "@athyper/server-contract-derivatives";
import { PreviewRendererError } from "./preview-renderer-error.js";

export interface PreviewRendererConfig {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly healthTimeoutMs?: number;
  readonly maxSourceBytes?: number;
  readonly maxOutputBytes?: number;
}

export interface PreviewRendererDependencies {
  readonly fetch: typeof fetch;
  readonly now?: () => number;
}

interface RendererResponseBody {
  readonly contentType: string;
  readonly width?: number;
  readonly height?: number;
  readonly pageNumber?: number;
  readonly provider: string;
  readonly providerVersion: string;
  readonly durationMs: number;
  readonly bytes: string;
}

export function createPreviewRendererAdapter(
  config: PreviewRendererConfig,
  dependencies: PreviewRendererDependencies = { fetch: globalThis.fetch },
): DerivativeRenderer {
  const baseUrl = validateBaseUrl(config.baseUrl);
  const timeoutMs = positiveInteger(config.timeoutMs ?? 60_000, "render timeout");
  const healthTimeoutMs = positiveInteger(config.healthTimeoutMs ?? 5_000, "health timeout");
  const maxSourceBytes = positiveInteger(config.maxSourceBytes ?? 50 * 1_024 * 1_024, "maximum source bytes");
  const maxOutputBytes = positiveInteger(config.maxOutputBytes ?? 10 * 1_024 * 1_024, "maximum output bytes");
  const now = dependencies.now ?? Date.now;

  return {
    async render(input: DerivativeRenderInput): Promise<DerivativeRenderOutput> {
      if (input.content.byteLength === 0) {
        throw new PreviewRendererError("invalid_input", "Source content is empty", { retryable: false });
      }
      if (input.content.byteLength > maxSourceBytes) {
        throw new PreviewRendererError("invalid_input", `Source content exceeds ${maxSourceBytes} bytes`, {
          retryable: false,
        });
      }

      const sourceBuffer = new ArrayBuffer(input.content.byteLength);
      new Uint8Array(sourceBuffer).set(input.content);
      const form = new FormData();
      form.append("renditionCode", input.renditionCode);
      form.append("sourceContentType", input.sourceContentType);
      form.append("specificationHash", input.specificationHash);
      form.append("content", new Blob([sourceBuffer], { type: input.sourceContentType }), "source");

      const startedAt = now();
      let response: Response;
      try {
        response = await dependencies.fetch(`${baseUrl}/render`, {
          method: "POST",
          body: form,
          redirect: "error",
          signal: input.signal ?? AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const timedOut = error instanceof Error &&
          (error.name === "AbortError" || error.name === "TimeoutError");
        throw new PreviewRendererError(
          timedOut ? "timeout" : "unavailable",
          timedOut ? `Preview renderer timed out after ${timeoutMs}ms` : "Preview renderer is unavailable",
          { retryable: true, cause: error },
        );
      }

      if (response.status === 422) {
        const body = await response.json().catch(() => ({})) as Record<string, unknown>;
        if (body["skipped"] === true) {
          throw new PreviewRendererError(
            "unsupported_media_type",
            `Preview renderer does not support rendition '${input.renditionCode}' for '${input.sourceContentType}'`,
            { retryable: false, statusCode: 422 },
          );
        }
      }

      if (!response.ok) throw await buildResponseError(response);

      let body: RendererResponseBody;
      try {
        body = await response.json() as RendererResponseBody;
      } catch (error) {
        throw new PreviewRendererError("invalid_output", "Preview renderer returned non-JSON response", {
          retryable: false,
          cause: error,
        });
      }

      if (!body.bytes || typeof body.bytes !== "string") {
        throw new PreviewRendererError("invalid_output", "Preview renderer response missing bytes field", {
          retryable: false,
        });
      }

      let bytes: Uint8Array;
      try {
        bytes = Buffer.from(body.bytes, "base64");
      } catch (error) {
        throw new PreviewRendererError("invalid_output", "Preview renderer returned invalid base64 bytes", {
          retryable: false,
          cause: error,
        });
      }

      if (bytes.byteLength === 0) {
        throw new PreviewRendererError("invalid_output", "Preview renderer returned empty output", {
          retryable: false,
        });
      }
      if (bytes.byteLength > maxOutputBytes) {
        throw new PreviewRendererError("invalid_output", "Preview renderer output exceeds size limit", {
          retryable: false,
        });
      }

      if (!isAllowedOutputType(body.contentType)) {
        throw new PreviewRendererError(
          "invalid_output",
          `Preview renderer returned unexpected content type: ${body.contentType}`,
          { retryable: false },
        );
      }

      return {
        bytes,
        contentType: body.contentType,
        width: body.width ?? null,
        height: body.height ?? null,
        pageNumber: body.pageNumber ?? null,
        provider: body.provider,
        providerVersion: body.providerVersion,
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
          status: response.ok ? "healthy" : response.status >= 500 ? "degraded" : "unhealthy",
          latencyMs: Math.max(0, now() - startedAt),
        };
      } catch {
        return {
          status: "unhealthy",
          message: "Preview renderer health request failed",
          latencyMs: Math.max(0, now() - startedAt),
        };
      }
    },
  };
}

const ALLOWED_OUTPUT_TYPES = new Set([
  "image/webp",
  "image/png",
  "image/jpeg",
  "application/pdf",
]);

function isAllowedOutputType(contentType: string): boolean {
  return ALLOWED_OUTPUT_TYPES.has(contentType.toLowerCase().split(";")[0]!.trim());
}

async function buildResponseError(response: Response): Promise<PreviewRendererError> {
  const body = (await response.text().catch(() => "")).slice(0, 1_024);
  const suffix = body ? `: ${body}` : "";
  if (response.status === 504) {
    return new PreviewRendererError("timeout", `Preview renderer conversion timed out${suffix}`, {
      retryable: true,
      statusCode: response.status,
    });
  }
  const retryable = response.status === 429 || response.status >= 500;
  return new PreviewRendererError(
    retryable ? "transient" : "invalid_input",
    `Preview renderer rejected request with HTTP ${response.status}${suffix}`,
    { retryable, statusCode: response.status },
  );
}

function validateBaseUrl(raw: string): string {
  const url = new URL(raw.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Preview renderer base URL must use HTTP or HTTPS");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Preview renderer base URL cannot contain credentials, query, or fragment");
  }
  return url.toString().replace(/\/+$/, "");
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}
