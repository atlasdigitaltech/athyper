/**
 * Gemini Interactions text adapter.
 *
 * Atlas owns conversation state. Every invocation sends bounded Atlas history
 * with store=false and never uses previous_interaction_id, background work,
 * provider tools, files, or provider-owned thread state.
 *
 * The official SDK is intentionally contained in this adapter. Canonical
 * provider events are the only vendor-independent types that leave it.
 */

import { ApiError, GoogleGenAI } from "@google/genai";
import {
  GEMINI_INTERACTIONS_TEXT_ADAPTER_ID,
  GEMINI_INTERACTIONS_TEXT_ADAPTER_VERSION,
} from "../agent/model-catalog.js";
import type {
  AtlasModelBinding,
  CanonicalProviderError,
  CanonicalProviderErrorClass,
  CanonicalProviderUsage,
  CanonicalStreamEvent,
  ContentBlock,
  IModelProvider,
  ModelPrompt,
  ModelResponse,
  ProviderAccountClass,
  ProviderCapabilities,
  ProviderInvocation,
  ProviderOperationalState,
} from "./i-model-provider.js";

const GEMINI_DEFAULT_MODEL_ID = "gemini-3.6-flash";
const GEMINI_STANDARD_SERVICE_TIER = "standard";

export const GEMINI_INTERACTIONS_ADAPTER_ID =
  GEMINI_INTERACTIONS_TEXT_ADAPTER_ID;
export const GEMINI_INTERACTIONS_ADAPTER_VERSION =
  GEMINI_INTERACTIONS_TEXT_ADAPTER_VERSION;

const MAX_TIMEOUT_MS = 10 * 60_000;
const MAX_MODEL_ID_BYTES = 200;
const MAX_PROJECT_ID_BYTES = 200;
const MAX_REGION_BYTES = 100;
const MAX_PROVIDER_REQUEST_ID_BYTES = 500;
const MAX_TOOL_IDENTIFIER_BYTES = 200;
const MAX_INPUT_MESSAGES = 32;
const MAX_INPUT_MESSAGE_BYTES = 65_536;
const MAX_SYSTEM_BYTES = 65_536;
const MAX_INPUT_BYTES = 524_288;
const MAX_TEXT_DELTA_BYTES = 65_536;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_TOOL_ARGUMENT_BYTES = 131_072;
const MAX_PENDING_TOOL_CALLS = 64;
const MAX_STREAM_EVENTS = 100_000;
const MAX_STREAM_STEPS = 256;

export interface GeminiTextProviderConfig {
  apiKey?: string;
  timeoutMs: number;
  defaultModelId?: string;
  /**
   * Governance identifier for the separately approved Google Cloud project.
   * It is never sent in an Interactions request or exposed in a public model
   * catalog.
   */
  projectId: string;
  /**
   * Gemini Developer API is a global endpoint. "global" is endpoint metadata,
   * not a data-residency claim.
   */
  providerRegion: string;
  providerAccountClass: ProviderAccountClass;
}

export interface GeminiReadinessOptions {
  credential?: { secret: string };
  signal?: AbortSignal;
}

export type GeminiReadinessReason =
  | "ready"
  | "invalid_model"
  | "missing_credential"
  | "authentication_failed"
  | "permission_denied"
  | "model_unavailable"
  | "rate_limited"
  | "quota_exhausted"
  | "provider_timeout"
  | "provider_unavailable"
  | "provider_error"
  | "cancelled";

export interface GeminiReadinessState extends ProviderOperationalState {
  modelId: string;
  reason: GeminiReadinessReason;
  retryable: boolean;
  errorClass?: CanonicalProviderErrorClass;
  httpStatus?: number;
}

interface GeminiInputStep {
  type: "user_input" | "model_output";
  content: Array<{ type: "text"; text: string }>;
}

interface GeminiInteractionRequest {
  model: string;
  input: GeminiInputStep[];
  stream: true;
  store: false;
  system_instruction?: string;
  service_tier: "standard";
  generation_config: {
    max_output_tokens: number;
    thinking_level: "medium";
    thinking_summaries: "none";
  };
}

interface PendingToolCall {
  atlasCallId: string;
  nativeCallId: string | null;
  nativeStepIndex: number;
  name: string;
  arguments: string;
  startArguments: Record<string, unknown>;
  complete: boolean;
}

interface RequestScope {
  signal: AbortSignal;
  didTimeout(): boolean;
  cleanup(): void;
}

interface UsageResult {
  ok: true;
  usage: CanonicalProviderUsage;
}

interface UsageFailure {
  ok: false;
  code: string;
}

export class GeminiTextProvider implements IModelProvider {
  readonly modelId = "gemini-text";
  readonly modelVersion: string;
  readonly adapterId = GEMINI_INTERACTIONS_ADAPTER_ID;
  readonly adapterVersion = GEMINI_INTERACTIONS_ADAPTER_VERSION;
  readonly operationalState: ProviderOperationalState;
  readonly capabilities: ProviderCapabilities;

  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;
  private readonly projectId: string;
  private readonly providerRegion: string;
  private readonly providerAccountClass: ProviderAccountClass;

  constructor(config: GeminiTextProviderConfig) {
    this.apiKey = optionalNonEmpty(config.apiKey);
    this.timeoutMs = validTimeout(config.timeoutMs);
    this.modelVersion = validBoundedIdentifier(
      config.defaultModelId ?? GEMINI_DEFAULT_MODEL_ID,
      "defaultModelId",
      MAX_MODEL_ID_BYTES,
    );
    this.projectId = validBoundedIdentifier(
      config.projectId,
      "projectId",
      MAX_PROJECT_ID_BYTES,
    );
    this.providerRegion = validBoundedIdentifier(
      config.providerRegion,
      "providerRegion",
      MAX_REGION_BYTES,
    );
    this.providerAccountClass = config.providerAccountClass;
    this.capabilities = {
      supports_vision: false,
      supports_pdf_native: false,
      supports_json_schema: false,
      // The adapter normalizes provider-native call events for future use, but
      // the first binding never sends tool declarations.
      supports_tool_calling: false,
      supports_embeddings: false,
      supports_streaming: true,
      max_context_tokens: 200_000,
      max_output_tokens: 8_192,
      max_input_file_bytes: 0,
      supported_mime_types: ["text/plain", "application/json"],
      supported_regions: [this.providerRegion],
      cost_per_1k_input_tokens: 0,
      cost_per_1k_output_tokens: 0,
    };
    const credentialed = this.apiKey !== undefined;
    this.operationalState = {
      implemented: true,
      credentialed,
      healthy: false,
      eligible: false,
      reason: credentialed ? "readiness_not_checked" : "missing_credential",
    };
  }

  /**
   * Legacy AIRuntime invocations lack the exact reviewed binding/account
   * metadata required by this adapter.
   */
  async invoke(_prompt: ModelPrompt): Promise<ModelResponse> {
    throw new Error(
      "Gemini Interactions requires an authenticated ProviderInvocation.",
    );
  }

  /**
   * Non-generating readiness probe. models.get verifies credential and exact
   * model visibility; it does not attest billing class, DPA, retention, ZDR,
   * region, or Interactions endpoint health.
   */
  async checkReadiness(
    exactModelId: string,
    options: GeminiReadinessOptions = {},
  ): Promise<GeminiReadinessState> {
    const modelId = normaliseModelId(exactModelId);
    if (!modelId) {
      return readinessState("", "invalid_model", false, false);
    }
    const apiKey = resolveCredential(options.credential, this.apiKey);
    if (!apiKey) {
      return readinessState(modelId, "missing_credential", false, false);
    }
    if (options.signal?.aborted) {
      return readinessState(modelId, "cancelled", true, false, "cancelled");
    }

    const requestScope = createRequestScope(options.signal, this.timeoutMs);
    try {
      const client = new GoogleGenAI({ apiKey });
      const metadata = await client.models.get({
        model: modelId,
        config: {
          abortSignal: requestScope.signal,
          httpOptions: {
            timeout: this.timeoutMs,
            retryOptions: { attempts: 1 },
          },
        },
      });
      const actualModel = normaliseReturnedModelId(metadata.name);
      if (actualModel !== modelId) {
        return readinessState(
          modelId,
          "model_unavailable",
          true,
          false,
          "model_unavailable",
        );
      }
      return {
        modelId,
        implemented: true,
        credentialed: true,
        healthy: true,
        eligible: true,
        reason: "ready",
        retryable: false,
      };
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
        return readinessState(modelId, "cancelled", true, false, "cancelled");
      }
      return readinessFromError(modelId, error);
    } finally {
      requestScope.cleanup();
    }
  }

  async *invokeStream(
    invocation: ProviderInvocation,
  ): AsyncIterable<CanonicalStreamEvent> {
    const bindingError = validateBinding(
      invocation.binding,
      this.providerRegion,
      this.providerAccountClass,
    );
    if (bindingError) {
      yield { kind: "failed", error: bindingError };
      return;
    }
    const request = buildInteractionRequest(invocation, this.capabilities);
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

    const requestScope = createRequestScope(
      invocation.signal,
      this.timeoutMs,
    );
    let terminalEmitted = false;
    try {
      const client = new GoogleGenAI({ apiKey });
      const stream = await client.interactions.create(
        request.body,
        {
          timeout: this.timeoutMs,
          maxRetries: 0,
          fetchOptions: { signal: requestScope.signal },
        },
      );

      let eventCount = 0;
      let responseStarted = false;
      let interactionId: string | null = null;
      let actualModelId: string | null = null;
      let outputBytes = 0;
      let sawToolCall = false;
      let terminalStatusHint: string | null = null;
      const stepTypes = new Map<number, string>();
      const pendingTools = new Map<number, PendingToolCall>();

      for await (const nativeEvent of stream) {
        eventCount += 1;
        if (eventCount > MAX_STREAM_EVENTS) {
          terminalEmitted = true;
          yield {
            kind: "failed",
            error: protocolError("stream_event_limit_exceeded"),
          };
          return;
        }
        const nativeValue: unknown = nativeEvent;
        if (!isRecord(nativeValue)) continue;
        const eventType = stringValue(nativeValue["event_type"]);
        if (!eventType) continue;

        if (eventType === "interaction.created") {
          if (responseStarted) {
            terminalEmitted = true;
            yield {
              kind: "failed",
              error: protocolError("duplicate_interaction_created"),
            };
            return;
          }
          const identity = interactionIdentity(
            nativeValue["interaction"],
            invocation.binding,
          );
          if (!identity.ok) {
            terminalEmitted = true;
            yield { kind: "failed", error: identity.error };
            return;
          }
          responseStarted = true;
          interactionId = identity.interactionId;
          actualModelId = identity.actualModelId;
          yield {
            kind: "response_started",
            provider_id: "gemini",
            provider_request_id: interactionId,
            actual_model_id: actualModelId,
          };
          continue;
        }

        if (eventType === "interaction.status_update") {
          const status = stringValue(nativeValue["status"]);
          if (status) terminalStatusHint = status;
          if (status === "cancelled") {
            terminalEmitted = true;
            yield { kind: "cancelled" };
            return;
          }
          continue;
        }

        if (eventType === "step.start") {
          if (!responseStarted) {
            terminalEmitted = true;
            yield {
              kind: "failed",
              error: protocolError("step_before_interaction_created"),
            };
            return;
          }
          const index = nonNegativeInteger(nativeValue["index"]);
          const step = recordValue(nativeValue["step"]);
          const stepType = stringValue(step?.["type"]);
          if (
            index === null
            || !step
            || !stepType
            || index >= MAX_STREAM_STEPS
            || stepTypes.has(index)
          ) {
            terminalEmitted = true;
            yield {
              kind: "failed",
              error: protocolError("invalid_step_start"),
            };
            return;
          }
          stepTypes.set(index, stepType);

          if (stepType === "model_output") {
            if (step["error"] !== undefined) {
              terminalStatusHint = "failed";
            }
            if (!modelOutputIsTextOnly(step)) {
              terminalEmitted = true;
              yield {
                kind: "failed",
                error: protocolError("unsupported_output_modality"),
              };
              return;
            }
            continue;
          }
          if (stepType === "thought") {
            continue;
          }
          if (stepType === "function_call") {
            if (pendingTools.size >= MAX_PENDING_TOOL_CALLS) {
              terminalEmitted = true;
              yield {
                kind: "failed",
                error: protocolError("too_many_tool_calls"),
              };
              return;
            }
            const name = boundedIdentifier(
              step["name"],
              MAX_TOOL_IDENTIFIER_BYTES,
            );
            if (!name) {
              terminalEmitted = true;
              yield {
                kind: "failed",
                error: protocolError("invalid_tool_name"),
              };
              return;
            }
            const nativeCallId = boundedIdentifier(
              step["id"],
              MAX_TOOL_IDENTIFIER_BYTES,
            );
            const atlasCallId = nativeCallId
              ?? generatedAtlasCallId(invocation.trace.callId, index);
            const startArguments = recordValue(step["arguments"]) ?? {};
            pendingTools.set(index, {
              atlasCallId,
              nativeCallId,
              nativeStepIndex: index,
              name,
              arguments: "",
              startArguments,
              complete: false,
            });
            sawToolCall = true;
            yield {
              kind: "tool_call_start",
              call_id: atlasCallId,
              tool_name: name,
            };
            continue;
          }

          // The first adapter sends no tools, files, or multimodal data. A
          // provider-generated server tool step is therefore a protocol error.
          if (isProviderToolStep(stepType)) {
            terminalEmitted = true;
            yield {
              kind: "failed",
              error: protocolError("unexpected_provider_tool"),
            };
            return;
          }
          // Google recommends safely ignoring unknown additive step types. If
          // one is terminally significant, the stream still fails closed when
          // no recognized terminal envelope follows.
          continue;
        }

        if (eventType === "step.delta") {
          const index = nonNegativeInteger(nativeValue["index"]);
          const delta = recordValue(nativeValue["delta"]);
          const deltaType = stringValue(delta?.["type"]);
          if (index === null || !delta || !deltaType) continue;
          const stepType = stepTypes.get(index);

          if (deltaType === "text") {
            if (stepType !== "model_output") continue;
            const text = stringValue(delta["text"]);
            if (text === null || byteLength(text) > MAX_TEXT_DELTA_BYTES) {
              terminalEmitted = true;
              yield {
                kind: "failed",
                error: protocolError("invalid_text_delta"),
              };
              return;
            }
            outputBytes += byteLength(text);
            if (outputBytes > MAX_OUTPUT_BYTES) {
              terminalEmitted = true;
              yield {
                kind: "failed",
                error: protocolError("output_limit_exceeded"),
              };
              return;
            }
            if (text) yield { kind: "text_delta", text };
            continue;
          }

          if (deltaType === "arguments_delta") {
            const pending = pendingTools.get(index);
            const fragment = stringValue(delta["arguments"]);
            if (!pending || fragment === null || pending.complete) {
              terminalEmitted = true;
              yield {
                kind: "failed",
                error: protocolError("invalid_tool_arguments_delta"),
              };
              return;
            }
            pending.arguments += fragment;
            if (byteLength(pending.arguments) > MAX_TOOL_ARGUMENT_BYTES) {
              terminalEmitted = true;
              yield {
                kind: "failed",
                error: protocolError("tool_arguments_too_large"),
              };
              return;
            }
            if (fragment) {
              yield {
                kind: "tool_call_input_delta",
                call_id: pending.atlasCallId,
                json_fragment: fragment,
              };
            }
            continue;
          }

          if (isUnsupportedModalityDelta(deltaType)) {
            terminalEmitted = true;
            yield {
              kind: "failed",
              error: protocolError("unsupported_output_modality"),
            };
            return;
          }
          // Thought summaries/signatures, text annotations and future additive
          // metadata remain provider-private in the text-only adapter.
          continue;
        }

        if (eventType === "step.stop") {
          const index = nonNegativeInteger(nativeValue["index"]);
          if (index === null || !stepTypes.has(index)) continue;
          const pending = pendingTools.get(index);
          if (!pending) continue;
          const parsedArguments = completeToolArguments(pending);
          if (!parsedArguments.ok) {
            terminalEmitted = true;
            yield { kind: "failed", error: parsedArguments.error };
            return;
          }
          pending.complete = true;
          yield {
            kind: "tool_call_complete",
            call_id: pending.atlasCallId,
            input: parsedArguments.value,
          };
          continue;
        }

        if (eventType === "error") {
          terminalEmitted = true;
          const errorRecord = recordValue(nativeValue["error"]);
          const code = safeProviderCode(errorRecord?.["code"]);
          yield {
            kind: "failed",
            error: eventProviderError(
              code,
              nativeValue["metadata"],
            ),
          };
          return;
        }

        if (eventType === "interaction.completed") {
          if (!responseStarted || !interactionId || !actualModelId) {
            terminalEmitted = true;
            yield {
              kind: "failed",
              error: protocolError("completion_before_interaction_created"),
            };
            return;
          }
          const interaction = recordValue(nativeValue["interaction"]);
          const terminalIdentityError = validateTerminalIdentity(
            interaction,
            interactionId,
            actualModelId,
            invocation.binding,
          );
          if (terminalIdentityError) {
            terminalEmitted = true;
            yield { kind: "failed", error: terminalIdentityError };
            return;
          }
          const serviceTier = stringValue(interaction?.["service_tier"]);
          if (
            serviceTier
            && serviceTier !== GEMINI_STANDARD_SERVICE_TIER
          ) {
            terminalEmitted = true;
            yield {
              kind: "failed",
              error: protocolError("unexpected_service_tier"),
            };
            return;
          }
          const usageResult = disjointUsage(interaction?.["usage"]);
          if (!usageResult.ok) {
            terminalEmitted = true;
            yield {
              kind: "failed",
              error: protocolError(usageResult.code),
            };
            return;
          }
          yield {
            kind: "usage",
            mode: "snapshot",
            final: true,
            usage: usageResult.usage,
          };

          const status =
            stringValue(interaction?.["status"])
            ?? terminalStatusHint;
          if (status === "cancelled") {
            terminalEmitted = true;
            yield { kind: "cancelled" };
            return;
          }
          if (status === "budget_exceeded") {
            terminalEmitted = true;
            yield {
              kind: "failed",
              error: providerError(
                "quota_exhausted",
                "provider_budget_exceeded",
                false,
              ),
            };
            return;
          }
          if (status === "failed") {
            terminalEmitted = true;
            yield {
              kind: "failed",
              error: providerError(
                "upstream_error",
                "interaction_failed",
                true,
              ),
            };
            return;
          }
          if (status === "incomplete") {
            terminalEmitted = true;
            yield {
              kind: "failed",
              error: providerError(
                "stream_incomplete",
                "interaction_incomplete",
                true,
              ),
            };
            return;
          }
          if (status === "requires_action") {
            if (
              !sawToolCall
              || [...pendingTools.values()].some((tool) => !tool.complete)
            ) {
              terminalEmitted = true;
              yield {
                kind: "failed",
                error: protocolError("invalid_requires_action"),
              };
              return;
            }
            terminalEmitted = true;
            yield { kind: "completed", reason: "tool_call" };
            return;
          }
          if (status !== "completed") {
            terminalEmitted = true;
            yield {
              kind: "failed",
              error: protocolError("invalid_terminal_status"),
            };
            return;
          }
          if (terminalStatusHint === "failed") {
            terminalEmitted = true;
            yield {
              kind: "failed",
              error: providerError(
                "upstream_error",
                "model_output_failed",
                true,
              ),
            };
            return;
          }
          terminalEmitted = true;
          yield {
            kind: "completed",
            reason: sawToolCall ? "tool_call" : "stop",
          };
          return;
        }

        // Unknown additive events are ignored as recommended by the provider.
        // A stream without a recognized terminal still fails closed below.
      }

      terminalEmitted = true;
      yield {
        kind: "failed",
        error: providerError(
          "stream_incomplete",
          "stream_ended_without_terminal",
          true,
        ),
      };
    } catch (error) {
      terminalEmitted = true;
      if (requestScope.didTimeout()) {
        yield {
          kind: "failed",
          error: providerError("timeout", "provider_timeout", true),
        };
        return;
      }
      if (invocation.signal?.aborted || isAbortError(error)) {
        yield { kind: "cancelled" };
        return;
      }
      yield { kind: "failed", error: sdkProviderError(error) };
    } finally {
      if (!terminalEmitted && invocation.signal?.aborted) {
        // The generator consumer may close early. The request-scope cleanup
        // still aborts SDK fetch work without yielding another terminal.
      }
      requestScope.cleanup();
    }
  }
}

function validateBinding(
  binding: AtlasModelBinding,
  providerRegion: string,
  providerAccountClass: ProviderAccountClass,
): CanonicalProviderError | null {
  if (
    binding.providerId !== "gemini"
    || binding.adapterId !== GEMINI_INTERACTIONS_ADAPTER_ID
    || binding.adapterVersion !== GEMINI_INTERACTIONS_ADAPTER_VERSION
    || !binding.capabilities.streaming
    || binding.capabilities.vision
    || binding.capabilities.tools
    || binding.routingPolicyId !== "no-fallback-v1"
  ) {
    return providerError(
      "invalid_request",
      "binding_not_supported",
      false,
    );
  }
  if (binding.providerRegion !== providerRegion) {
    return providerError(
      "permission",
      "provider_region_mismatch",
      false,
    );
  }
  if (binding.providerAccountClass !== providerAccountClass) {
    return providerError(
      "permission",
      "provider_account_class_mismatch",
      false,
    );
  }
  const requiredCredentialPolicy = providerAccountClass === "developer_free"
    ? "local"
    : providerAccountClass === "platform_paid"
      ? "platform"
      : null;
  if (
    requiredCredentialPolicy === null
    || binding.credentialPolicy !== requiredCredentialPolicy
  ) {
    return providerError(
      "permission",
      "binding_credential_policy_mismatch",
      false,
    );
  }
  if (
    providerAccountClass === "developer_free"
    && !binding.allowedDataClasses.every((dataClass) => (
      dataClass === "synthetic"
    ))
  ) {
    return providerError(
      "permission",
      "free_account_data_policy_violation",
      false,
    );
  }
  return null;
}

function buildInteractionRequest(
  invocation: ProviderInvocation,
  capabilities: ProviderCapabilities,
):
  | { ok: true; body: GeminiInteractionRequest }
  | { ok: false; error: CanonicalProviderError } {
  const binding = invocation.binding;
  const modelId = normaliseModelId(binding.upstreamModelId);
  if (
    !modelId
    || binding.capabilities.maxContextTokens > capabilities.max_context_tokens
    || binding.capabilities.maxOutputTokens > capabilities.max_output_tokens
  ) {
    return {
      ok: false,
      error: providerError(
        "invalid_request",
        "invalid_model_binding",
        false,
      ),
    };
  }
  if (
    !Number.isInteger(invocation.prompt.max_tokens)
    || invocation.prompt.max_tokens < 1
    || invocation.prompt.max_tokens > binding.capabilities.maxOutputTokens
  ) {
    return {
      ok: false,
      error: providerError(
        "invalid_request",
        "invalid_max_output_tokens",
        false,
      ),
    };
  }
  if (
    invocation.prompt.messages.length < 1
    || invocation.prompt.messages.length > MAX_INPUT_MESSAGES
    || invocation.prompt.messages.at(-1)?.role !== "user"
  ) {
    return {
      ok: false,
      error: providerError(
        "invalid_request",
        "invalid_bounded_history",
        false,
      ),
    };
  }

  let totalBytes = 0;
  const input: GeminiInputStep[] = [];
  for (const message of invocation.prompt.messages) {
    const text = textOnlyContent(message.content);
    if (
      text === null
      || text.length === 0
      || byteLength(text) > MAX_INPUT_MESSAGE_BYTES
    ) {
      return {
        ok: false,
        error: providerError(
          "invalid_request",
          "unsupported_or_invalid_input",
          false,
        ),
      };
    }
    totalBytes += byteLength(text);
    input.push({
      type: message.role === "assistant" ? "model_output" : "user_input",
      content: [{ type: "text", text }],
    });
  }
  if (totalBytes > MAX_INPUT_BYTES) {
    return {
      ok: false,
      error: providerError("invalid_request", "input_too_large", false),
    };
  }

  const systemInstruction = invocation.prompt.system === undefined
    ? undefined
    : textOnlyContent(invocation.prompt.system);
  if (
    systemInstruction === null
    || (
      systemInstruction !== undefined
      && byteLength(systemInstruction) > MAX_SYSTEM_BYTES
    )
  ) {
    return {
      ok: false,
      error: providerError(
        "invalid_request",
        "unsupported_or_invalid_system_instruction",
        false,
      ),
    };
  }

  const body: GeminiInteractionRequest = {
    model: modelId,
    input,
    stream: true,
    store: false,
    service_tier: GEMINI_STANDARD_SERVICE_TIER,
    // Gemini 3.6 deprecates temperature/top_p/top_k and does not support
    // candidate_count. Do not inherit cross-provider generation defaults.
    generation_config: {
      max_output_tokens: invocation.prompt.max_tokens,
      thinking_level: "medium",
      thinking_summaries: "none",
    },
  };
  if (systemInstruction) body.system_instruction = systemInstruction;
  if (invocation.prompt.response_format) {
    return {
      ok: false,
      error: providerError(
        "invalid_request",
        "structured_output_not_enabled",
        false,
      ),
    };
  }
  return { ok: true, body };
}

function interactionIdentity(
  value: unknown,
  binding: AtlasModelBinding,
):
  | { ok: true; interactionId: string; actualModelId: string }
  | { ok: false; error: CanonicalProviderError } {
  const interaction = recordValue(value);
  const interactionId = boundedIdentifier(
    interaction?.["id"],
    MAX_PROVIDER_REQUEST_ID_BYTES,
  );
  const actualModelId = normaliseReturnedModelId(interaction?.["model"]);
  if (!interactionId || !actualModelId) {
    return {
      ok: false,
      error: protocolError("invalid_interaction_identity"),
    };
  }
  if (!modelMatchesBinding(actualModelId, binding)) {
    return {
      ok: false,
      error: protocolError("actual_model_mismatch"),
    };
  }
  return { ok: true, interactionId, actualModelId };
}

function validateTerminalIdentity(
  interaction: Record<string, unknown> | null,
  interactionId: string,
  actualModelId: string,
  binding: AtlasModelBinding,
): CanonicalProviderError | null {
  if (!interaction) return protocolError("missing_terminal_interaction");
  const terminalId = boundedIdentifier(
    interaction["id"],
    MAX_PROVIDER_REQUEST_ID_BYTES,
  );
  const terminalModel = normaliseReturnedModelId(interaction["model"]);
  if (terminalId !== interactionId) {
    return protocolError("interaction_id_mismatch");
  }
  if (
    !terminalModel
    || terminalModel !== actualModelId
    || !modelMatchesBinding(terminalModel, binding)
  ) {
    return protocolError("actual_model_mismatch");
  }
  return null;
}

function modelMatchesBinding(
  actualModelId: string,
  binding: AtlasModelBinding,
): boolean {
  return actualModelId === binding.upstreamModelId
    || (binding.allowedUpstreamModelAliases ?? []).includes(actualModelId);
}

function disjointUsage(value: unknown): UsageResult | UsageFailure {
  const usage = recordValue(value);
  if (!usage) return { ok: false, code: "missing_final_usage" };

  const totalInput = optionalNonNegativeInteger(
    usage["total_input_tokens"],
    0,
  );
  const cached = optionalNonNegativeInteger(
    usage["total_cached_tokens"],
    0,
  );
  const output = optionalNonNegativeInteger(
    usage["total_output_tokens"],
    0,
  );
  const thought = optionalNonNegativeInteger(
    usage["total_thought_tokens"],
    0,
  );
  const toolUse = optionalNonNegativeInteger(
    usage["total_tool_use_tokens"],
    0,
  );
  const total = optionalNonNegativeInteger(usage["total_tokens"], null);
  if (
    totalInput === null
    || cached === null
    || output === null
    || thought === null
    || toolUse === null
    || cached > totalInput
  ) {
    return { ok: false, code: "invalid_final_usage" };
  }
  // Tools are not sent by the initial binding. A non-zero native tool-use
  // bucket therefore indicates an unsupported billing/usage path.
  if (toolUse !== 0) {
    return { ok: false, code: "unexpected_tool_usage" };
  }
  const knownTotal = totalInput + output + thought;
  if (total !== null && total < knownTotal) {
    return { ok: false, code: "inconsistent_total_usage" };
  }
  return {
    ok: true,
    usage: {
      input_tokens: totalInput - cached,
      output_tokens: output,
      cache_read_tokens: cached,
      cache_write_tokens: 0,
      reasoning_tokens: thought,
    },
  };
}

function completeToolArguments(
  pending: PendingToolCall,
):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: CanonicalProviderError } {
  if (pending.complete) {
    return { ok: false, error: protocolError("duplicate_tool_stop") };
  }
  if (!pending.arguments) return { ok: true, value: pending.startArguments };
  try {
    const parsed: unknown = JSON.parse(pending.arguments);
    if (!isRecord(parsed)) {
      return {
        ok: false,
        error: protocolError("tool_arguments_not_object"),
      };
    }
    return { ok: true, value: parsed };
  } catch {
    return {
      ok: false,
      error: protocolError("invalid_tool_arguments_json"),
    };
  }
}

function modelOutputIsTextOnly(step: Record<string, unknown>): boolean {
  const content = step["content"];
  if (content === undefined) return true;
  if (!Array.isArray(content)) return false;
  return content.every((part) => (
    isRecord(part) && part["type"] === "text"
  ));
}

function sdkProviderError(error: unknown): CanonicalProviderError {
  const status = apiErrorStatus(error);
  if (status !== null) {
    return httpProviderError(status, apiErrorMessage(error));
  }
  return providerError("upstream_error", "provider_unavailable", true);
}

function eventProviderError(
  code: string | null,
  metadata: unknown,
): CanonicalProviderError {
  // Validate optional error usage even though the current canonical failure
  // event cannot carry it. This prevents malformed counters entering traces.
  const totalUsage = recordValue(metadata)?.["total_usage"];
  if (totalUsage !== undefined && !disjointUsage(totalUsage).ok) {
    return protocolError("invalid_error_usage");
  }
  const normalized = code?.toLowerCase() ?? "";
  if (
    normalized.includes("resource_exhausted")
    || normalized.includes("quota")
  ) {
    return providerError(
      "quota_exhausted",
      "provider_quota_exhausted",
      true,
    );
  }
  if (normalized.includes("rate")) {
    return providerError("rate_limited", "provider_rate_limited", true);
  }
  if (normalized.includes("unauth")) {
    return providerError(
      "authentication",
      "provider_authentication_failed",
      false,
    );
  }
  if (normalized.includes("permission")) {
    return providerError(
      "permission",
      "provider_permission_denied",
      false,
    );
  }
  return providerError("upstream_error", "provider_stream_error", true);
}

function httpProviderError(
  status: number,
  internalMessage: string | null,
): CanonicalProviderError {
  if (status === 400 || status === 422) {
    return providerError(
      "invalid_request",
      "provider_invalid_request",
      false,
    );
  }
  if (status === 401) {
    return providerError(
      "authentication",
      "provider_authentication_failed",
      false,
    );
  }
  if (status === 403) {
    return providerError(
      "permission",
      "provider_permission_denied",
      false,
    );
  }
  if (status === 404) {
    return providerError(
      "model_unavailable",
      "provider_model_unavailable",
      false,
    );
  }
  if (status === 408 || status === 504) {
    return providerError("timeout", "provider_timeout", true);
  }
  if (status === 429) {
    const isQuota = internalMessage?.toLowerCase().includes("quota")
      || internalMessage?.toLowerCase().includes("resource_exhausted");
    return providerError(
      isQuota ? "quota_exhausted" : "rate_limited",
      isQuota ? "provider_quota_exhausted" : "provider_rate_limited",
      true,
    );
  }
  if (status === 409 || status >= 500) {
    return providerError("overloaded", "provider_overloaded", true);
  }
  return providerError("upstream_error", "provider_error", status >= 500);
}

function readinessFromError(
  modelId: string,
  error: unknown,
): GeminiReadinessState {
  const status = apiErrorStatus(error);
  if (status === null) {
    return readinessState(
      modelId,
      "provider_unavailable",
      true,
      true,
      "upstream_error",
    );
  }
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
    const message = apiErrorMessage(error);
    const quota = message?.toLowerCase().includes("quota")
      || message?.toLowerCase().includes("resource_exhausted");
    return readinessState(
      modelId,
      quota ? "quota_exhausted" : "rate_limited",
      true,
      true,
      quota ? "quota_exhausted" : "rate_limited",
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
      "upstream_error",
      status,
    );
  }
  return readinessState(
    modelId,
    "provider_error",
    true,
    false,
    "upstream_error",
    status,
  );
}

function readinessState(
  modelId: string,
  reason: GeminiReadinessReason,
  credentialed: boolean,
  retryable: boolean,
  errorClass?: CanonicalProviderErrorClass,
  httpStatus?: number,
): GeminiReadinessState {
  return {
    modelId,
    implemented: true,
    credentialed,
    healthy: false,
    eligible: false,
    reason,
    retryable,
    ...(errorClass ? { errorClass } : {}),
    ...(httpStatus === undefined ? {} : { httpStatus }),
  };
}

function providerError(
  errorClass: CanonicalProviderErrorClass,
  code: string,
  retryable: boolean,
): CanonicalProviderError {
  return {
    error_class: errorClass,
    code,
    safe_message: safeProviderMessage(errorClass),
    retryable,
  };
}

function protocolError(code: string): CanonicalProviderError {
  return providerError("protocol_error", code, false);
}

function safeProviderMessage(errorClass: CanonicalProviderErrorClass): string {
  if (errorClass === "safety_block") {
    return "Atlas cannot help with that request.";
  }
  if (
    errorClass === "authentication"
    || errorClass === "permission"
    || errorClass === "invalid_request"
    || errorClass === "model_unavailable"
  ) {
    return "Atlas provider configuration is unavailable.";
  }
  if (
    errorClass === "rate_limited"
    || errorClass === "quota_exhausted"
    || errorClass === "overloaded"
    || errorClass === "timeout"
  ) {
    return "Atlas is temporarily unavailable. Please try again.";
  }
  if (errorClass === "cancelled") return "Atlas request was cancelled.";
  return "Atlas could not complete this response.";
}

function createRequestScope(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number,
): RequestScope {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) abortFromExternal();
    else externalSignal.addEventListener("abort", abortFromExternal, {
      once: true,
    });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort("provider_timeout");
  }, timeoutMs);
  timer.unref?.();
  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", abortFromExternal);
      if (!controller.signal.aborted) controller.abort("request_scope_closed");
    },
  };
}

function textOnlyContent(
  content: string | ContentBlock[],
): string | null {
  if (typeof content === "string") return content;
  let text = "";
  for (const block of content) {
    if (block.type !== "text") return null;
    text += block.text;
  }
  return text;
}

function normaliseModelId(value: unknown): string | null {
  const normalized = stringValue(value)?.trim();
  if (
    !normalized
    || byteLength(normalized) > MAX_MODEL_ID_BYTES
    || /[\u0000-\u001f\u007f]/u.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function normaliseReturnedModelId(value: unknown): string | null {
  const normalized = normaliseModelId(value);
  if (!normalized) return null;
  return normalized.startsWith("models/")
    ? normalized.slice("models/".length)
    : normalized;
}

function validBoundedIdentifier(
  value: string,
  field: string,
  maxBytes: number,
): string {
  const normalized = value?.trim();
  if (
    !normalized
    || byteLength(normalized) > maxBytes
    || /[\u0000-\u001f\u007f]/u.test(normalized)
  ) {
    throw new Error(`GeminiTextProvider ${field} is invalid.`);
  }
  return normalized;
}

function boundedIdentifier(
  value: unknown,
  maxBytes: number,
): string | null {
  const normalized = stringValue(value)?.trim();
  if (
    !normalized
    || byteLength(normalized) > maxBytes
    || /[\u0000-\u001f\u007f]/u.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function validTimeout(value: number): number {
  if (
    !Number.isInteger(value)
    || value < 1
    || value > MAX_TIMEOUT_MS
  ) {
    throw new Error(
      `GeminiTextProvider timeoutMs must be an integer between 1 and ${MAX_TIMEOUT_MS}.`,
    );
  }
  return value;
}

function resolveCredential(
  lease: { secret: string } | undefined,
  fallback: string | undefined,
): string | undefined {
  return optionalNonEmpty(lease?.secret) ?? fallback;
}

function optionalNonEmpty(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function isProviderToolStep(stepType: string): boolean {
  return stepType.endsWith("_call")
    || stepType.endsWith("_result")
    || stepType === "function_result";
}

function isUnsupportedModalityDelta(deltaType: string): boolean {
  return deltaType === "image"
    || deltaType === "audio"
    || deltaType === "video"
    || deltaType === "document";
}

function generatedAtlasCallId(traceCallId: string, index: number): string {
  const safeTrace = traceCallId
    .replace(/[^a-zA-Z0-9_-]/gu, "")
    .slice(0, 80);
  return `gemini-${safeTrace || "call"}-${index}`;
}

function apiErrorStatus(error: unknown): number | null {
  if (error instanceof ApiError && Number.isInteger(error.status)) {
    return error.status;
  }
  if (isRecord(error) && Number.isInteger(error["status"])) {
    return error["status"] as number;
  }
  return null;
}

function apiErrorMessage(error: unknown): string | null {
  if (error instanceof Error) return error.message;
  if (isRecord(error)) return stringValue(error["message"]);
  return null;
}

function safeProviderCode(value: unknown): string | null {
  const code = stringValue(value)?.trim();
  if (
    !code
    || code.length > 100
    || !/^[A-Za-z0-9_.:/-]+$/u.test(code)
  ) {
    return null;
  }
  return code;
}

function optionalNonNegativeInteger(
  value: unknown,
  fallback: number | null,
): number | null {
  if (value === undefined) return fallback;
  return nonNegativeInteger(value);
}

function nonNegativeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0
    ? Number(value)
    : null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
    || (
      error instanceof Error
      && (error.name === "AbortError" || error.name === "TimeoutError")
    );
}
