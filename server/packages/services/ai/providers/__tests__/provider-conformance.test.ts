import { afterEach, vi } from "vitest";
import { ClaudeTextProvider } from "../claude-text.provider.js";
import { FakeModelProvider } from "../fake-model.provider.js";
import {
  OPENAI_RESPONSES_ADAPTER_ID,
  OpenAiTextProvider,
} from "../openai-text.provider.js";
import {
  GEMINI_INTERACTIONS_ADAPTER_ID,
  GeminiTextProvider,
} from "../gemini-text.provider.js";
import type {
  AtlasModelBinding,
  ProviderInvocation,
} from "../i-model-provider.js";
import {
  defineProviderConformanceSuite,
  type ProviderConformanceHarness,
  type ProviderConformanceScenario,
} from "./provider-conformance.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function binding(input: {
  providerId: string;
  adapterId: string;
  upstreamModelId: string;
}): AtlasModelBinding {
  return {
    bindingId: `binding-${input.providerId}`,
    publicModelId: "atlas-fast",
    providerId: input.providerId,
    upstreamModelId: input.upstreamModelId,
    adapterId: input.adapterId,
    adapterVersion:
      input.providerId === "anthropic" || input.providerId === "openai"
        ? "2"
        : "1",
    displayName: "Atlas Fast",
    displayTier: "fast",
    bindingExposure: "product",
    status: "available",
    capabilities: {
      streaming: true,
      tools: false,
      vision: false,
      maxContextTokens: 16_000,
      maxOutputTokens: 2_000,
    },
    credentialPolicy: "platform",
    dataHandlingProfileId: "test",
    routingPolicyId: "no-fallback",
    allowedDataClasses: ["test"],
    allowedRegions: ["test"],
    providerRegion: "test",
    providerAccountClass: "test",
    priceVersion: "test",
    inputPricePerMtokUsd: null,
    cacheReadPricePerMtokUsd: null,
    cacheWritePricePerMtokUsd: null,
    outputPricePerMtokUsd: null,
    reasoningPricePerMtokUsd: null,
  };
}

function invocation(
  modelBinding: AtlasModelBinding,
  signal?: AbortSignal,
): ProviderInvocation {
  return {
    binding: modelBinding,
    prompt: {
      messages: [{ role: "user", content: "test" }],
      max_tokens: 100,
    },
    signal,
    trace: {
      runId: "run",
      callId: "call",
      tenantId: "tenant",
      principalHash: "hash",
      safetyIdentifier: "a".repeat(64),
      promptVersion: "test",
    },
  };
}

defineProviderConformanceSuite("fake", (scenario) => {
  const controller = new AbortController();
  const stepsByScenario: Record<
    ProviderConformanceScenario,
    readonly import("../fake-model.provider.js").FakeProviderStep[]
  > = {
    normal: [
      { kind: "text_delta", text: "ok" },
      {
        kind: "usage",
        mode: "snapshot",
        final: true,
        usage: { input_tokens: 1, output_tokens: 1 },
      },
      { kind: "completed", reason: "stop" },
    ],
    truncated: [{ kind: "text_delta", text: "partial" }],
    failure: [{
      kind: "failed",
      error: {
        error_class: "upstream_error",
        code: "provider_failed",
        safe_message: "Atlas could not complete this response.",
        retryable: true,
      },
    }],
    cancellation: [{ kind: "wait_for_abort" }],
  };
  const provider = new FakeModelProvider({ steps: stepsByScenario[scenario] });
  const modelBinding = binding({
    providerId: "fake",
    adapterId: "fake-text",
    upstreamModelId: "fake-exact-v1",
  });
  return {
    provider,
    invocation: invocation(modelBinding, controller.signal),
    requestedUpstreamModelIds: () => (
      provider.invocations.map((item) => item.binding.upstreamModelId)
    ),
    abort: () => controller.abort(),
  };
}, () => {
  const provider = new FakeModelProvider({
    steps: [
      {
        kind: "tool_call_start",
        call_id: "call_conformance",
        tool_name: "catalog_help",
      },
      {
        kind: "tool_call_input_delta",
        call_id: "call_conformance",
        json_fragment: "{\"query\":",
      },
      {
        kind: "tool_call_input_delta",
        call_id: "call_conformance",
        json_fragment: "\"invoices\"}",
      },
      {
        kind: "tool_call_complete",
        call_id: "call_conformance",
        input: { query: "invoices" },
      },
      {
        kind: "usage",
        mode: "snapshot",
        final: true,
        usage: { input_tokens: 1, output_tokens: 1 },
      },
      { kind: "completed", reason: "tool_call" },
    ],
  });
  const modelBinding = binding({
    providerId: "fake",
    adapterId: "fake-text",
    upstreamModelId: "fake-exact-v1",
  });
  return {
    provider,
    invocation: invocation(modelBinding),
    requestedUpstreamModelIds: () => (
      provider.invocations.map((item) => item.binding.upstreamModelId)
    ),
  };
});

defineProviderConformanceSuite("anthropic", createAnthropicHarness);
defineProviderConformanceSuite("openai", createOpenAiHarness);
defineProviderConformanceSuite("gemini", createGeminiHarness);

function createAnthropicHarness(
  scenario: ProviderConformanceScenario,
): ProviderConformanceHarness {
  const controller = new AbortController();
  const requestedModels: string[] = [];
  const start = {
    type: "message_start",
    message: {
      id: "msg_conformance",
      model: "claude-exact-v1",
      usage: { input_tokens: 1, output_tokens: 0 },
    },
  };

  vi.stubGlobal("fetch", vi.fn().mockImplementation(
    async (_url: string, init: RequestInit) => {
      const parsed = JSON.parse(String(init.body)) as { model: string };
      requestedModels.push(parsed.model);
      if (scenario === "failure") {
        return new Response("SECRET_PROVIDER_DETAIL", { status: 500 });
      }
      if (scenario === "cancellation") {
        const stream = new ReadableStream<Uint8Array>({
          start(streamController) {
            streamController.enqueue(encodeSse([start]));
            init.signal?.addEventListener("abort", () => {
              streamController.error(new DOMException("aborted", "AbortError"));
            }, { once: true });
          },
        });
        return eventStreamResponse(stream);
      }
      const frames = scenario === "normal"
        ? [
            start,
            {
              type: "content_block_delta",
              index: 0,
              delta: { type: "text_delta", text: "ok" },
            },
            {
              type: "message_delta",
              delta: { stop_reason: "end_turn" },
              usage: { output_tokens: 1 },
            },
            { type: "message_stop" },
          ]
        : [start];
      return eventStreamResponse(new ReadableStream<Uint8Array>({
        start(streamController) {
          streamController.enqueue(encodeSse(frames));
          streamController.close();
        },
      }));
    },
  ));

  const provider = new ClaudeTextProvider("test-key");
  const modelBinding = binding({
    providerId: "anthropic",
    adapterId: "anthropic-messages-text",
    upstreamModelId: "claude-exact-v1",
  });
  return {
    provider,
    invocation: invocation(modelBinding, controller.signal),
    requestedUpstreamModelIds: () => requestedModels,
    abort: () => controller.abort(),
  };
}

function createOpenAiHarness(
  scenario: ProviderConformanceScenario,
): ProviderConformanceHarness {
  const controller = new AbortController();
  const requestedModels: string[] = [];
  const start = {
    type: "response.created",
    response: {
      id: "resp_conformance",
      model: "openai-exact-v1",
    },
  };

  vi.stubGlobal("fetch", vi.fn().mockImplementation(
    async (_url: string, init: RequestInit) => {
      const parsed = JSON.parse(String(init.body)) as { model: string };
      requestedModels.push(parsed.model);
      if (scenario === "failure") {
        return new Response("SECRET_PROVIDER_DETAIL", { status: 500 });
      }
      if (scenario === "cancellation") {
        const stream = new ReadableStream<Uint8Array>({
          start(streamController) {
            streamController.enqueue(encodeSse([start]));
            init.signal?.addEventListener("abort", () => {
              streamController.error(new DOMException("aborted", "AbortError"));
            }, { once: true });
          },
        });
        return eventStreamResponse(stream);
      }
      const frames = scenario === "normal"
        ? [
            start,
            {
              type: "response.output_text.delta",
              item_id: "msg_conformance",
              output_index: 0,
              content_index: 0,
              delta: "ok",
            },
            {
              type: "response.completed",
              response: {
                id: "resp_conformance",
                model: "openai-exact-v1",
                usage: {
                  input_tokens: 1,
                  input_tokens_details: {
                    cached_tokens: 0,
                    cache_write_tokens: 0,
                  },
                  output_tokens: 1,
                  output_tokens_details: { reasoning_tokens: 0 },
                },
              },
            },
          ]
        : [start];
      return eventStreamResponse(new ReadableStream<Uint8Array>({
        start(streamController) {
          streamController.enqueue(encodeSse(frames));
          streamController.close();
        },
      }));
    },
  ));

  const provider = new OpenAiTextProvider({
    apiKey: "test-key",
    timeoutMs: 10_000,
    defaultModelId: "openai-exact-v1",
  });
  const modelBinding = binding({
    providerId: "openai",
    adapterId: OPENAI_RESPONSES_ADAPTER_ID,
    upstreamModelId: "openai-exact-v1",
  });
  return {
    provider,
    invocation: invocation(modelBinding, controller.signal),
    requestedUpstreamModelIds: () => requestedModels,
    abort: () => controller.abort(),
  };
}

function createGeminiHarness(
  scenario: ProviderConformanceScenario,
): ProviderConformanceHarness {
  const controller = new AbortController();
  const requestedModels: string[] = [];
  const start = {
    event_type: "interaction.created",
    interaction: {
      id: "int_conformance",
      model: "gemini-exact-v1",
      status: "in_progress",
      service_tier: "standard",
    },
  };

  vi.stubGlobal("fetch", vi.fn().mockImplementation(
    async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request
        ? input
        : new Request(input, init);
      const parsed = await request.clone().json() as { model: string };
      requestedModels.push(parsed.model);
      if (scenario === "failure") {
        return new Response(JSON.stringify({
          error: {
            code: 500,
            status: "INTERNAL",
            message: "SECRET_PROVIDER_DETAIL",
          },
        }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (scenario === "cancellation") {
        const stream = new ReadableStream<Uint8Array>({
          start(streamController) {
            streamController.enqueue(encodeGeminiSse([start], false));
            controller.signal.addEventListener("abort", () => {
              streamController.error(new DOMException("aborted", "AbortError"));
            }, { once: true });
          },
        });
        return eventStreamResponse(stream);
      }
      const frames = scenario === "normal"
        ? [
            start,
            {
              event_type: "step.start",
              index: 0,
              step: { type: "model_output", content: [] },
            },
            {
              event_type: "step.delta",
              index: 0,
              delta: { type: "text", text: "ok" },
            },
            {
              event_type: "step.stop",
              index: 0,
            },
            {
              event_type: "interaction.completed",
              interaction: {
                id: "int_conformance",
                model: "gemini-exact-v1",
                status: "completed",
                service_tier: "standard",
                usage: {
                  total_input_tokens: 1,
                  total_cached_tokens: 0,
                  total_output_tokens: 1,
                  total_thought_tokens: 0,
                  total_tool_use_tokens: 0,
                  total_tokens: 2,
                },
              },
            },
          ]
        : [start];
      return eventStreamResponse(new ReadableStream<Uint8Array>({
        start(streamController) {
          streamController.enqueue(encodeGeminiSse(frames, true));
          streamController.close();
        },
      }));
    },
  ));

  const provider = new GeminiTextProvider({
    apiKey: "test-key",
    timeoutMs: 10_000,
    defaultModelId: "gemini-exact-v1",
    projectId: "fixture-project",
    providerRegion: "global",
    providerAccountClass: "developer_free",
  });
  const modelBinding: AtlasModelBinding = {
    ...binding({
      providerId: "gemini",
      adapterId: GEMINI_INTERACTIONS_ADAPTER_ID,
      upstreamModelId: "gemini-exact-v1",
    }),
    bindingExposure: "internal_evaluation",
    credentialPolicy: "local",
    dataHandlingProfileId:
      "gemini-developer-free-interactions-store-false-v1",
    routingPolicyId: "no-fallback-v1",
    allowedDataClasses: ["synthetic"],
    allowedRegions: ["global"],
    providerRegion: "global",
    providerAccountClass: "developer_free",
  };
  return {
    provider,
    invocation: invocation(modelBinding, controller.signal),
    requestedUpstreamModelIds: () => requestedModels,
    abort: () => controller.abort(),
  };
}

function encodeSse(frames: readonly Record<string, unknown>[]): Uint8Array {
  return new TextEncoder().encode(frames.map((frame) => (
    `event: ${String(frame["type"])}\ndata: ${JSON.stringify(frame)}\n\n`
  )).join(""));
}

function encodeGeminiSse(
  frames: readonly Record<string, unknown>[],
  done: boolean,
): Uint8Array {
  const events = frames.map((frame) => (
    `event: ${String(frame["event_type"])}\n`
    + `data: ${JSON.stringify(frame)}\n\n`
  )).join("");
  return new TextEncoder().encode(
    done ? `${events}event: done\ndata: [DONE]\n\n` : events,
  );
}

function eventStreamResponse(
  stream: ReadableStream<Uint8Array>,
): Response {
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}
