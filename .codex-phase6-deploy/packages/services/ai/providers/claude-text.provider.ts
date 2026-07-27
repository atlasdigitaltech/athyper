/**
 * Anthropic Messages text adapter.
 *
 * The legacy non-streaming invoke method remains for the existing AIRuntime.
 * Atlas agent streaming always receives an exact binding and sends that
 * binding's upstreamModelId on each request.
 */

import {
  CLAUDE_TEXT_ADAPTER_ID,
  CLAUDE_TEXT_ADAPTER_VERSION,
} from "../agent/model-catalog.js";
import type {
  CanonicalFinishReason,
  CanonicalProviderError,
  CanonicalProviderErrorClass,
  CanonicalStreamEvent,
  IModelProvider,
  ModelMessage,
  ModelPrompt,
  ModelResponse,
  ProviderCapabilities,
  ProviderInvocation,
  ProviderOperationalState,
} from "./i-model-provider.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_SSE_FRAME_BYTES = 262_144;
const MAX_MODEL_METADATA_BYTES = 65_536;
const DEFAULT_READINESS_TIMEOUT_MS = 10_000;

export interface AnthropicReadinessOptions {
  credential?: { secret: string };
  signal?: AbortSignal;
  timeoutMs?: number;
}

export type AnthropicReadinessReason =
  | "ready"
  | "invalid_model"
  | "missing_credential"
  | "authentication_failed"
  | "permission_denied"
  | "model_unavailable"
  | "model_identity_mismatch"
  | "rate_limited"
  | "provider_timeout"
  | "provider_unavailable"
  | "provider_error"
  | "cancelled";

export interface AnthropicReadinessState extends ProviderOperationalState {
  modelId: string;
  actualModelId: string | null;
  reason: AnthropicReadinessReason;
  retryable: boolean;
  errorClass?: CanonicalProviderErrorClass;
  httpStatus?: number;
}

export class ClaudeTextProvider implements IModelProvider {
  readonly modelId = "claude-anthropic-text";
  readonly modelVersion: string;
  readonly adapterId = CLAUDE_TEXT_ADAPTER_ID;
  readonly adapterVersion = CLAUDE_TEXT_ADAPTER_VERSION;
  readonly operationalState: ProviderOperationalState;
  readonly capabilities: ProviderCapabilities = {
    supports_vision: false,
    supports_pdf_native: false,
    supports_json_schema: true,
    supports_tool_calling: true,
    supports_embeddings: false,
    supports_streaming: true,
    max_context_tokens: 200_000,
    max_output_tokens: 8_192,
    max_input_file_bytes: 0,
    supported_mime_types: ["text/plain", "application/json"],
    // Phase 1 uses Anthropic's default global inference routing. Explicit
    // US-only inference and its price multiplier require a separate reviewed
    // binding/profile before use.
    supported_regions: ["global"],
    cost_per_1k_input_tokens: 0.003,
    cost_per_1k_output_tokens: 0.015,
  };

  constructor(
    private readonly apiKey: string,
    private readonly model: string = "claude-sonnet-4-6",
  ) {
    this.modelVersion = model;
    const credentialed = apiKey.trim().length > 0 && apiKey !== "no-key-configured";
    this.operationalState = {
      implemented: true,
      credentialed,
      healthy: credentialed,
      eligible: credentialed,
      ...(!credentialed ? { reason: "missing_credential" } : {}),
    };
  }

  async invoke(prompt: ModelPrompt): Promise<ModelResponse> {
    const startMs = Date.now();
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: this.headers("application/json"),
      body: JSON.stringify(this.buildRequestBody(prompt, this.model)),
    });

    if (!response.ok) {
      throw new Error(`Claude text API error ${response.status}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text?: string }>;
      usage: { input_tokens: number; output_tokens: number };
    };
    const text = data.content.find((block) => block.type === "text")?.text ?? "";
    const usage = data.usage ?? { input_tokens: 0, output_tokens: 0 };

    return {
      text,
      usage: {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        vision_pages: 0,
      },
      duration_ms: Date.now() - startMs,
    };
  }

  /**
   * Non-generating readiness probe using Anthropic's Models API. It verifies
   * the exact pinned model identity and never sends prompts or reads messages.
   */
  async checkReadiness(
    exactModelId: string,
    options: AnthropicReadinessOptions = {},
  ): Promise<AnthropicReadinessState> {
    const modelId = exactModelId.trim();
    if (!/^[a-zA-Z0-9._:-]{1,200}$/.test(modelId)) {
      return anthropicReadiness(modelId, null, "invalid_model", false, false);
    }
    const apiKey = options.credential?.secret.trim() || this.apiKey.trim();
    if (!apiKey || apiKey === "no-key-configured") {
      return anthropicReadiness(
        modelId,
        null,
        "missing_credential",
        false,
        false,
      );
    }
    if (options.signal?.aborted) {
      return anthropicReadiness(
        modelId,
        null,
        "cancelled",
        true,
        false,
        "cancelled",
      );
    }

    const timeoutMs = Math.min(
      60_000,
      Math.max(1_000, options.timeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS),
    );
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new DOMException("Anthropic readiness timed out", "TimeoutError"));
    }, timeoutMs);

    try {
      const response = await fetch(
        `${ANTHROPIC_API_URL.replace(/\/messages$/, "/models")}/${encodeURIComponent(modelId)}`,
        {
          method: "GET",
          headers: this.headers("application/json", apiKey),
          signal: controller.signal,
          cache: "no-store",
        },
      );
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        return anthropicReadinessHttpFailure(modelId, response.status);
      }
      const contentLength = Number(response.headers.get("content-length"));
      if (
        Number.isFinite(contentLength)
        && contentLength > MAX_MODEL_METADATA_BYTES
      ) {
        await response.body?.cancel().catch(() => undefined);
        return anthropicReadiness(
          modelId,
          null,
          "provider_error",
          true,
          false,
          "protocol_error",
          response.status,
        );
      }
      const body = await response.text();
      if (Buffer.byteLength(body, "utf8") > MAX_MODEL_METADATA_BYTES) {
        return anthropicReadiness(
          modelId,
          null,
          "provider_error",
          true,
          false,
          "protocol_error",
          response.status,
        );
      }
      let actualModelId: string | null = null;
      try {
        const parsed = JSON.parse(body) as { id?: unknown; type?: unknown };
        actualModelId =
          parsed.type === "model" && typeof parsed.id === "string"
            ? parsed.id.trim()
            : null;
      } catch {
        // Normalized below without exposing the provider body.
      }
      if (!actualModelId) {
        return anthropicReadiness(
          modelId,
          null,
          "provider_error",
          false,
          false,
          "protocol_error",
          response.status,
        );
      }
      if (actualModelId !== modelId) {
        return anthropicReadiness(
          modelId,
          actualModelId,
          "model_identity_mismatch",
          false,
          false,
          "model_unavailable",
          response.status,
        );
      }
      return anthropicReadiness(
        modelId,
        actualModelId,
        "ready",
        false,
        true,
        undefined,
        response.status,
      );
    } catch (error) {
      if (timedOut) {
        return anthropicReadiness(
          modelId,
          null,
          "provider_timeout",
          true,
          false,
          "timeout",
        );
      }
      if (options.signal?.aborted || isAbortError(error)) {
        return anthropicReadiness(
          modelId,
          null,
          "cancelled",
          true,
          false,
          "cancelled",
        );
      }
      return anthropicReadiness(
        modelId,
        null,
        "provider_unavailable",
        true,
        false,
        "upstream_error",
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  async *invokeStream(
    invocation: ProviderInvocation,
  ): AsyncIterable<CanonicalStreamEvent> {
    if (
      invocation.binding.providerId !== "anthropic"
      || invocation.binding.adapterId !== this.adapterId
      || invocation.binding.adapterVersion !== this.adapterVersion
      || invocation.binding.status !== "available"
      || !invocation.binding.capabilities.streaming
    ) {
      yield {
        kind: "failed",
        error: providerError(
          "invalid_request",
          "binding_adapter_mismatch",
          false,
        ),
      };
      return;
    }
    if (
      invocation.prompt.tools
      && invocation.prompt.tools.length > 0
      && (
        !invocation.binding.capabilities.tools
        || !this.capabilities.supports_tool_calling
      )
    ) {
      yield {
        kind: "failed",
        error: providerError(
          "invalid_request",
          "tools_not_enabled",
          false,
        ),
      };
      return;
    }
    const apiKey = invocation.credential?.secret ?? this.apiKey;
    if (!apiKey.trim()) {
      yield {
        kind: "failed",
        error: providerError(
          "authentication",
          "credential_unavailable",
          false,
        ),
      };
      return;
    }

    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: this.headers("text/event-stream", apiKey),
        body: JSON.stringify({
          ...this.buildRequestBody(
            invocation.prompt,
            invocation.binding.upstreamModelId,
          ),
          stream: true,
        }),
        signal: invocation.signal,
      });

      if (!response.ok) {
        yield {
          kind: "failed",
          error: httpProviderError(
            response.status,
            parseRetryAfterMs(response.headers.get("retry-after")),
          ),
        };
        return;
      }
      const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
      if (!contentType.startsWith("text/event-stream")) {
        yield {
          kind: "failed",
          error: providerError("protocol_error", "invalid_content_type", false),
        };
        return;
      }
      if (!response.body) {
        yield {
          kind: "failed",
          error: providerError("protocol_error", "empty_response_body", true),
        };
        return;
      }

      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let responseStarted = false;
      let stopReason: string | undefined;
      const providerRequestIdHeader =
        response.headers.get("request-id")
        ?? response.headers.get("x-request-id");
      const toolCalls = new Map<
        number,
        { call_id: string; tool_name: string; json: string }
      >();

      while (true) {
        const { done, value } = await reader.read();
        if (value) buffer += decoder.decode(value, { stream: !done });
        if (done) buffer += decoder.decode();

        const frames = takeCompleteSseFrames(buffer);
        buffer = frames.remainder;
        if (Buffer.byteLength(buffer, "utf8") > MAX_SSE_FRAME_BYTES) {
          yield {
            kind: "failed",
            error: providerError("protocol_error", "sse_frame_too_large", false),
          };
          return;
        }
        for (const frame of frames.frames) {
          if (Buffer.byteLength(frame, "utf8") > MAX_SSE_FRAME_BYTES) {
            yield {
              kind: "failed",
              error: providerError("protocol_error", "sse_frame_too_large", false),
            };
            return;
          }
          let event: AnthropicStreamEvent;
          try {
            event = JSON.parse(readSseData(frame)) as AnthropicStreamEvent;
          } catch {
            yield {
              kind: "failed",
              error: providerError("protocol_error", "malformed_sse_json", false),
            };
            return;
          }

          if (event.type === "message_start") {
            if (responseStarted) {
              yield {
                kind: "failed",
                error: providerError("protocol_error", "duplicate_message_start", false),
              };
              return;
            }
            const actualModelId = event.message?.model?.trim();
            if (!actualModelId) {
              yield {
                kind: "failed",
                error: providerError("protocol_error", "missing_actual_model", false),
              };
              return;
            }
            responseStarted = true;
            yield {
              kind: "response_started",
              provider_id: "anthropic",
              provider_request_id:
                providerRequestIdHeader || event.message?.id?.trim() || null,
              actual_model_id: actualModelId,
            };
            const inputTokens = event.message?.usage?.input_tokens;
            const outputTokens = event.message?.usage?.output_tokens;
            if (inputTokens !== undefined || outputTokens !== undefined) {
              yield {
                kind: "usage",
                mode: "snapshot",
                final: false,
                usage: {
                  ...(inputTokens !== undefined ? { input_tokens: inputTokens } : {}),
                  ...(outputTokens !== undefined ? { output_tokens: outputTokens } : {}),
                },
              };
            }
            continue;
          }

          if (!responseStarted && event.type !== "error") {
            yield {
              kind: "failed",
              error: providerError("protocol_error", "event_before_message_start", false),
            };
            return;
          }

          if (event.type === "content_block_start") {
            if (event.content_block?.type === "tool_use") {
              const index = event.index ?? 0;
              const callId = event.content_block.id?.trim() ?? "";
              const toolName = event.content_block.name?.trim() ?? "";
              if (!callId || !toolName) {
                yield {
                  kind: "failed",
                  error: providerError("protocol_error", "invalid_tool_start", false),
                };
                return;
              }
              toolCalls.set(index, { call_id: callId, tool_name: toolName, json: "" });
              yield {
                kind: "tool_call_start",
                call_id: callId,
                tool_name: toolName,
              };
            }
            continue;
          }

          if (event.type === "content_block_delta") {
            if (event.delta?.type === "text_delta" && typeof event.delta.text === "string") {
              yield { kind: "text_delta", text: event.delta.text };
              continue;
            }
            if (
              event.delta?.type === "input_json_delta"
              && typeof event.delta.partial_json === "string"
            ) {
              const pending = toolCalls.get(event.index ?? 0);
              if (!pending) {
                yield {
                  kind: "failed",
                  error: providerError(
                    "protocol_error",
                    "tool_delta_without_start",
                    false,
                  ),
                };
                return;
              }
              pending.json += event.delta.partial_json;
              yield {
                kind: "tool_call_input_delta",
                call_id: pending.call_id,
                json_fragment: event.delta.partial_json,
              };
            }
            continue;
          }

          if (event.type === "content_block_stop") {
            const index = event.index ?? 0;
            const pending = toolCalls.get(index);
            if (pending) {
              toolCalls.delete(index);
              let input: Record<string, unknown>;
              try {
                input = pending.json.trim()
                  ? JSON.parse(pending.json) as Record<string, unknown>
                  : {};
              } catch {
                yield {
                  kind: "failed",
                  error: providerError("protocol_error", "invalid_tool_input", false),
                };
                return;
              }
              yield {
                kind: "tool_call_complete",
                call_id: pending.call_id,
                input,
              };
            }
            continue;
          }

          if (event.type === "message_delta") {
            const outputTokens = event.usage?.output_tokens;
            if (outputTokens !== undefined) {
              yield {
                kind: "usage",
                mode: "snapshot",
                final: true,
                usage: { output_tokens: outputTokens },
              };
            }
            stopReason = event.delta?.stop_reason;
            if (stopReason === "refusal") {
              yield { kind: "refusal", reason: "provider_refusal" };
            }
            continue;
          }

          if (event.type === "error") {
            yield { kind: "failed", error: anthropicEventError(event.error) };
            return;
          }

          if (event.type === "message_stop") {
            if (toolCalls.size > 0) {
              yield {
                kind: "failed",
                error: providerError("protocol_error", "incomplete_tool_input", false),
              };
              return;
            }
            yield { kind: "completed", reason: mapStopReason(stopReason) };
            return;
          }
        }
        if (done) break;
      }

      // A provider stream must end in exactly one explicit terminal event.
      yield {
        kind: "failed",
        error: providerError("stream_incomplete", "stream_ended_without_terminal", true),
      };
    } catch (error) {
      if (invocation.signal?.aborted || isAbortError(error)) {
        yield { kind: "cancelled" };
        return;
      }
      yield {
        kind: "failed",
        error: providerError("upstream_error", "provider_transport_error", true),
      };
    } finally {
      await reader?.cancel().catch(() => undefined);
    }
  }

  private headers(
    accept: string,
    apiKey: string = this.apiKey,
  ): Record<string, string> {
    return {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
      accept,
    };
  }

  private buildRequestBody(
    prompt: ModelPrompt,
    upstreamModelId: string,
  ): Record<string, unknown> {
    let system: unknown;
    if (prompt.system) {
      // Atlas Phase 1 does not enable prompt caching: cache read/write usage
      // and its distinct price basis must be metered before it can be
      // billable. Legacy callers may still provide an explicit structured
      // system block, but a plain Atlas system prompt stays plain.
      system = typeof prompt.system === "string"
        ? prompt.system
        : prompt.system;
    }
    return {
      model: upstreamModelId,
      max_tokens: prompt.max_tokens,
      ...(system ? { system } : {}),
      ...(prompt.temperature !== undefined ? { temperature: prompt.temperature } : {}),
      messages: toAnthropicMessages(prompt.messages),
      ...(prompt.tools && prompt.tools.length > 0
        ? {
            tools: prompt.tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              input_schema: tool.input_schema,
            })),
          }
        : {}),
    };
  }
}

function toAnthropicMessages(
  messages: readonly ModelMessage[],
): Array<Record<string, unknown>> {
  return messages.map((message) => {
    if (typeof message.content === "string") {
      return { role: message.role, content: message.content };
    }
    return {
      role: message.role,
      content: message.content.map((block): Record<string, unknown> => {
        if (block.type === "tool_use") {
          return {
            type: "tool_use",
            id: block.call_id,
            name: block.tool_name,
            input: block.input,
          };
        }
        if (block.type === "tool_result") {
          return {
            type: "tool_result",
            tool_use_id: block.call_id,
            content: jsonToolResult(block.content),
            ...(block.is_error ? { is_error: true } : {}),
          };
        }
        if (block.type === "text") {
          return {
            type: "text",
            text: block.text,
            ...(block.cache_control
              ? { cache_control: block.cache_control }
              : {}),
          };
        }
        return { type: "image", source: block.source };
      }),
    };
  });
}

function jsonToolResult(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? "null";
}

function takeCompleteSseFrames(buffer: string): {
  frames: string[];
  remainder: string;
} {
  const frames: string[] = [];
  let remainder = buffer;
  let boundary = /\r?\n\r?\n/.exec(remainder);
  while (boundary?.index !== undefined) {
    frames.push(remainder.slice(0, boundary.index));
    remainder = remainder.slice(boundary.index + boundary[0].length);
    boundary = /\r?\n\r?\n/.exec(remainder);
  }
  return { frames, remainder };
}

function readSseData(frame: string): string {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data) throw new Error("missing SSE data");
  return data;
}

function mapStopReason(reason: string | undefined): CanonicalFinishReason {
  if (reason === "max_tokens" || reason === "model_context_window_exceeded") {
    return "length";
  }
  if (reason === "tool_use" || reason === "pause_turn") return "tool_call";
  if (reason === "refusal") return "refusal";
  return "stop";
}

function anthropicEventError(
  error: AnthropicStreamEvent["error"],
): CanonicalProviderError {
  const code = error?.type?.trim() || "provider_stream_error";
  const errorClass = mapAnthropicErrorClass(code);
  return providerError(
    errorClass,
    code,
    errorClass === "rate_limited"
      || errorClass === "overloaded"
      || errorClass === "upstream_error",
  );
}

function httpProviderError(
  status: number,
  retryAfterMs?: number,
): CanonicalProviderError {
  let errorClass: CanonicalProviderErrorClass;
  if (status === 401) errorClass = "authentication";
  else if (status === 403) errorClass = "permission";
  else if (status === 404) errorClass = "model_unavailable";
  else if (status === 429) errorClass = "rate_limited";
  else if (status === 408) errorClass = "timeout";
  else if (status >= 500) errorClass = status === 529 ? "overloaded" : "upstream_error";
  else errorClass = "invalid_request";

  return providerError(
    errorClass,
    `http_${status}`,
    status === 408 || status === 429 || status >= 500,
    retryAfterMs,
  );
}

function mapAnthropicErrorClass(code: string): CanonicalProviderErrorClass {
  if (code.includes("authentication")) return "authentication";
  if (code.includes("permission")) return "permission";
  if (code.includes("quota") || code.includes("billing")) return "quota_exhausted";
  if (code.includes("rate_limit")) return "rate_limited";
  if (code.includes("overload")) return "overloaded";
  if (code.includes("invalid_request")) return "invalid_request";
  if (code.includes("not_found")) return "model_unavailable";
  return "upstream_error";
}

function providerError(
  errorClass: CanonicalProviderErrorClass,
  code: string,
  retryable: boolean,
  retryAfterMs?: number,
): CanonicalProviderError {
  return {
    error_class: errorClass,
    code,
    safe_message: safeProviderMessage(errorClass),
    retryable,
    ...(retryAfterMs !== undefined ? { retry_after_ms: retryAfterMs } : {}),
  };
}

function safeProviderMessage(errorClass: CanonicalProviderErrorClass): string {
  if (errorClass === "rate_limited" || errorClass === "quota_exhausted") {
    return "Atlas is temporarily at capacity. Please try again shortly.";
  }
  if (errorClass === "authentication" || errorClass === "permission") {
    return "Atlas provider access is unavailable.";
  }
  if (errorClass === "cancelled") return "The Atlas response was cancelled.";
  return "Atlas could not complete this response. Please try again.";
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return undefined;
  return Math.max(0, at - Date.now());
}

function anthropicReadinessHttpFailure(
  modelId: string,
  status: number,
): AnthropicReadinessState {
  if (status === 401) {
    return anthropicReadiness(
      modelId, null, "authentication_failed", false, false,
      "authentication", status,
    );
  }
  if (status === 403) {
    return anthropicReadiness(
      modelId, null, "permission_denied", false, false,
      "permission", status,
    );
  }
  if (status === 404) {
    return anthropicReadiness(
      modelId, null, "model_unavailable", false, false,
      "model_unavailable", status,
    );
  }
  if (status === 429) {
    return anthropicReadiness(
      modelId, null, "rate_limited", true, false,
      "rate_limited", status,
    );
  }
  return anthropicReadiness(
    modelId,
    null,
    status >= 500 ? "provider_unavailable" : "provider_error",
    status >= 500,
    false,
    status >= 500 ? "upstream_error" : "invalid_request",
    status,
  );
}

function anthropicReadiness(
  modelId: string,
  actualModelId: string | null,
  reason: AnthropicReadinessReason,
  retryable: boolean,
  eligible: boolean,
  errorClass?: CanonicalProviderErrorClass,
  httpStatus?: number,
): AnthropicReadinessState {
  return {
    modelId,
    actualModelId,
    implemented: true,
    credentialed: reason !== "missing_credential",
    healthy: eligible,
    eligible,
    reason,
    retryable,
    ...(errorClass ? { errorClass } : {}),
    ...(httpStatus !== undefined ? { httpStatus } : {}),
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

interface AnthropicStreamEvent {
  type: string;
  index?: number;
  message?: {
    id?: string;
    model?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  content_block?: {
    type?: string;
    id?: string;
    name?: string;
  };
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
    stop_reason?: string;
  };
  usage?: { output_tokens?: number };
  error?: { type?: string; message?: string };
}
