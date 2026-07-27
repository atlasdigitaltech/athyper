import {
  AgentStreamEnvelopeSchema,
  type AgentRunRequest,
  type AgentStreamEnvelope,
} from "../index";

export interface FetchAgentEventsOptions {
  request: AgentRunRequest;
  endpoint?: string;
  signal?: AbortSignal;
  heartbeatTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export type AtlasTransportErrorCode =
  | "authentication"
  | "authorization"
  | "unavailable"
  | "rate_limited"
  | "invalid_response"
  | "protocol";

/**
 * Safe client transport failure. Response bodies and provider diagnostics are
 * deliberately excluded so UI code cannot accidentally display them.
 */
export class AtlasTransportError extends Error {
  override readonly name = "AtlasTransportError";

  constructor(
    readonly code: AtlasTransportErrorCode,
    readonly status: number | null,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(safeTransportMessage(code));
  }
}

export async function* fetchAgentEvents({
  request,
  endpoint = "/api/relay/ai/agent/runs",
  signal,
  heartbeatTimeoutMs = 45_000,
  fetchImpl = fetch,
}: FetchAgentEventsOptions): AsyncIterable<AgentStreamEnvelope> {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(signal?.reason);
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });

  let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
  const refreshHeartbeat = () => {
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    heartbeatTimer = setTimeout(() => {
      controller.abort(new DOMException("Atlas stream heartbeat timed out", "TimeoutError"));
    }, heartbeatTimeoutMs);
  };

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    refreshHeartbeat();
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      // Drain the body without retaining or surfacing provider/server detail.
      await response.body?.cancel().catch(() => undefined);
      throw new AtlasTransportError(
        transportCodeForStatus(response.status),
        response.status,
        response.status === 429
          ? parseRetryAfterSeconds(response.headers.get("Retry-After"))
          : null,
      );
    }
    if (!(response.headers.get("Content-Type") ?? "").toLowerCase().startsWith("text/event-stream")) {
      throw new AtlasTransportError("invalid_response", response.status);
    }
    if (!response.body) {
      throw new AtlasTransportError("invalid_response", response.status);
    }

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      refreshHeartbeat();
      buffer += decoder.decode(value, { stream: true });

      let boundary = /\r?\n\r?\n/.exec(buffer);
      while (boundary?.index !== undefined) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const data = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data) {
          let parsedJson: unknown;
          try {
            parsedJson = JSON.parse(data);
          } catch {
            throw new AtlasTransportError("protocol", response.status);
          }
          const parsed = AgentStreamEnvelopeSchema.safeParse(parsedJson);
          if (!parsed.success) {
            throw new AtlasTransportError("protocol", response.status);
          }
          yield parsed.data;
        }
        boundary = /\r?\n\r?\n/.exec(buffer);
      }
    }
  } finally {
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    signal?.removeEventListener("abort", abortFromCaller);
    await reader?.cancel().catch(() => undefined);
  }
}

function transportCodeForStatus(status: number): AtlasTransportErrorCode {
  if (status === 401) return "authentication";
  if (status === 403) return "authorization";
  if (status === 404 || status === 429 || status >= 500) {
    return status === 429 ? "rate_limited" : "unavailable";
  }
  return "invalid_response";
}

function parseRetryAfterSeconds(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const retryAt = Date.parse(value);
  if (!Number.isFinite(retryAt)) return null;
  return Math.max(0, Math.ceil((retryAt - Date.now()) / 1_000));
}

function safeTransportMessage(code: AtlasTransportErrorCode): string {
  if (code === "authentication") return "Atlas authentication expired.";
  if (code === "authorization") return "Atlas is not available for this account.";
  if (code === "rate_limited") return "Atlas is receiving too many requests.";
  if (code === "unavailable") return "Atlas is temporarily unavailable.";
  return "Atlas returned an unsupported response.";
}
