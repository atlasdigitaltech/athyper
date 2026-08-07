import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OPENAI_RESPONSES_ADAPTER_ID,
  OPENAI_RESPONSES_ADAPTER_VERSION,
  OpenAiTextProvider,
} from "../openai-text.provider.js";
import type {
  AtlasModelBinding,
  CanonicalStreamEvent,
  ProviderInvocation,
} from "../i-model-provider.js";

const SAFETY_IDENTIFIER = "a".repeat(64);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAiTextProvider", () => {
  it("advertises the certified Responses profile and keeps legacy invoke fail-closed", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const provider = createProvider();

    expect(provider).toMatchObject({
      modelId: "openai-text",
      modelVersion: "gpt-5.6-sol",
      adapterId: OPENAI_RESPONSES_ADAPTER_ID,
      adapterVersion: OPENAI_RESPONSES_ADAPTER_VERSION,
      operationalState: {
        implemented: true,
        credentialed: true,
        healthy: false,
        eligible: false,
        reason: "readiness_not_checked",
      },
    });
    expect(provider.adapterVersion).toBe("2");
    expect(OPENAI_RESPONSES_ADAPTER_VERSION).toBe("2");
    expect(provider.capabilities).toMatchObject({
      supports_streaming: true,
      supports_tool_calling: true,
      max_context_tokens: 1_050_000,
      max_output_tokens: 128_000,
    });

    await expect(provider.invoke({
      messages: [{ role: "user", content: "fixture" }],
      max_tokens: 10,
    })).rejects.toThrow("authenticated ProviderInvocation");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a stateless bounded request and maps normal usage into disjoint buckets", async () => {
    let requestedUrl: string | undefined;
    let requestedInit: RequestInit | undefined;
    vi.stubGlobal("fetch", vi.fn(async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      requestedUrl = String(input);
      requestedInit = init;
      return fixtureResponse("responses-normal.sse", {
        "x-request-id": "req_fixture_normal",
      });
    }));

    const provider = createProvider({
      apiKey: "configured-key",
      projectId: "project_fixture",
    });
    const events = await collect(provider.invokeStream(invocation({
      credential: { secret: "request-key" },
      prompt: {
        system: "Fixture instructions",
        messages: [
          { role: "user", content: "first fixture message" },
          { role: "assistant", content: "fixture response" },
          { role: "user", content: "second fixture message" },
        ],
        max_tokens: 150_000,
      },
    })));

    expect(requestedUrl).toBe("https://api.openai.com/v1/responses");
    expect(requestedInit?.method).toBe("POST");
    expect(new Headers(requestedInit?.headers).get("authorization"))
      .toBe("Bearer request-key");
    expect(new Headers(requestedInit?.headers).get("openai-project"))
      .toBe("project_fixture");
    const body = JSON.parse(String(requestedInit?.body)) as Record<string, unknown>;
    expect(body).toEqual({
      model: "gpt-5.6-sol",
      stream: true,
      store: false,
      truncation: "disabled",
      reasoning: { effort: "none" },
      safety_identifier: SAFETY_IDENTIFIER,
      max_output_tokens: 4_096,
      instructions: "Fixture instructions",
      input: [
        { role: "user", content: "first fixture message" },
        { role: "assistant", content: "fixture response" },
        { role: "user", content: "second fixture message" },
      ],
    });
    expect(body).not.toHaveProperty("conversation");
    expect(body).not.toHaveProperty("previous_response_id");
    expect(body).not.toHaveProperty("user");
    expect(body).not.toHaveProperty("tools");
    expect(events).toEqual([
      {
        kind: "response_started",
        provider_id: "openai",
        provider_request_id: "req_fixture_normal",
        actual_model_id: "gpt-5.6-sol",
      },
      { kind: "text_delta", text: "fixture-ok" },
      {
        kind: "usage",
        mode: "snapshot",
        final: true,
        usage: {
          input_tokens: 9,
          cache_read_tokens: 3,
          cache_write_tokens: 2,
          output_tokens: 5,
          reasoning_tokens: 2,
        },
      },
      { kind: "completed", reason: "stop" },
    ]);
  });

  it("serializes canonical strict functions, calls, and untrusted outputs", async () => {
    let requestedInit: RequestInit | undefined;
    vi.stubGlobal("fetch", vi.fn(async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      requestedInit = init;
      return fixtureResponse("responses-normal.sse");
    }));
    const toolSchema = {
      type: "object",
      properties: { query: { type: "string", maxLength: 200 } },
      required: ["query"],
      additionalProperties: false,
    };
    const request = invocation({
      prompt: {
        messages: [
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
        ],
        max_tokens: 100,
        tools: [{
          name: "catalog_help",
          description: "Read the governed catalog.",
          input_schema: toolSchema,
        }],
      },
    });

    await collect(createProvider().invokeStream(request));

    const body = JSON.parse(
      String(requestedInit?.body),
    ) as Record<string, unknown>;
    expect(body["tools"]).toEqual([{
      type: "function",
      name: "catalog_help",
      description: "Read the governed catalog.",
      parameters: toolSchema,
      strict: true,
    }]);
    expect(body["input"]).toEqual([
      { role: "user", content: "Find invoice help." },
      {
        type: "function_call",
        call_id: "call-1",
        name: "catalog_help",
        arguments: JSON.stringify({ query: "invoices" }),
      },
      {
        type: "function_call_output",
        call_id: "call-1",
        output: JSON.stringify({
          untrusted_tool_data: true,
          data: { answer: "fixture" },
        }),
      },
    ]);
  });

  it("rejects tool definitions when the exact binding has not enabled tools", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const request = invocation({
      binding: binding({
        capabilities: {
          ...binding().capabilities,
          tools: false,
        },
      }),
      prompt: {
        messages: [{ role: "user", content: "fixture" }],
        max_tokens: 100,
        tools: [{
          name: "catalog_help",
          description: "Read the governed catalog.",
          input_schema: {
            type: "object",
            properties: {},
            required: [],
            additionalProperties: false,
          },
        }],
      },
    });

    const events = await collect(createProvider().invokeStream(request));

    expect(events).toEqual([{
      kind: "failed",
      error: expect.objectContaining({
        error_class: "invalid_request",
        code: "tools_not_enabled",
        retryable: false,
      }),
    }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses CRLF frames split across arbitrary byte chunks", async () => {
    const fixture = readFixture("responses-normal.sse").replace(/\n/g, "\r\n");
    vi.stubGlobal("fetch", vi.fn(async () => chunkedSseResponse(fixture, 7)));

    const events = await collect(createProvider().invokeStream(invocation()));

    expect(events.at(0)?.kind).toBe("response_started");
    expect(events.some((event) => (
      event.kind === "text_delta" && event.text === "fixture-ok"
    ))).toBe(true);
    expect(events.at(-1)).toEqual({ kind: "completed", reason: "stop" });
  });

  it("maps refusal and function-call fixtures without exposing provider-specific events", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fixtureResponse(
      "responses-refusal.sse",
    )));
    const refusalEvents = await collect(
      createProvider().invokeStream(invocation()),
    );
    expect(refusalEvents).toContainEqual({
      kind: "refusal",
      reason: "fixture-refusal",
    });
    expect(refusalEvents.at(-1)).toEqual({
      kind: "completed",
      reason: "refusal",
    });

    vi.stubGlobal("fetch", vi.fn(async () => fixtureResponse(
      "responses-tool.sse",
    )));
    const toolEvents = await collect(createProvider().invokeStream(invocation()));
    expect(toolEvents).toContainEqual({
      kind: "tool_call_start",
      call_id: "call_fixture",
      tool_name: "lookup_fixture",
    });
    expect(toolEvents).toContainEqual({
      kind: "tool_call_input_delta",
      call_id: "call_fixture",
      json_fragment: "{\"record_id\":",
    });
    expect(toolEvents).toContainEqual({
      kind: "tool_call_complete",
      call_id: "call_fixture",
      input: { record_id: "fixture-1" },
    });
    expect(toolEvents.at(-1)).toEqual({
      kind: "completed",
      reason: "tool_call",
    });
  });

  it.each([
    [401, "authentication", false],
    [403, "permission", false],
    [404, "model_unavailable", false],
    [429, "rate_limited", true],
    [503, "overloaded", true],
  ] as const)(
    "maps HTTP %i to a safe %s failure",
    async (status, errorClass, retryable) => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(
        "SECRET_PROVIDER_DETAIL fixture customer text",
        {
          status,
          headers: status === 429 ? { "Retry-After": "2" } : undefined,
        },
      )));

      const events = await collect(createProvider().invokeStream(invocation()));
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        kind: "failed",
        error: {
          error_class: errorClass,
          code: `http_${status}`,
          retryable,
        },
      });
      if (status === 429) {
        expect(events[0]).toMatchObject({
          kind: "failed",
          error: { retry_after_ms: 2_000 },
        });
      }
      expect(JSON.stringify(events)).not.toContain("SECRET_PROVIDER_DETAIL");
      expect(JSON.stringify(events)).not.toContain("customer text");
    },
  );

  it("normalizes provider-native incomplete responses and preserves final usage", async () => {
    const cases = [
      {
        reason: "max_output_tokens",
        expectedClass: "stream_incomplete",
        retryable: false,
      },
      {
        reason: "content_filter",
        expectedClass: "safety_block",
        retryable: false,
      },
    ] as const;

    for (const item of cases) {
      vi.stubGlobal("fetch", vi.fn(async () => sseResponse(encodeSse([
        {
          type: "response.created",
          response: {
            id: `resp_incomplete_${item.reason}`,
            model: "gpt-5.6-sol",
          },
        },
        {
          type: "response.incomplete",
          response: {
            id: `resp_incomplete_${item.reason}`,
            model: "gpt-5.6-sol",
            incomplete_details: { reason: item.reason },
            usage: {
              input_tokens: 12,
              input_tokens_details: {
                cached_tokens: 2,
                cache_write_tokens: 1,
              },
              output_tokens: 8,
              output_tokens_details: { reasoning_tokens: 3 },
            },
          },
        },
      ]))));

      const events = await collect(createProvider().invokeStream(invocation()));
      expect(events).toContainEqual({
        kind: "usage",
        mode: "snapshot",
        final: true,
        usage: {
          input_tokens: 9,
          cache_read_tokens: 2,
          cache_write_tokens: 1,
          output_tokens: 5,
          reasoning_tokens: 3,
        },
      });
      expect(events.at(-1)).toMatchObject({
        kind: "failed",
        error: {
          error_class: item.expectedClass,
          code: item.reason,
          retryable: item.retryable,
        },
      });
    }
  });

  it("normalizes response.failed and stream error events without leaking messages", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(encodeSse([
      {
        type: "response.created",
        response: { id: "resp_failed", model: "gpt-5.6-sol" },
      },
      {
        type: "response.failed",
        response: {
          id: "resp_failed",
          model: "gpt-5.6-sol",
          error: {
            code: "rate_limit_exceeded",
            message: "SECRET_PROVIDER_DETAIL",
          },
          usage: {
            input_tokens: 4,
            input_tokens_details: {
              cached_tokens: 0,
              cache_write_tokens: 0,
            },
            output_tokens: 0,
            output_tokens_details: { reasoning_tokens: 0 },
          },
        },
      },
    ]))));
    const failedEvents = await collect(
      createProvider().invokeStream(invocation()),
    );
    expect(failedEvents).toContainEqual({
      kind: "usage",
      mode: "snapshot",
      final: true,
      usage: {
        input_tokens: 4,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        output_tokens: 0,
        reasoning_tokens: 0,
      },
    });
    expect(failedEvents.at(-1)).toMatchObject({
      kind: "failed",
      error: {
        error_class: "rate_limited",
        code: "rate_limit_exceeded",
        retryable: true,
      },
    });
    expect(JSON.stringify(failedEvents)).not.toContain(
      "SECRET_PROVIDER_DETAIL",
    );

    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(encodeSse([{
      type: "error",
      code: "server_error",
      message: "SECRET_STREAM_MESSAGE",
    }]))));
    const streamErrorEvents = await collect(
      createProvider().invokeStream(invocation()),
    );
    expect(streamErrorEvents).toEqual([{
      kind: "failed",
      error: expect.objectContaining({
        error_class: "upstream_error",
        code: "server_error",
        retryable: true,
      }),
    }]);
    expect(JSON.stringify(streamErrorEvents)).not.toContain(
      "SECRET_STREAM_MESSAGE",
    );
  });

  it("fails safely on actual-model mismatch, malformed frames, and oversized deltas", async () => {
    const cases = [
      encodeSse([{
        type: "response.created",
        response: { id: "resp_wrong", model: "gpt-wrong" },
      }]),
      "event: response.created\ndata: {malformed}\n\n",
      "event: response.created\ndata: null\n\n",
      encodeSse([
        {
          type: "response.created",
          response: { id: "resp_large", model: "gpt-5.6-sol" },
        },
        {
          type: "response.output_text.delta",
          delta: "x".repeat(65_537),
        },
      ]),
    ];
    const expectedCodes = [
      "actual_model_mismatch",
      "malformed_sse_json",
      "malformed_sse_event",
      "invalid_text_delta",
    ];

    for (const [index, body] of cases.entries()) {
      vi.stubGlobal("fetch", vi.fn(async () => sseResponse(body)));
      const events = await collect(createProvider().invokeStream(invocation()));
      expect(events.at(-1)).toMatchObject({
        kind: "failed",
        error: {
          error_class: "protocol_error",
          code: expectedCodes[index],
        },
      });
    }
  });

  it("requires final usage and caps pending function calls", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(encodeSse([
      {
        type: "response.created",
        response: { id: "resp_no_usage", model: "gpt-5.6-sol" },
      },
      {
        type: "response.completed",
        response: { id: "resp_no_usage", model: "gpt-5.6-sol" },
      },
    ]))));
    const missingUsage = await collect(
      createProvider().invokeStream(invocation()),
    );
    expect(missingUsage.at(-1)).toMatchObject({
      kind: "failed",
      error: {
        error_class: "protocol_error",
        code: "missing_final_usage",
      },
    });

    const toolStarts: Record<string, unknown>[] = [{
      type: "response.created",
      response: { id: "resp_many_tools", model: "gpt-5.6-sol" },
    }];
    for (let index = 0; index <= 64; index += 1) {
      toolStarts.push({
        type: "response.output_item.added",
        output_index: index,
        item: {
          id: `fc_${index}`,
          type: "function_call",
          call_id: `call_${index}`,
          name: "fixture_tool",
          arguments: "",
        },
      });
    }
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(
      encodeSse(toolStarts),
    )));
    const tooManyTools = await collect(
      createProvider().invokeStream(invocation()),
    );
    expect(tooManyTools.at(-1)).toMatchObject({
      kind: "failed",
      error: {
        error_class: "protocol_error",
        code: "too_many_tool_calls",
      },
    });
    expect(tooManyTools.filter((event) => (
      event.kind === "tool_call_start"
    ))).toHaveLength(64);
  });

  it("maps caller cancellation and provider timeout distinctly", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn(async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const stream = new ReadableStream<Uint8Array>({
        start(streamController) {
          streamController.enqueue(new TextEncoder().encode(encodeSse([{
            type: "response.created",
            response: {
              id: "resp_cancel",
              model: "gpt-5.6-sol",
            },
          }])));
          init?.signal?.addEventListener("abort", () => {
            streamController.error(new DOMException("aborted", "AbortError"));
          }, { once: true });
        },
      });
      return eventStreamResponse(stream);
    }));
    const iterator = createProvider().invokeStream(invocation({
      signal: controller.signal,
    }))[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toMatchObject({
      kind: "response_started",
    });
    controller.abort();
    expect((await iterator.next()).value).toEqual({ kind: "cancelled" });

    vi.stubGlobal("fetch", vi.fn((
      _input: string | URL | Request,
      init?: RequestInit,
    ) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("timed out", "AbortError"));
      }, { once: true });
    })));
    const timeoutEvents = await collect(
      createProvider({ timeoutMs: 5 }).invokeStream(invocation()),
    );
    expect(timeoutEvents).toEqual([{
      kind: "failed",
      error: expect.objectContaining({
        error_class: "timeout",
        code: "provider_timeout",
        retryable: true,
      }),
    }]);
  });

  it("does not reclassify a caller cancellation as a later timeout", async () => {
    const controller = new AbortController();
    let markFetchStarted: (() => void) | undefined;
    const fetchStarted = new Promise<void>((resolve) => {
      markFetchStarted = resolve;
    });
    vi.stubGlobal("fetch", vi.fn((
      _input: string | URL | Request,
      init?: RequestInit,
    ) => new Promise<Response>((_resolve, reject) => {
      markFetchStarted?.();
      init?.signal?.addEventListener("abort", () => {
        setTimeout(() => {
          reject(new DOMException("caller cancelled", "AbortError"));
        }, 20);
      }, { once: true });
    })));

    const pending = collect(createProvider({ timeoutMs: 5 }).invokeStream(
      invocation({ signal: controller.signal }),
    ));
    await fetchStarted;
    controller.abort();

    await expect(pending).resolves.toEqual([{ kind: "cancelled" }]);
  });

  it("performs a no-generation exact-model readiness check with safe states", async () => {
    let requestedUrl: string | undefined;
    let requestedInit: RequestInit | undefined;
    vi.stubGlobal("fetch", vi.fn(async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      requestedUrl = String(input);
      requestedInit = init;
      return new Response("SECRET_METADATA", { status: 200 });
    }));
    const provider = createProvider({
      apiKey: undefined,
      projectId: "project_fixture",
    });
    const ready = await provider.checkReadiness("gpt-5.6-sol", {
      credential: { secret: "request-key" },
    });

    expect(requestedUrl).toBe(
      "https://api.openai.com/v1/models/gpt-5.6-sol",
    );
    expect(requestedInit?.method).toBe("GET");
    expect(requestedInit?.body).toBeUndefined();
    expect(new Headers(requestedInit?.headers).get("authorization"))
      .toBe("Bearer request-key");
    expect(new Headers(requestedInit?.headers).get("openai-project"))
      .toBe("project_fixture");
    expect(ready).toEqual({
      modelId: "gpt-5.6-sol",
      implemented: true,
      credentialed: true,
      healthy: true,
      eligible: true,
      reason: "ready",
      retryable: false,
      httpStatus: 200,
    });
    expect(JSON.stringify(ready)).not.toContain("SECRET_METADATA");

    const noCredentialFetch = vi.fn();
    vi.stubGlobal("fetch", noCredentialFetch);
    await expect(createProvider({ apiKey: undefined }).checkReadiness(
      "gpt-5.6-sol",
    )).resolves.toMatchObject({
      credentialed: false,
      healthy: false,
      eligible: false,
      reason: "missing_credential",
    });
    expect(noCredentialFetch).not.toHaveBeenCalled();
  });

  it("rejects unsafe or unsupported invocations before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const provider = createProvider();

    const invalidSafety = await collect(provider.invokeStream(invocation({
      trace: {
        runId: "run",
        callId: "call",
        tenantId: "tenant",
        principalHash: "hash",
        safetyIdentifier: "raw-user-id",
        promptVersion: "fixture",
      },
    })));
    expect(invalidSafety).toEqual([{
      kind: "failed",
      error: expect.objectContaining({
        error_class: "invalid_request",
        code: "invalid_safety_identifier",
      }),
    }]);

    const unsupportedImage = await collect(provider.invokeStream(invocation({
      prompt: {
        messages: [{
          role: "user",
          content: [{
            type: "image",
            source: {
              type: "url",
              url: "https://example.invalid/fixture.png",
            },
          }],
        }],
        max_tokens: 100,
      },
    })));
    expect(unsupportedImage).toEqual([{
      kind: "failed",
      error: expect.objectContaining({
        error_class: "invalid_request",
        code: "invalid_history_message",
      }),
    }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function createProvider(
  override: Partial<ConstructorParameters<typeof OpenAiTextProvider>[0]> = {},
): OpenAiTextProvider {
  return new OpenAiTextProvider({
    apiKey: "configured-key",
    projectId: undefined,
    timeoutMs: 10_000,
    defaultModelId: "gpt-5.6-sol",
    ...override,
  });
}

function binding(
  override: Partial<AtlasModelBinding> = {},
): AtlasModelBinding {
  return {
    bindingId: "openai-eval",
    publicModelId: "atlas-best",
    providerId: "openai",
    upstreamModelId: "gpt-5.6-sol",
    adapterId: OPENAI_RESPONSES_ADAPTER_ID,
    adapterVersion: OPENAI_RESPONSES_ADAPTER_VERSION,
    displayName: "Atlas Best",
    displayTier: "best",
    bindingExposure: "internal_evaluation",
    status: "available",
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      maxContextTokens: 1_000_000,
      maxOutputTokens: 4_096,
    },
    credentialPolicy: "platform",
    dataHandlingProfileId: "test",
    routingPolicyId: "no-fallback",
    allowedDataClasses: ["test"],
    allowedRegions: ["global"],
    providerRegion: "global",
    providerAccountClass: "test",
    priceVersion: "test",
    inputPricePerMtokUsd: null,
    cacheReadPricePerMtokUsd: null,
    cacheWritePricePerMtokUsd: null,
    outputPricePerMtokUsd: null,
    reasoningPricePerMtokUsd: null,
    ...override,
  };
}

function invocation(
  override: Partial<ProviderInvocation> = {},
): ProviderInvocation {
  return {
    binding: binding(),
    prompt: {
      messages: [{ role: "user", content: "fixture request" }],
      max_tokens: 100,
    },
    trace: {
      runId: "run",
      callId: "call",
      tenantId: "tenant",
      principalHash: "hash",
      safetyIdentifier: SAFETY_IDENTIFIER,
      promptVersion: "fixture",
    },
    ...override,
  };
}

async function collect(
  stream: AsyncIterable<CanonicalStreamEvent>,
): Promise<CanonicalStreamEvent[]> {
  const events: CanonicalStreamEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

function readFixture(name: string): string {
  return readFileSync(
    new URL(`./fixtures/openai/${name}`, import.meta.url),
    "utf8",
  );
}

function fixtureResponse(
  name: string,
  extraHeaders: Record<string, string> = {},
): Response {
  return sseResponse(readFixture(name), extraHeaders);
}

function sseResponse(
  body: string,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      ...extraHeaders,
    },
  });
}

function chunkedSseResponse(body: string, chunkBytes: number): Response {
  const bytes = new TextEncoder().encode(body);
  return eventStreamResponse(new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
        controller.enqueue(bytes.slice(offset, offset + chunkBytes));
      }
      controller.close();
    },
  }));
}

function encodeSse(frames: readonly Record<string, unknown>[]): string {
  return frames.map((frame) => (
    `event: ${String(frame["type"])}\ndata: ${JSON.stringify(frame)}\n\n`
  )).join("");
}

function eventStreamResponse(
  stream: ReadableStream<Uint8Array>,
): Response {
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}
