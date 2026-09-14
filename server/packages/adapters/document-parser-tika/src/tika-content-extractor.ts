import {
  ContentExtractionError,
  type ContentExtractionInput,
  type ContentExtractionResult,
  type ContentExtractor,
} from "@athyper/server-contract-content-extraction";

export interface TikaContentExtractorConfig {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly maxInputBytes?: number;
  readonly maxTextChars?: number;
  /** Hard cap on bytes read from any Tika response body (success, error, or health) before the
   * connection is cancelled. Defaults to 4 bytes per `maxTextChars` character, a safety margin for
   * multi-byte UTF-8 — a large/adversarial document can otherwise make Tika's extracted-text or
   * verbose-error response balloon in memory before the existing `maxTextChars` truncation ever
   * runs. */
  readonly maxResponseBytes?: number;
  readonly fetch?: typeof globalThis.fetch;
}
const DEFAULT_ERROR_RESPONSE_BYTES = 4_096;
export interface TikaHealth {
  readonly status: "healthy" | "unhealthy";
  readonly message?: string;
}
export interface TikaContentExtractor extends ContentExtractor {
  health(): Promise<TikaHealth>;
  close(): void;
}

export function createTikaContentExtractor(
  config: TikaContentExtractorConfig,
): TikaContentExtractor {
  if (!/^https?:\/\//.test(config.baseUrl))
    throw new Error("Tika baseUrl must be HTTP(S)");
  const baseUrl = config.baseUrl.replace(/\/+$/g, "");
  const timeoutMs = positive(config.timeoutMs, 120_000, "timeoutMs");
  const maxInputBytes = positive(
    config.maxInputBytes,
    50 * 1_024 * 1_024,
    "maxInputBytes",
  );
  const maxTextChars = positive(config.maxTextChars, 5_000_000, "maxTextChars");
  const maxResponseBytes = positive(
    config.maxResponseBytes,
    maxTextChars * 4,
    "maxResponseBytes",
  );
  const request = config.fetch ?? globalThis.fetch;
  const active = new Set<AbortController>();
  // The timer, outer-signal listener, and `active` membership must all stay alive until `consume`
  // (which reads the response body) finishes, not just until fetch() resolves headers — otherwise a
  // stalled body read is neither timed out nor cancellable via close().
  async function call<T>(
    path: string,
    init: RequestInit,
    consume: (response: Response) => Promise<T>,
    outer?: AbortSignal,
  ): Promise<T> {
    if (outer?.aborted)
      throw new ContentExtractionError(
        "EXTRACTION_CANCELLED",
        "Tika request cancelled before it started",
        { cause: outer.reason },
      );
    const controller = new AbortController();
    active.add(controller);
    const onAbort = () => controller.abort(outer?.reason);
    outer?.addEventListener("abort", onAbort, { once: true });
    const deadline = new ContentExtractionError(
      "EXTRACTION_TIMEOUT",
      `Tika request exceeded ${timeoutMs} ms`,
    );
    const timer = setTimeout(() => controller.abort(deadline), timeoutMs);
    try {
      const response = await request(`${baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });
      return await consume(response);
    } catch (error) {
      if (controller.signal.aborted) {
        if (controller.signal.reason === deadline) throw deadline;
        throw new ContentExtractionError(
          "EXTRACTION_CANCELLED",
          "Tika request cancelled",
          { cause: controller.signal.reason },
        );
      }
      if (error instanceof ContentExtractionError) throw error;
      throw new ContentExtractionError(
        "EXTRACTION_UNAVAILABLE",
        "Tika request failed",
        { cause: error },
      );
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onAbort);
      active.delete(controller);
    }
  }
  return {
    async extract(
      input: ContentExtractionInput,
    ): Promise<ContentExtractionResult> {
      if (input.content.byteLength > maxInputBytes)
        throw new ContentExtractionError(
          "EXTRACTION_SIZE_LIMIT",
          `Content exceeds ${maxInputBytes} bytes`,
        );
      const started = Date.now();
      return call(
        "/tika",
        {
          method: "PUT",
          headers: {
            accept: "text/plain; charset=UTF-8",
            "content-type": input.contentType,
            ...(input.fileName
              ? {
                  "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(input.fileName)}`,
                }
              : {}),
          },
          body: Uint8Array.from(input.content).buffer,
        },
        async (response) => {
          if (!response.ok) {
            const detail = (
              await readBoundedText(response, DEFAULT_ERROR_RESPONSE_BYTES)
            ).slice(0, 300);
            throw new ContentExtractionError(
              "EXTRACTION_FAILED",
              `Tika returned ${response.status}${detail ? `: ${detail}` : ""}`,
            );
          }
          const raw = await readBoundedText(response, maxResponseBytes);
          const text = raw
            .replace(/\u0000/g, "")
            .trim()
            .slice(0, maxTextChars);
          const metadata: Record<string, string> = {};
          response.headers.forEach((value, key) => {
            if (key.startsWith("x-tika-") || key === "content-type")
              metadata[key] = value;
          });
          return {
            text,
            metadata,
            provider: "apache-tika",
            durationMs: Date.now() - started,
            ...(metadata["content-type"]
              ? { detectedContentType: metadata["content-type"] }
              : {}),
          };
        },
        input.signal,
      );
    },
    async health() {
      try {
        return await call("/tika", { method: "GET" }, async (response) => {
          await readBoundedText(response, DEFAULT_ERROR_RESPONSE_BYTES);
          if (response.status === 503)
            return {
              status: "unhealthy",
              message: "Tika reported not operational (503)",
            } as const;
          return response.ok
            ? ({ status: "healthy" } as const)
            : ({
                status: "unhealthy",
                message: `Tika health returned ${response.status}`,
              } as const);
        });
      } catch (error) {
        return {
          status: "unhealthy",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
    close() {
      for (const controller of active)
        controller.abort(new Error("Tika extractor closed"));
      active.clear();
    },
  };
}
function positive(value: number | undefined, fallback: number, name: string) {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1)
    throw new Error(`Tika ${name} must be a positive integer`);
  return resolved;
}

/** Reads at most `maxBytes` of a response body, cancelling the rest rather than buffering it. */
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
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    total,
  ).toString("utf8");
}
