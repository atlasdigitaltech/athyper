import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLAUDE_TEXT_ADAPTER_ID,
  CLAUDE_TEXT_ADAPTER_VERSION,
} from "../../agent/model-catalog.js";
import { ClaudeTextProvider } from "../claude-text.provider.js";
import type {
  AtlasModelBinding,
  CanonicalStreamEvent,
  ProviderInvocation,
} from "../i-model-provider.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function binding(
  upstreamModelId = "claude-exact-model",
  tools = false,
): AtlasModelBinding {
  return {
    bindingId: "atlas-fast-anthropic-test",
    publicModelId: "atlas-fast",
    providerId: "anthropic",
    upstreamModelId,
    adapterId: CLAUDE_TEXT_ADAPTER_ID,
    adapterVersion: CLAUDE_TEXT_ADAPTER_VERSION,
    displayName: "Atlas Fast",
    displayTier: "fast",
    bindingExposure: "product",
    status: "available",
    capabilities: {
      streaming: true,
      tools,
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

function invocation(input: {
  upstreamModelId?: string;
  signal?: AbortSignal;
  credential?: string;
  toolsEnabled?: boolean;
} = {}): ProviderInvocation {
  return {
    binding: binding(input.upstreamModelId, input.toolsEnabled),
    prompt: {
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 100,
    },
    ...(input.credential
      ? { credential: { secret: input.credential } }
      : {}),
    signal: input.signal,
    trace: {
      runId: "run-1",
      callId: "call-1",
      tenantId: "tenant-1",
      principalHash: "hash",
      safetyIdentifier: "a".repeat(64),
      promptVersion: "test",
    },
  };
}

function encodeFrames(
  frames: readonly Record<string, unknown>[],
  newline = "\n",
): string {
  return frames
    .map((event) => (
      `event: ${String(event["type"])}${newline}`
      + `data: ${JSON.stringify(event)}${newline}${newline}`
    ))
    .join("");
}

function streamResponse(
  body: string,
  chunkSizes: readonly number[] = [],
  headers: Record<string, string> = {},
): Response {
  if (chunkSizes.length === 0) {
    return new Response(body, {
      headers: { "Content-Type": "text/event-stream", ...headers },
    });
  }
  const bytes = new TextEncoder().encode(body);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let offset = 0;
      let index = 0;
      while (offset < bytes.length) {
        const size = chunkSizes[index % chunkSizes.length] ?? 1;
        controller.enqueue(bytes.slice(offset, offset + size));
        offset += size;
        index += 1;
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", ...headers },
  });
}

async function collect(
  provider: ClaudeTextProvider,
  request = invocation(),
): Promise<CanonicalStreamEvent[]> {
  const events: CanonicalStreamEvent[] = [];
  for await (const event of provider.invokeStream(request)) events.push(event);
  return events;
}

describe("ClaudeTextProvider canonical streaming", () => {
  it("performs a non-generating exact-model readiness probe", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "claude-exact-model",
      type: "model",
      display_name: "Claude exact model",
    }), {
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const readiness = await new ClaudeTextProvider("").checkReadiness(
      "claude-exact-model",
      { credential: { secret: "rotated-request-credential" } },
    );

    expect(readiness).toMatchObject({
      modelId: "claude-exact-model",
      actualModelId: "claude-exact-model",
      reason: "ready",
      eligible: true,
      httpStatus: 200,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/models/claude-exact-model",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
    const requestBody = fetchMock.mock.calls[0]?.[1]?.body;
    expect(requestBody).toBeUndefined();
  });

  it("fails readiness closed when Anthropic resolves another model identity", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ id: "claude-other-model", type: "model" }),
      { headers: { "Content-Type": "application/json" } },
    )));

    await expect(new ClaudeTextProvider("test-key").checkReadiness(
      "claude-exact-model",
    )).resolves.toMatchObject({
      actualModelId: "claude-other-model",
      reason: "model_identity_mismatch",
      eligible: false,
      errorClass: "model_unavailable",
    });
  });

  it("normalizes readiness failures without retaining provider bodies", async () => {
    const providerBody = "secret-provider-diagnostic";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      providerBody,
      { status: 429 },
    )));

    const readiness = await new ClaudeTextProvider("test-key").checkReadiness(
      "claude-exact-model",
    );

    expect(readiness).toMatchObject({
      reason: "rate_limited",
      retryable: true,
      eligible: false,
      errorClass: "rate_limited",
    });
    expect(JSON.stringify(readiness)).not.toContain(providerBody);
  });

  it("advertises the reviewed request-side tool contract version", () => {
    const provider = new ClaudeTextProvider("test-key");

    expect(provider).toMatchObject({
      adapterId: CLAUDE_TEXT_ADAPTER_ID,
      adapterVersion: "2",
    });
    expect(CLAUDE_TEXT_ADAPTER_VERSION).toBe("2");
  });

  it("uses a request-scoped credential without exposing it in the binding", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("", { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new ClaudeTextProvider("constructor-key");

    await collect(provider, invocation({ credential: "request-key" }));

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      "x-api-key": "request-key",
    });
    expect(JSON.stringify(binding())).not.toContain("request-key");
  });

  it("fails before fetch when neither a lease nor constructor credential exists", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const provider = new ClaudeTextProvider("");

    await expect(collect(provider)).resolves.toEqual([{
      kind: "failed",
      error: expect.objectContaining({
        error_class: "authentication",
        code: "credential_unavailable",
      }),
    }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the exact invocation model and maps arbitrarily chunked CRLF SSE", async () => {
    const frames = [
      {
        type: "message_start",
        message: {
          id: "msg_provider_1",
          model: "claude-exact-model",
          usage: { input_tokens: 7, output_tokens: 0 },
        },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Hello" },
      },
      {
        type: "message_delta",
        delta: { stop_reason: "end_turn" },
        usage: { output_tokens: 2 },
      },
      { type: "message_stop" },
    ];
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse(
        encodeFrames(frames, "\r\n"),
        [1, 2, 5, 3],
        { "request-id": "req_provider_1" },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new ClaudeTextProvider("test-key", "legacy-bootstrap-model");

    const events = await collect(provider);

    expect(events).toEqual([
      {
        kind: "response_started",
        provider_id: "anthropic",
        provider_request_id: "req_provider_1",
        actual_model_id: "claude-exact-model",
      },
      {
        kind: "usage",
        mode: "snapshot",
        final: false,
        usage: { input_tokens: 7, output_tokens: 0 },
      },
      { kind: "text_delta", text: "Hello" },
      {
        kind: "usage",
        mode: "snapshot",
        final: true,
        usage: { output_tokens: 2 },
      },
      { kind: "completed", reason: "stop" },
    ]);
    const body = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    ) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "claude-exact-model",
      stream: true,
      max_tokens: 100,
    });
    expect(body["model"]).not.toBe("legacy-bootstrap-model");
  });

  it("keeps the Phase 1 Atlas system prompt out of prompt caching", async () => {
    const frames = [
      {
        type: "message_start",
        message: {
          id: "msg_provider_no_cache",
          model: "claude-exact-model",
          usage: { input_tokens: 3, output_tokens: 0 },
        },
      },
      {
        type: "message_delta",
        delta: { stop_reason: "end_turn" },
        usage: { output_tokens: 1 },
      },
      { type: "message_stop" },
    ];
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse(encodeFrames(frames)),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new ClaudeTextProvider("test-key");
    const request = invocation();
    request.prompt.system = "You are Atlas.";

    await collect(provider, request);

    const body = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    ) as Record<string, unknown>;
    expect(body["system"]).toBe("You are Atlas.");
    expect(JSON.stringify(body)).not.toContain("cache_control");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty(
      "anthropic-beta",
    );
  });

  it("serializes canonical tool definitions, calls, and untrusted results", async () => {
    const frames = [
      {
        type: "message_start",
        message: {
          id: "msg_provider_tools",
          model: "claude-exact-model",
          usage: { input_tokens: 3, output_tokens: 0 },
        },
      },
      {
        type: "message_delta",
        delta: { stop_reason: "end_turn" },
        usage: { output_tokens: 1 },
      },
      { type: "message_stop" },
    ];
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse(encodeFrames(frames)),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new ClaudeTextProvider("test-key");
    const request = invocation({ toolsEnabled: true });
    request.prompt.tools = [{
      name: "catalog_help",
      description: "Read the governed catalog.",
      input_schema: {
        type: "object",
        properties: { query: { type: "string", maxLength: 200 } },
        required: ["query"],
        additionalProperties: false,
      },
    }];
    request.prompt.messages = [
      { role: "user", content: "Find invoice help." },
      {
        role: "assistant",
        content: [{
          type: "tool_use",
          call_id: "call-1",
          tool_name: "catalog_help",
          input: { query: "invoices" },
        }],
      },
      {
        role: "user",
        content: [{
          type: "tool_result",
          call_id: "call-1",
          tool_name: "catalog_help",
          content: {
            untrusted_tool_data: true,
            data: { answer: "fixture" },
          },
        }],
      },
    ];

    await collect(provider, request);

    const body = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    ) as Record<string, unknown>;
    expect(body["tools"]).toEqual([{
      name: "catalog_help",
      description: "Read the governed catalog.",
      input_schema: request.prompt.tools[0]?.input_schema,
    }]);
    expect(body["messages"]).toEqual([
      { role: "user", content: "Find invoice help." },
      {
        role: "assistant",
        content: [{
          type: "tool_use",
          id: "call-1",
          name: "catalog_help",
          input: { query: "invoices" },
        }],
      },
      {
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: "call-1",
          content: JSON.stringify({
            untrusted_tool_data: true,
            data: { answer: "fixture" },
          }),
        }],
      },
    ]);
  });

  it("fails closed on an oversized unterminated SSE frame", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      streamResponse(`data: ${"x".repeat(262_145)}`),
    ));
    const provider = new ClaudeTextProvider("test-key");

    const events = await collect(provider);

    expect(events).toEqual([{
      kind: "failed",
      error: expect.objectContaining({
        error_class: "protocol_error",
        code: "sse_frame_too_large",
        retryable: false,
      }),
    }]);
  });

  it("maps tool-use blocks without exposing provider-native objects", async () => {
    const frames = [
      {
        type: "message_start",
        message: {
          id: "msg_tool",
          model: "claude-exact-model",
          usage: { input_tokens: 3, output_tokens: 0 },
        },
      },
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "toolu_1", name: "search" },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: "{\"q\":\"" },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: "hi\"}" },
      },
      { type: "content_block_stop", index: 0 },
      {
        type: "message_delta",
        delta: { stop_reason: "tool_use" },
        usage: { output_tokens: 4 },
      },
      { type: "message_stop" },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      streamResponse(encodeFrames(frames)),
    ));

    const events = await collect(new ClaudeTextProvider("test-key"));

    expect(events).toContainEqual({
      kind: "tool_call_start",
      call_id: "toolu_1",
      tool_name: "search",
    });
    expect(events).toContainEqual({
      kind: "tool_call_complete",
      call_id: "toolu_1",
      input: { q: "hi" },
    });
    expect(events.at(-1)).toEqual({ kind: "completed", reason: "tool_call" });
  });

  it("normalizes malformed tool JSON as a safe protocol failure", async () => {
    const frames = [
      {
        type: "message_start",
        message: {
          id: "msg_bad_tool",
          model: "claude-exact-model",
          usage: { input_tokens: 1, output_tokens: 0 },
        },
      },
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "toolu_bad", name: "broken" },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: "SECRET invalid json" },
      },
      { type: "content_block_stop", index: 0 },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      streamResponse(encodeFrames(frames)),
    ));

    const events = await collect(new ClaudeTextProvider("test-key"));

    expect(events.at(-1)).toMatchObject({
      kind: "failed",
      error: {
        error_class: "protocol_error",
        code: "invalid_tool_input",
        retryable: false,
      },
    });
    expect(JSON.stringify(events.at(-1))).not.toContain("SECRET");
  });

  it("normalizes HTTP failures and retry-after without leaking the response body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      "SECRET_PROVIDER_DETAIL",
      {
        status: 429,
        headers: { "retry-after": "2" },
      },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const events = await collect(new ClaudeTextProvider("test-key"));

    expect(events).toEqual([{
      kind: "failed",
      error: {
        error_class: "rate_limited",
        code: "http_429",
        safe_message: "Atlas is temporarily at capacity. Please try again shortly.",
        retryable: true,
        retry_after_ms: 2_000,
      },
    }]);
    expect(JSON.stringify(events)).not.toContain("SECRET_PROVIDER_DETAIL");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails safely on malformed provider SSE JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      streamResponse("event: message_start\ndata: {SECRET malformed\n\n"),
    ));

    const events = await collect(new ClaudeTextProvider("test-key"));

    expect(events).toEqual([{
      kind: "failed",
      error: {
        error_class: "protocol_error",
        code: "malformed_sse_json",
        safe_message: "Atlas could not complete this response. Please try again.",
        retryable: false,
      },
    }]);
    expect(JSON.stringify(events)).not.toContain("SECRET");
  });

  it("keeps partial text but normalizes a later provider error", async () => {
    const frames = [
      {
        type: "message_start",
        message: {
          id: "msg_partial_error",
          model: "claude-exact-model",
          usage: { input_tokens: 1, output_tokens: 0 },
        },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "partial" },
      },
      {
        type: "error",
        error: {
          type: "overloaded_error",
          message: "SECRET_PROVIDER_DETAIL",
        },
      },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      streamResponse(encodeFrames(frames)),
    ));

    const events = await collect(new ClaudeTextProvider("test-key"));

    expect(events).toContainEqual({ kind: "text_delta", text: "partial" });
    expect(events.at(-1)).toMatchObject({
      kind: "failed",
      error: {
        error_class: "overloaded",
        code: "overloaded_error",
        retryable: true,
      },
    });
    expect(JSON.stringify(events)).not.toContain("SECRET_PROVIDER_DETAIL");
  });

  it("normalizes provider refusal separately from completion", async () => {
    const frames = [
      {
        type: "message_start",
        message: {
          id: "msg_refusal",
          model: "claude-exact-model",
          usage: { input_tokens: 2, output_tokens: 0 },
        },
      },
      {
        type: "message_delta",
        delta: { stop_reason: "refusal" },
        usage: { output_tokens: 1 },
      },
      { type: "message_stop" },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      streamResponse(encodeFrames(frames)),
    ));

    const events = await collect(new ClaudeTextProvider("test-key"));

    expect(events).toContainEqual({
      kind: "refusal",
      reason: "provider_refusal",
    });
    expect(events.at(-1)).toEqual({ kind: "completed", reason: "refusal" });
  });

  it("normalizes a truncated stream", async () => {
    const frames = [{
      type: "message_start",
      message: {
        id: "msg_truncated",
        model: "claude-exact-model",
        usage: { input_tokens: 1, output_tokens: 0 },
      },
    }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      streamResponse(encodeFrames(frames)),
    ));

    const events = await collect(new ClaudeTextProvider("test-key"));

    expect(events.at(-1)).toMatchObject({
      kind: "failed",
      error: {
        error_class: "stream_incomplete",
        code: "stream_ended_without_terminal",
      },
    });
  });

  it("propagates cancellation to the upstream reader", async () => {
    const abortController = new AbortController();
    const startFrame = encodeFrames([{
      type: "message_start",
      message: {
        id: "msg_cancel",
        model: "claude-exact-model",
        usage: { input_tokens: 1, output_tokens: 0 },
      },
    }]);
    const fetchMock = vi.fn().mockImplementation(
      async (_url: string, init: RequestInit) => {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(startFrame));
            init.signal?.addEventListener("abort", () => {
              controller.error(new DOMException("aborted", "AbortError"));
            }, { once: true });
          },
        });
        return new Response(stream, {
          headers: { "Content-Type": "text/event-stream" },
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new ClaudeTextProvider("test-key");
    const iterator = provider.invokeStream(invocation({
      signal: abortController.signal,
    }))[Symbol.asyncIterator]();

    expect((await iterator.next()).value).toMatchObject({
      kind: "response_started",
    });
    abortController.abort();
    expect((await iterator.next()).value).toEqual({ kind: "usage", mode: "snapshot", final: false, usage: { input_tokens: 1, output_tokens: 0 } });
    expect((await iterator.next()).value).toEqual({ kind: "cancelled" });
  });
});
