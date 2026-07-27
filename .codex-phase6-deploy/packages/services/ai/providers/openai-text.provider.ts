/**
 * OpenAI Responses text adapter.
 *
 * Atlas owns conversation state. Every invocation sends bounded Atlas history
 * to the Responses API with store=false and never uses provider conversations,
 * previous_response_id, or the deprecated user field.
 */

import {
  OPENAI_RESPONSES_TEXT_ADAPTER_ID,
  OPENAI_RESPONSES_TEXT_ADAPTER_VERSION,
} from "../agent/model-catalog.js";
import type {
  AtlasModelBinding,
  CanonicalFinishReason,
  CanonicalProviderError,
  CanonicalProviderErrorClass,
  CanonicalProviderUsage,
  CanonicalStreamEvent,
  ContentBlock,
  IModelProvider,
  ModelPrompt,
  ModelResponse,
  ProviderCapabilities,
  ProviderInvocation,
  ProviderOperationalState,
} from "./i-model-provider.js";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODELS_URL = "https://api.openai.com/v1/models";
const OPENAI_DEFAULT_MODEL_ID = "gpt-5.6-sol";

export const OPENAI_RESPONSES_ADAPTER_ID =
  OPENAI_RESPONSES_TEXT_ADAPTER_ID;
export const OPENAI_RESPONSES_ADAPTER_VERSION =
  OPENAI_RESPONSES_TEXT_ADAPTER_VERSION;

const MAX_SSE_FRAME_BYTES = 262_144;
const MAX_TEXT_DELTA_BYTES = 65_536;
const MAX_REFUSAL_BYTES = 16_384;
const MAX_TOOL_ARGUMENT_BYTES = 131_072;
const MAX_PENDING_TOOL_CALLS = 64;
const MAX_INSTRUCTIONS_BYTES = 65_536;
const MAX_INPUT_MESSAGE_BYTES = 65_536;
const MAX_INPUT_BYTES = 524_288;
const MAX_INPUT_MESSAGES = 32;
const MAX_MODEL_ID_BYTES = 200;
const MAX_PROVIDER_REQUEST_ID_BYTES = 500;
const MAX_TOOL_IDENTIFIER_BYTES = 200;
const MAX_TIMEOUT_MS = 10 * 60_000;
const SAFETY_IDENTIFIER_PATTERN = /^[a-f0-9]{64}$/;

export interface OpenAiTextProviderConfig {
  apiKey?: string;
  projectId?: string;
  timeoutMs: number;
  defaultModelId?: string;
}

export interface OpenAiReadinessOptions {
  credential?: { secret: string };
  signal?: AbortSignal;
}

export type OpenAiReadinessReason =
  | "ready"
  | "invalid_model"
  | "missing_credential"
  | "authentication_failed"
  | "permission_denied"
  | "model_unavailable"
  | "rate_limited"
  | "provider_timeout"
  | "provider_unavailable"
  | "provider_error"
  | "cancelled";

export interface OpenAiReadinessState extends ProviderOperationalState {
  modelId: string;
  reason: OpenAiReadinessReason;
  retryable: boolean;
  errorClass?: CanonicalProviderErrorClass;
  httpStatus?: number;
}

export class OpenAiTextProvider implements IModelProvider {
  readonly modelId = "openai-text";
  readonly modelVersion: string;
  readonly adapterId = OPENAI_RESPONSES_ADAPTER_ID;
  readonly adapterVersion = OPENAI_RESPONSES_ADAPTER_VERSION;
  readonly operationalState: ProviderOperationalState;
  readonly capabilities: ProviderCapabilities = {
    supports_vision: false,
    supports_pdf_native: false,
    supports_json_schema: false,
    supports_tool_calling: true,
    supports_embeddings: false,
    supports_streaming: true,
    max_context_tokens: 1_050_000,
    max_output_tokens: 128_000,
    max_input_file_bytes: 0,
    supported_mime_types: ["text/plain", "application/json"],
    supported_regions: ["global"],
    cost_per_1k_input_tokens: 0,
    cost_per_1k_output_tokens: 0,
  };

  private readonly apiKey: string | undefined;
  private readonly projectId: string | undefined;
  private readonly timeoutMs: number;

  constructor(config: OpenAiTextProviderConfig) {
    this.apiKey = optionalNonEmpty(config.apiKey);
    this.projectId = optionalNonEmpty(config.projectId);
    this.timeoutMs = validTimeout(config.timeoutMs);
    this.modelVersion = validModelId(
      config.defaultModelId ?? OPENAI_DEFAULT_MODEL_ID,
    );
    const credentialed = this.apiKey !== undefined;
    this.operationalState = {
      implemented: true,
      credentialed,
      // Credential presence is not a health probe. Bootstrap can register the
      // safe state returned by checkReadiness as its operational override.
      healthy: false,
      eligible: false,
      reason: credentialed ? "readiness_not_checked" : "missing_credential",
    };
  }

  /**
   * Legacy AIRuntime invocations lack the verified safety identifier required
   * by this provider profile. Atlas must use invokeStream with ProviderInvocation.
   */
  async invoke(_prompt: ModelPrompt): Promise<ModelResponse> {
    throw new Error(
      "OpenAI Responses requires an authenticated ProviderInvocation.",
    );
  }

  /**
   * No-generation readiness probe. It retrieves only model metadata and never
   * reads or returns the provider response body.
   */
  async checkReadiness(
    exactModelId: string,
    options: OpenAiReadinessOptions = {},
  ): Promise<OpenAiReadinessState> {
    const modelId = normaliseModelId(exactModelId);
    if (!modelId) {
      return readinessState("", "invalid_model", false, false);
    }

    const apiKey = resolveCredential(options.credential, this.apiKey);
    if (!apiKey) {
      return readinessState(modelId, "missing_credential", false, false);
    }
    if (options.signal?.aborted) {
      return readinessState(
        modelId,
        "cancelled",
        true,
        false,
        "cancelled",
      );
    }

    const requestScope = createRequestScope(options.signal, this.timeoutMs);
    try {
      const response = await fetch(
        `${OPENAI_MODELS_URL}/${encodeURIComponent(modelId)}`,
        {
          method: "GET",
          headers: this.headers(apiKey, "application/json"),
          signal: requestScope.signal,
          cache: "no-store",
        },
      );
      await response.body?.cancel().catch(() => undefined);
      if (response.ok) {
        return {
          modelId,
          implemented: true,
          credentialed: true,
          healthy: true,
          eligible: true,
          reason: "ready",
          retryable: false,
          httpStatus: response.status,
        };
      }
      const mapped = readinessHttpFailure(modelId, response.status);
      return mapped;
    } catch (error) {
      if (requestScope.didTimeout()) {
        return readinessState(
          modelId,
          "provider_timeout",
          true,
          true,
          "timeout",
        );
      }
      if (options.signal?.aborted || isAbortError(error)) {
        return readinessState(
          modelId,
          "cancelled",
          true,
          false,
          "cancelled",
        );
      }
      return readinessState(
        modelId,
        "provider_unavailable",
        true,
        true,
        "upstream_error",
      );
    } finally {
      requestScope.cleanup();
    }
  }

  async *invokeStream(
    invocation: ProviderInvocation,
  ): AsyncIterable<CanonicalStreamEvent> {
    const bindingError = validateBinding(invocation.binding);
    if (bindingError) {
      yield { kind: "failed", error: bindingError };
      return;
    }
    const request = buildResponsesRequest(invocation, this.capabilities);
    if (!request.ok) {
      yield { kind: "failed", error: request.error };
      return;
    }

    const apiKey = resolveCredential(invocation.credential, this.apiKey);
    if (!apiKey) {
      yield {
        kind: "failed",
        error: providerError(
          "authentication",
          "missing_credential",
          false,
        ),
      };
      return;
    }
    if (invocation.signal?.aborted) {
      yield { kind: "cancelled" };
      return;
    }

    const requestScope = createRequestScope(invocation.signal, this.timeoutMs);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let terminalEmitted = false;
    try {
      const response = await fetch(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: this.headers(apiKey, "text/event-stream"),
        body: JSON.stringify(request.body),
        signal: requestScope.signal,
      });

      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        terminalEmitted = true;
        yield {
          kind: "failed",
          error: httpProviderError(
            response.status,
            parseRetryAfterMs(response.headers.get("retry-after")),
          ),
        };
        return;
      }
      const contentType = (response.headers.get("content-type") ?? "")
        .toLowerCase();
      if (!contentType.startsWith("text/event-stream")) {
        await response.body?.cancel().catch(() => undefined);
        terminalEmitted = true;
        yield {
          kind: "failed",
          error: providerError(
            "protocol_error",
            "invalid_content_type",
            false,
          ),
        };
        return;
      }
      if (!response.body) {
        terminalEmitted = true;
        yield {
          kind: "failed",
          error: providerError(
            "protocol_error",
            "empty_response_body",
            true,
          ),
        };
        return;
      }

      const providerRequestId = boundedHeader(
        response.headers.get("x-request-id"),
        MAX_PROVIDER_REQUEST_ID_BYTES,
      );
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let responseStarted = false;
      let responseId: string | null = null;
      let actualModelId: string | null = null;
      let refusal = "";
      let refusalEmitted = false;
      let sawToolCall = false;
      const toolsByItemId = new Map<string, PendingToolCall>();
      const toolsByOutputIndex = new Map<number, PendingToolCall>();

      while (true) {
        const { done, value } = await reader.read();
        if (value) buffer += decoder.decode(value, { stream: !done });
        if (done) buffer += decoder.decode();

        const frames = takeCompleteSseFrames(buffer);
        buffer = frames.remainder;
        if (byteLength(buffer) > MAX_SSE_FRAME_BYTES) {
          terminalEmitted = true;
          yield { kind: "failed", error: protocolError("sse_frame_too_large") };
          return;
        }

        for (const rawFrame of frames.frames) {
          if (byteLength(rawFrame) > MAX_SSE_FRAME_BYTES) {
            terminalEmitted = true;
            yield { kind: "failed", error: protocolError("sse_frame_too_large") };
            return;
          }
          const parsedFrame = parseSseFrame(rawFrame);
          if (!parsedFrame.ok) {
            if (parsedFrame.commentOnly) continue;
            terminalEmitted = true;
            yield { kind: "failed", error: protocolError(parsedFrame.code) };
            return;
          }
          if (parsedFrame.data === "[DONE]") {
            terminalEmitted = true;
            yield {
              kind: "failed",
              error: providerError(
                "stream_incomplete",
                "done_without_terminal_event",
                true,
              ),
            };
            return;
          }

          let event: OpenAiResponseStreamEvent;
          try {
            const parsedEvent = recordValue(
              JSON.parse(parsedFrame.data) as unknown,
            );
            if (!parsedEvent) {
              terminalEmitted = true;
              yield {
                kind: "failed",
                error: protocolError("malformed_sse_event"),
              };
              return;
            }
            event = parsedEvent as OpenAiResponseStreamEvent;
          } catch {
            terminalEmitted = true;
            yield { kind: "failed", error: protocolError("malformed_sse_json") };
            return;
          }
          const eventType = stringValue(event.type);
          if (
            !eventType
            || (parsedFrame.eventName && parsedFrame.eventName !== eventType)
          ) {
            terminalEmitted = true;
            yield { kind: "failed", error: protocolError("sse_event_type_mismatch") };
            return;
          }

          if (eventType === "error") {
            terminalEmitted = true;
            yield {
              kind: "failed",
              error: openAiEventError(event, "provider_stream_error"),
            };
            return;
          }

          if (eventType === "response.created") {
            if (responseStarted) {
              terminalEmitted = true;
              yield { kind: "failed", error: protocolError("duplicate_response_created") };
              return;
            }
            const startedResponse = responseObject(event.response);
            const id = boundedIdentifier(
              startedResponse?.id,
              MAX_PROVIDER_REQUEST_ID_BYTES,
            );
            const model = normaliseModelId(startedResponse?.model);
            if (!id || !model) {
              terminalEmitted = true;
              yield { kind: "failed", error: protocolError("invalid_response_created") };
              return;
            }
            if (!bindingAcceptsActualModel(invocation.binding, model)) {
              terminalEmitted = true;
              yield { kind: "failed", error: protocolError("actual_model_mismatch") };
              return;
            }
            responseStarted = true;
            responseId = id;
            actualModelId = model;
            yield {
              kind: "response_started",
              provider_id: "openai",
              provider_request_id: providerRequestId ?? id,
              actual_model_id: model,
            };
            continue;
          }

          if (!responseStarted) {
            terminalEmitted = true;
            yield { kind: "failed", error: protocolError("event_before_response_created") };
            return;
          }

          if (eventType === "response.output_text.delta") {
            const delta = stringValue(event.delta);
            if (delta === null || byteLength(delta) > MAX_TEXT_DELTA_BYTES) {
              terminalEmitted = true;
              yield { kind: "failed", error: protocolError("invalid_text_delta") };
              return;
            }
            if (delta) yield { kind: "text_delta", text: delta };
            continue;
          }

          if (eventType === "response.refusal.delta") {
            const delta = stringValue(event.delta);
            if (delta === null) {
              terminalEmitted = true;
              yield { kind: "failed", error: protocolError("invalid_refusal_delta") };
              return;
            }
            refusal += delta;
            if (byteLength(refusal) > MAX_REFUSAL_BYTES) {
              terminalEmitted = true;
              yield { kind: "failed", error: protocolError("refusal_too_large") };
              return;
            }
            continue;
          }

          if (eventType === "response.refusal.done") {
            if (refusalEmitted) {
              terminalEmitted = true;
              yield { kind: "failed", error: protocolError("duplicate_refusal_done") };
              return;
            }
            const completeRefusal = stringValue(event.refusal);
            if (completeRefusal === null) {
              terminalEmitted = true;
              yield { kind: "failed", error: protocolError("invalid_refusal_done") };
              return;
            }
            if (byteLength(completeRefusal) > MAX_REFUSAL_BYTES) {
              terminalEmitted = true;
              yield { kind: "failed", error: protocolError("refusal_too_large") };
              return;
            }
            if (refusal && completeRefusal && refusal !== completeRefusal) {
              terminalEmitted = true;
              yield { kind: "failed", error: protocolError("refusal_content_mismatch") };
              return;
            }
            refusal = completeRefusal || refusal || "request_refused";
            refusalEmitted = true;
            yield { kind: "refusal", reason: refusal };
            continue;
          }

          if (eventType === "response.output_item.added") {
            const item = recordValue(event.item);
            const itemType = stringValue(item?.["type"]);
            if (itemType !== "function_call") continue;

            const itemId = boundedIdentifier(
              item?.["id"],
              MAX_TOOL_IDENTIFIER_BYTES,
            );
            const callId = boundedIdentifier(
              item?.["call_id"],
              MAX_TOOL_IDENTIFIER_BYTES,
            );
            const toolName = boundedIdentifier(
              item?.["name"],
              MAX_TOOL_IDENTIFIER_BYTES,
            );
            const outputIndex = nonNegativeInteger(event.output_index);
            const initialArguments = stringValue(item?.["arguments"]) ?? "";
            if (
              !itemId
              || !callId
              || !toolName
              || outputIndex === null
              || byteLength(initialArguments) > MAX_TOOL_ARGUMENT_BYTES
              || toolsByItemId.size >= MAX_PENDING_TOOL_CALLS
              || toolsByItemId.has(itemId)
              || toolsByOutputIndex.has(outputIndex)
            ) {
              terminalEmitted = true;
              yield {
                kind: "failed",
                error: protocolError(
                  toolsByItemId.size >= MAX_PENDING_TOOL_CALLS
                    ? "too_many_tool_calls"
                    : "invalid_tool_call_start",
                ),
              };
              return;
            }
            const pending: PendingToolCall = {
              itemId,
              callId,
              toolName,
              arguments: initialArguments,
              complete: false,
            };
            toolsByItemId.set(itemId, pending);
            toolsByOutputIndex.set(outputIndex, pending);
            sawToolCall = true;
            yield {
              kind: "tool_call_start",
              call_id: callId,
              tool_name: toolName,
            };
            continue;
          }

          if (eventType === "response.function_call_arguments.delta") {
            const pending = findPendingTool(
              event,
              toolsByItemId,
              toolsByOutputIndex,
            );
            const delta = stringValue(event.delta);
            if (!pending || pending.complete || delta === null) {
              terminalEmitted = true;
              yield { kind: "failed", error: protocolError("invalid_tool_input_delta") };
              return;
            }
            pending.arguments += delta;
            if (byteLength(pending.arguments) > MAX_TOOL_ARGUMENT_BYTES) {
              terminalEmitted = true;
              yield { kind: "failed", error: protocolError("tool_input_too_large") };
              return;
            }
            if (delta) {
              yield {
                kind: "tool_call_input_delta",
                call_id: pending.callId,
                json_fragment: delta,
              };
            }
            continue;
          }

          if (eventType === "response.function_call_arguments.done") {
            const pending = findPendingTool(
              event,
              toolsByItemId,
              toolsByOutputIndex,
            );
            const completeArguments = stringValue(event.arguments);
            if (!pending || pending.complete || completeArguments === null) {
              terminalEmitted = true;
              yield { kind: "failed", error: protocolError("invalid_tool_input_done") };
              return;
            }
            if (byteLength(completeArguments) > MAX_TOOL_ARGUMENT_BYTES) {
              terminalEmitted = true;
              yield { kind: "failed", error: protocolError("tool_input_too_large") };
              return;
            }
            if (
              pending.arguments
              && completeArguments
              && pending.arguments !== completeArguments
            ) {
              terminalEmitted = true;
              yield { kind: "failed", error: protocolError("tool_input_mismatch") };
              return;
            }
            const serialized = completeArguments || pending.arguments || "{}";
            const input = parseToolInput(serialized);
            if (!input) {
              terminalEmitted = true;
              yield { kind: "failed", error: protocolError("invalid_tool_input") };
              return;
            }
            pending.arguments = serialized;
            pending.complete = true;
            yield {
              kind: "tool_call_complete",
              call_id: pending.callId,
              input,
            };
            continue;
          }

          if (
            eventType === "response.completed"
            || eventType === "response.failed"
            || eventType === "response.incomplete"
          ) {
            const terminalResponse = responseObject(event.response);
            const terminalIdentityError = validateTerminalResponseIdentity(
              terminalResponse,
              responseId,
              actualModelId,
              invocation.binding,
            );
            if (terminalIdentityError) {
              terminalEmitted = true;
              yield { kind: "failed", error: terminalIdentityError };
              return;
            }

            const usageResult = disjointUsage(terminalResponse?.usage);
            if (!usageResult.ok) {
              terminalEmitted = true;
              yield { kind: "failed", error: protocolError(usageResult.code) };
              return;
            }
            if (
              eventType === "response.completed"
              && usageResult.usage === null
            ) {
              terminalEmitted = true;
              yield {
                kind: "failed",
                error: protocolError("missing_final_usage"),
              };
              return;
            }
            if (usageResult.usage) {
              yield {
                kind: "usage",
                mode: "snapshot",
                final: true,
                usage: usageResult.usage,
              };
            }

            if (eventType === "response.failed") {
              terminalEmitted = true;
              yield {
                kind: "failed",
                error: openAiEventError(
                  terminalResponse?.error,
                  "response_failed",
                ),
              };
              return;
            }
            if (eventType === "response.incomplete") {
              terminalEmitted = true;
              yield {
                kind: "failed",
                error: incompleteResponseError(terminalResponse),
              };
              return;
            }

            if ([...toolsByItemId.values()].some((tool) => !tool.complete)) {
              terminalEmitted = true;
              yield { kind: "failed", error: protocolError("incomplete_tool_input") };
              return;
            }
            if (!refusalEmitted) {
              const terminalRefusal = extractResponseRefusal(terminalResponse);
              if (terminalRefusal === "too_large") {
                terminalEmitted = true;
                yield { kind: "failed", error: protocolError("refusal_too_large") };
                return;
              }
              if (terminalRefusal) {
                refusal = terminalRefusal;
                refusalEmitted = true;
                yield { kind: "refusal", reason: refusal };
              }
            }

            terminalEmitted = true;
            yield {
              kind: "completed",
              reason: completionReason(refusalEmitted, sawToolCall),
            };
            return;
          }

          if (!IGNORED_RESPONSE_EVENTS.has(eventType)) {
            terminalEmitted = true;
            yield {
              kind: "failed",
              error: protocolError("unsupported_provider_event"),
            };
            return;
          }
        }

        if (done) break;
      }

      terminalEmitted = true;
      yield {
        kind: "failed",
        error: providerError(
          "stream_incomplete",
          buffer.trim()
            ? "truncated_sse_frame"
            : "stream_ended_without_terminal",
          true,
        ),
      };
    } catch (error) {
      terminalEmitted = true;
      if (requestScope.didTimeout()) {
        yield {
          kind: "failed",
          error: providerError(
            "timeout",
            "provider_timeout",
            true,
          ),
        };
        return;
      }
      if (invocation.signal?.aborted || isAbortError(error)) {
        yield { kind: "cancelled" };
        return;
      }
      yield {
        kind: "failed",
        error: providerError(
          "upstream_error",
          "provider_transport_error",
          true,
        ),
      };
    } finally {
      if (!terminalEmitted) {
        requestScope.abort(
          new DOMException("OpenAI stream consumer closed", "AbortError"),
        );
      }
      await reader?.cancel().catch(() => undefined);
      requestScope.cleanup();
    }
  }

  private headers(apiKey: string, accept: string): Record<string, string> {
    return {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: accept,
      ...(this.projectId ? { "OpenAI-Project": this.projectId } : {}),
    };
  }
}

const IGNORED_RESPONSE_EVENTS = new Set([
  "response.in_progress",
  "response.output_item.done",
  "response.content_part.added",
  "response.content_part.done",
  "response.output_text.done",
]);

function validateBinding(
  binding: AtlasModelBinding,
): CanonicalProviderError | null {
  if (
    binding.providerId !== "openai"
    || binding.adapterId !== OPENAI_RESPONSES_ADAPTER_ID
    || binding.adapterVersion !== OPENAI_RESPONSES_ADAPTER_VERSION
    || binding.status !== "available"
    || !binding.capabilities.streaming
    || !normaliseModelId(binding.upstreamModelId)
  ) {
    return providerError(
      "invalid_request",
      "binding_adapter_mismatch",
      false,
    );
  }
  return null;
}

function buildResponsesRequest(
  invocation: ProviderInvocation,
  capabilities: ProviderCapabilities,
):
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; error: CanonicalProviderError } {
  const safetyIdentifier = invocation.trace.safetyIdentifier.trim().toLowerCase();
  if (!SAFETY_IDENTIFIER_PATTERN.test(safetyIdentifier)) {
    return {
      ok: false,
      error: providerError(
        "invalid_request",
        "invalid_safety_identifier",
        false,
      ),
    };
  }
  if (
    invocation.prompt.temperature !== undefined
    || invocation.prompt.response_format !== undefined
  ) {
    return {
      ok: false,
      error: providerError(
        "invalid_request",
        "unsupported_generation_parameter",
        false,
      ),
    };
  }

  const instructions = promptText(invocation.prompt.system);
  if (
    instructions === null
    || byteLength(instructions) > MAX_INSTRUCTIONS_BYTES
  ) {
    return {
      ok: false,
      error: providerError(
        "invalid_request",
        "invalid_instructions",
        false,
      ),
    };
  }
  if (
    invocation.prompt.messages.length === 0
    || invocation.prompt.messages.length > MAX_INPUT_MESSAGES
  ) {
    return {
      ok: false,
      error: providerError(
        "invalid_request",
        "invalid_history_length",
        false,
      ),
    };
  }

  const tools = invocation.prompt.tools ?? [];
  if (
    tools.length > 0
    && (
      !invocation.binding.capabilities.tools
      || !capabilities.supports_tool_calling
      || tools.length > MAX_PENDING_TOOL_CALLS
    )
  ) {
    return {
      ok: false,
      error: providerError("invalid_request", "tools_not_enabled", false),
    };
  }
  for (const tool of tools) {
    if (
      !boundedToolIdentifier(tool.name)
      || !tool.description.trim()
      || !isRecordValue(tool.input_schema)
    ) {
      return {
        ok: false,
        error: providerError(
          "invalid_request",
          "invalid_tool_definition",
          false,
        ),
      };
    }
  }

  let totalInputBytes = byteLength(instructions);
  const input: Array<Record<string, unknown>> = [];
  for (const message of invocation.prompt.messages) {
    const converted = toOpenAiInputItems(message.role, message.content);
    if (!converted) {
      return {
        ok: false,
        error: providerError(
          "invalid_request",
          "invalid_history_message",
          false,
        ),
      };
    }
    const encoded = JSON.stringify(converted);
    totalInputBytes += byteLength(encoded);
    if (totalInputBytes > MAX_INPUT_BYTES) {
      return {
        ok: false,
        error: providerError(
          "invalid_request",
          "history_too_large",
          false,
        ),
      };
    }
    input.push(...converted);
  }

  const requestedMaxOutput = invocation.prompt.max_tokens;
  if (!Number.isSafeInteger(requestedMaxOutput) || requestedMaxOutput <= 0) {
    return {
      ok: false,
      error: providerError(
        "invalid_request",
        "invalid_max_output_tokens",
        false,
      ),
    };
  }
  const maxOutputTokens = Math.min(
    requestedMaxOutput,
    invocation.binding.capabilities.maxOutputTokens,
    capabilities.max_output_tokens,
  );

  return {
    ok: true,
    body: {
      model: invocation.binding.upstreamModelId,
      stream: true,
      store: false,
      truncation: "disabled",
      reasoning: { effort: "none" },
      safety_identifier: safetyIdentifier,
      max_output_tokens: maxOutputTokens,
      ...(instructions ? { instructions } : {}),
      input,
      ...(tools.length > 0
        ? {
            tools: tools.map((tool) => ({
              type: "function",
              name: tool.name,
              description: tool.description,
              parameters: tool.input_schema,
              strict: true,
            })),
          }
        : {}),
    },
  };
}

function toOpenAiInputItems(
  role: "user" | "assistant",
  content: string | ContentBlock[],
): Array<Record<string, unknown>> | null {
  if (typeof content === "string") {
    if (
      !content.trim()
      || byteLength(content) > MAX_INPUT_MESSAGE_BYTES
    ) {
      return null;
    }
    return [{ role, content }];
  }

  const items: Array<Record<string, unknown>> = [];
  let pendingText = "";
  const flushText = (): boolean => {
    if (!pendingText) return true;
    if (
      !pendingText.trim()
      || byteLength(pendingText) > MAX_INPUT_MESSAGE_BYTES
    ) {
      return false;
    }
    items.push({ role, content: pendingText });
    pendingText = "";
    return true;
  };

  for (const block of content) {
    if (block.type === "text") {
      pendingText += block.text;
      continue;
    }
    if (!flushText()) return null;
    if (
      block.type === "tool_use"
      && role === "assistant"
      && boundedToolIdentifier(block.call_id)
      && boundedToolIdentifier(block.tool_name)
      && isRecordValue(block.input)
    ) {
      const argumentsJson = JSON.stringify(block.input);
      if (byteLength(argumentsJson) > MAX_TOOL_ARGUMENT_BYTES) return null;
      items.push({
        type: "function_call",
        call_id: block.call_id,
        name: block.tool_name,
        arguments: argumentsJson,
      });
      continue;
    }
    if (
      block.type === "tool_result"
      && role === "user"
      && boundedToolIdentifier(block.call_id)
    ) {
      const output = jsonToolOutput(block.content);
      if (byteLength(output) > MAX_INPUT_MESSAGE_BYTES) return null;
      items.push({
        type: "function_call_output",
        call_id: block.call_id,
        output,
      });
      continue;
    }
    return null;
  }
  if (!flushText() || items.length === 0) return null;
  return items;
}

function boundedToolIdentifier(value: unknown): value is string {
  return typeof value === "string"
    && value.trim().length > 0
    && byteLength(value) <= MAX_TOOL_IDENTIFIER_BYTES;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonToolOutput(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? "null";
}

function promptText(
  content: string | ContentBlock[] | undefined,
): string | null {
  if (content === undefined) return "";
  if (typeof content === "string") return content;
  const parts: string[] = [];
  for (const block of content) {
    if (block.type !== "text") return null;
    parts.push(block.text);
  }
  return parts.join("\n");
}

function validateTerminalResponseIdentity(
  response: OpenAiResponse | null,
  expectedResponseId: string | null,
  expectedModelId: string | null,
  binding: AtlasModelBinding,
): CanonicalProviderError | null {
  if (!response || !expectedResponseId || !expectedModelId) {
    return protocolError("missing_terminal_response");
  }
  const responseId = boundedIdentifier(
    response.id,
    MAX_PROVIDER_REQUEST_ID_BYTES,
  );
  const modelId = normaliseModelId(response.model);
  if (responseId !== expectedResponseId) {
    return protocolError("response_id_mismatch");
  }
  if (
    !modelId
    || modelId !== expectedModelId
    || !bindingAcceptsActualModel(binding, modelId)
  ) {
    return protocolError("actual_model_mismatch");
  }
  return null;
}

function bindingAcceptsActualModel(
  binding: AtlasModelBinding,
  actualModelId: string,
): boolean {
  return actualModelId === binding.upstreamModelId
    || binding.allowedUpstreamModelAliases?.includes(actualModelId) === true;
}

function disjointUsage(
  value: unknown,
):
  | { ok: true; usage: CanonicalProviderUsage | null }
  | { ok: false; code: string } {
  if (value === undefined || value === null) {
    return { ok: true, usage: null };
  }
  const usage = recordValue(value);
  if (!usage) return { ok: false, code: "invalid_usage" };
  const inputTokens = nonNegativeInteger(usage["input_tokens"]);
  const outputTokens = nonNegativeInteger(usage["output_tokens"]);
  const inputDetails = recordValue(usage["input_tokens_details"]);
  const outputDetails = recordValue(usage["output_tokens_details"]);
  const cacheReadTokens = inputDetails?.["cached_tokens"] === undefined
    ? 0
    : nonNegativeInteger(inputDetails["cached_tokens"]);
  const cacheWriteTokens = inputDetails?.["cache_write_tokens"] === undefined
    ? 0
    : nonNegativeInteger(inputDetails["cache_write_tokens"]);
  const reasoningTokens = outputDetails?.["reasoning_tokens"] === undefined
    ? 0
    : nonNegativeInteger(outputDetails["reasoning_tokens"]);

  if (
    inputTokens === null
    || outputTokens === null
    || cacheReadTokens === null
    || cacheWriteTokens === null
    || reasoningTokens === null
    || cacheReadTokens + cacheWriteTokens > inputTokens
    || reasoningTokens > outputTokens
  ) {
    return { ok: false, code: "invalid_usage" };
  }
  return {
    ok: true,
    usage: {
      input_tokens: inputTokens - cacheReadTokens - cacheWriteTokens,
      cache_read_tokens: cacheReadTokens,
      cache_write_tokens: cacheWriteTokens,
      output_tokens: outputTokens - reasoningTokens,
      reasoning_tokens: reasoningTokens,
    },
  };
}

function completionReason(
  refused: boolean,
  sawToolCall: boolean,
): CanonicalFinishReason {
  if (refused) return "refusal";
  if (sawToolCall) return "tool_call";
  return "stop";
}

function incompleteResponseError(
  response: OpenAiResponse | null,
): CanonicalProviderError {
  const details = recordValue(response?.incomplete_details);
  const reason = safeCode(details?.["reason"], "response_incomplete");
  if (reason.includes("content_filter")) {
    return providerError("safety_block", reason, false);
  }
  return providerError(
    "stream_incomplete",
    reason,
    reason !== "max_output_tokens",
  );
}

function extractResponseRefusal(
  response: OpenAiResponse | null,
): string | "too_large" | null {
  const output = Array.isArray(response?.output) ? response.output : [];
  for (const itemValue of output) {
    const item = recordValue(itemValue);
    const content = Array.isArray(item?.["content"]) ? item["content"] : [];
    for (const partValue of content) {
      const part = recordValue(partValue);
      if (part?.["type"] !== "refusal") continue;
      const refusal = stringValue(part["refusal"]);
      if (!refusal) continue;
      if (byteLength(refusal) > MAX_REFUSAL_BYTES) return "too_large";
      return refusal;
    }
  }
  return null;
}

function findPendingTool(
  event: OpenAiResponseStreamEvent,
  byItemId: ReadonlyMap<string, PendingToolCall>,
  byOutputIndex: ReadonlyMap<number, PendingToolCall>,
): PendingToolCall | undefined {
  const itemId = stringValue(event.item_id);
  if (itemId) return byItemId.get(itemId);
  const outputIndex = nonNegativeInteger(event.output_index);
  return outputIndex === null ? undefined : byOutputIndex.get(outputIndex);
}

function parseToolInput(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return recordValue(parsed);
  } catch {
    return null;
  }
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

function parseSseFrame(
  frame: string,
):
  | {
      ok: true;
      eventName: string | null;
      data: string;
    }
  | {
      ok: false;
      commentOnly: boolean;
      code: string;
    } {
  let eventName: string | null = null;
  const data: string[] = [];
  let sawNonComment = false;
  for (const line of frame.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    sawNonComment = true;
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      data.push(line.slice(5).trimStart());
      continue;
    }
  }
  if (data.length === 0) {
    return {
      ok: false,
      commentOnly: !sawNonComment,
      code: "missing_sse_data",
    };
  }
  return { ok: true, eventName, data: data.join("\n") };
}

function openAiEventError(
  value: unknown,
  fallbackCode: string,
): CanonicalProviderError {
  const error = recordValue(value);
  const code = safeCode(
    error?.["code"] ?? error?.["type"],
    fallbackCode,
  );
  const errorClass = mapOpenAiErrorClass(code);
  return providerError(
    errorClass,
    code,
    errorClass === "rate_limited"
      || errorClass === "quota_exhausted"
      || errorClass === "overloaded"
      || errorClass === "timeout"
      || errorClass === "upstream_error",
  );
}

function mapOpenAiErrorClass(code: string): CanonicalProviderErrorClass {
  if (
    code.includes("api_key")
    || code.includes("authentication")
    || code.includes("unauthorized")
  ) {
    return "authentication";
  }
  if (
    code.includes("permission")
    || code.includes("access_denied")
  ) {
    return "permission";
  }
  if (
    code.includes("model_not_found")
    || code.includes("model_unavailable")
  ) {
    return "model_unavailable";
  }
  if (
    code.includes("insufficient_quota")
    || code.includes("billing")
    || code.includes("quota")
  ) {
    return "quota_exhausted";
  }
  if (code.includes("rate_limit")) return "rate_limited";
  if (code.includes("overload") || code.includes("capacity")) {
    return "overloaded";
  }
  if (code.includes("timeout")) return "timeout";
  if (
    code.includes("content_filter")
    || code.includes("safety")
  ) {
    return "safety_block";
  }
  if (
    code.includes("invalid")
    || code.includes("unsupported")
    || code.includes("bad_request")
  ) {
    return "invalid_request";
  }
  return "upstream_error";
}

function httpProviderError(
  status: number,
  retryAfterMs?: number,
): CanonicalProviderError {
  let errorClass: CanonicalProviderErrorClass;
  if (status === 401) errorClass = "authentication";
  else if (status === 403) errorClass = "permission";
  else if (status === 404) errorClass = "model_unavailable";
  else if (status === 408 || status === 504) errorClass = "timeout";
  else if (status === 429) errorClass = "rate_limited";
  else if (status === 503) errorClass = "overloaded";
  else if (status >= 500) errorClass = "upstream_error";
  else errorClass = "invalid_request";

  return providerError(
    errorClass,
    `http_${status}`,
    status === 408 || status === 429 || status >= 500,
    retryAfterMs,
  );
}

function protocolError(code: string): CanonicalProviderError {
  return providerError("protocol_error", code, false);
}

function providerError(
  errorClass: CanonicalProviderErrorClass,
  code: string,
  retryable: boolean,
  retryAfterMs?: number,
): CanonicalProviderError {
  return {
    error_class: errorClass,
    code: safeCode(code, "provider_error"),
    safe_message: safeProviderMessage(errorClass),
    retryable,
    ...(retryAfterMs !== undefined ? { retry_after_ms: retryAfterMs } : {}),
  };
}

function safeProviderMessage(errorClass: CanonicalProviderErrorClass): string {
  if (
    errorClass === "rate_limited"
    || errorClass === "quota_exhausted"
    || errorClass === "overloaded"
  ) {
    return "Atlas is temporarily at capacity. Please try again shortly.";
  }
  if (errorClass === "authentication" || errorClass === "permission") {
    return "Atlas provider access is unavailable.";
  }
  if (errorClass === "model_unavailable") {
    return "The selected Atlas mode is temporarily unavailable.";
  }
  if (errorClass === "timeout") {
    return "Atlas timed out while waiting for the provider. Please try again.";
  }
  if (errorClass === "cancelled") {
    return "The Atlas response was cancelled.";
  }
  if (errorClass === "safety_block") {
    return "Atlas cannot help with that request.";
  }
  return "Atlas could not complete this response. Please try again.";
}

function readinessHttpFailure(
  modelId: string,
  status: number,
): OpenAiReadinessState {
  if (status === 401) {
    return readinessState(
      modelId,
      "authentication_failed",
      true,
      false,
      "authentication",
      status,
    );
  }
  if (status === 403) {
    return readinessState(
      modelId,
      "permission_denied",
      true,
      false,
      "permission",
      status,
    );
  }
  if (status === 404) {
    return readinessState(
      modelId,
      "model_unavailable",
      true,
      false,
      "model_unavailable",
      status,
    );
  }
  if (status === 429) {
    return readinessState(
      modelId,
      "rate_limited",
      true,
      true,
      "rate_limited",
      status,
    );
  }
  if (status === 408 || status === 504) {
    return readinessState(
      modelId,
      "provider_timeout",
      true,
      true,
      "timeout",
      status,
    );
  }
  if (status >= 500) {
    return readinessState(
      modelId,
      "provider_unavailable",
      true,
      true,
      status === 503 ? "overloaded" : "upstream_error",
      status,
    );
  }
  return readinessState(
    modelId,
    "provider_error",
    true,
    false,
    "invalid_request",
    status,
  );
}

function readinessState(
  modelId: string,
  reason: OpenAiReadinessReason,
  credentialed: boolean,
  retryable: boolean,
  errorClass?: CanonicalProviderErrorClass,
  httpStatus?: number,
): OpenAiReadinessState {
  return {
    modelId,
    implemented: true,
    credentialed,
    healthy: false,
    eligible: false,
    reason,
    retryable,
    ...(errorClass ? { errorClass } : {}),
    ...(httpStatus !== undefined ? { httpStatus } : {}),
  };
}

function createRequestScope(
  parentSignal: AbortSignal | undefined,
  timeoutMs: number,
): {
  signal: AbortSignal;
  didTimeout(): boolean;
  abort(reason?: unknown): void;
  cleanup(): void;
} {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => {
    if (!controller.signal.aborted) controller.abort(parentSignal?.reason);
  };
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });

  const timeout = setTimeout(() => {
    if (!controller.signal.aborted) {
      timedOut = true;
      controller.abort(
        new DOMException("OpenAI provider timeout", "TimeoutError"),
      );
    }
  }, timeoutMs);
  timeout.unref?.();

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    abort: (reason?: unknown) => {
      if (!controller.signal.aborted) controller.abort(reason);
    },
    cleanup: () => {
      clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", abortFromParent);
    },
  };
}

function resolveCredential(
  credential: { secret: string } | undefined,
  configuredApiKey: string | undefined,
): string | undefined {
  return optionalNonEmpty(credential?.secret) ?? configuredApiKey;
}

function validTimeout(value: number): number {
  if (
    !Number.isSafeInteger(value)
    || value <= 0
    || value > MAX_TIMEOUT_MS
  ) {
    throw new Error(
      `OpenAiTextProvider timeoutMs must be an integer between 1 and ${MAX_TIMEOUT_MS}.`,
    );
  }
  return value;
}

function validModelId(value: string): string {
  const modelId = normaliseModelId(value);
  if (!modelId) {
    throw new Error("OpenAiTextProvider defaultModelId is invalid.");
  }
  return modelId;
}

function normaliseModelId(value: unknown): string | null {
  const modelId = stringValue(value)?.trim() ?? "";
  if (
    !modelId
    || byteLength(modelId) > MAX_MODEL_ID_BYTES
    || /[\u0000-\u001f\u007f]/.test(modelId)
  ) {
    return null;
  }
  return modelId;
}

function optionalNonEmpty(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function boundedIdentifier(value: unknown, maxBytes: number): string | null {
  const normalized = stringValue(value)?.trim() ?? "";
  return normalized && byteLength(normalized) <= maxBytes ? normalized : null;
}

function boundedHeader(value: string | null, maxBytes: number): string | null {
  return boundedIdentifier(value, maxBytes);
}

function safeCode(value: unknown, fallback: string): string {
  const raw = stringValue(value)?.trim().toLowerCase() ?? "";
  const normalized = raw
    .replace(/[^a-z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 128);
  return normalized || fallback;
}

function nonNegativeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0
    ? Number(value)
    : null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function responseObject(value: unknown): OpenAiResponse | null {
  return recordValue(value) as OpenAiResponse | null;
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1_000);
  }
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return undefined;
  return Math.max(0, at - Date.now());
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error
    && (error.name === "AbortError" || error.name === "TimeoutError");
}

interface PendingToolCall {
  itemId: string;
  callId: string;
  toolName: string;
  arguments: string;
  complete: boolean;
}

interface OpenAiResponse {
  id?: unknown;
  model?: unknown;
  usage?: unknown;
  error?: unknown;
  incomplete_details?: unknown;
  output?: unknown;
}

interface OpenAiResponseStreamEvent extends Record<string, unknown> {
  type?: unknown;
  response?: unknown;
  delta?: unknown;
  refusal?: unknown;
  item?: unknown;
  item_id?: unknown;
  output_index?: unknown;
  arguments?: unknown;
}
