import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GEMINI_INTERACTIONS_ADAPTER_ID,
  GEMINI_INTERACTIONS_ADAPTER_VERSION,
  GeminiTextProvider,
} from "../gemini-text.provider.js";
import type {
  AtlasModelBinding,
  CanonicalStreamEvent,
  ProviderInvocation,
} from "../i-model-provider.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GeminiTextProvider", () => {
  it("advertises the certified text profile and keeps legacy invoke fail-closed", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const provider = createProvider();

    expect(provider).toMatchObject({
      modelId: "gemini-text",
      modelVersion: "gemini-3.6-flash",
      adapterId: GEMINI_INTERACTIONS_ADAPTER_ID,
      adapterVersion: GEMINI_INTERACTIONS_ADAPTER_VERSION,
      operationalState: {
        implemented: true,
        credentialed: true,
        healthy: false,
        eligible: false,
        reason: "readiness_not_checked",
      },
    });
    expect(provider.capabilities).toMatchObject({
      supports_streaming: true,
      supports_tool_calling: false,
      supports_vision: false,
      supports_pdf_native: false,
      supports_json_schema: false,
      max_context_tokens: 200_000,
      max_output_tokens: 8_192,
      supported_regions: ["global"],
    });

    await expect(provider.invoke({
      messages: [{ role: "user", content: "fixture" }],
      max_tokens: 10,
    })).rejects.toThrow("authenticated ProviderInvocation");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the SDK to send bounded stateless history and maps disjoint usage", async () => {
    let captured: CapturedRequest | undefined;
    vi.stubGlobal("fetch", vi.fn(async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      captured = await captureRequest(input, init);
      return fixtureResponse("interactions-normal.sse");
    }));

    const events = await collect(createProvider().invokeStream(invocation({
      credential: { secret: "request-key" },
      prompt: {
        system: "Fixture instructions",
        messages: [
          { role: "user", content: "first fixture message" },
          { role: "assistant", content: "fixture response" },
          { role: "user", content: "second fixture message" },
        ],
        max_tokens: 100,
        temperature: 0.2,
      },
    })));

    expect(captured?.url).toContain(
      "generativelanguage.googleapis.com/v1beta/interactions",
    );
    expect(captured?.method).toBe("POST");
    expect(captured?.headers.get("x-goog-api-key")).toBe("request-key");
    expect(captured?.body).toEqual({
      model: "gemini-3.6-flash",
      input: [
        {
          type: "user_input",
          content: [{ type: "text", text: "first fixture message" }],
        },
        {
          type: "model_output",
          content: [{ type: "text", text: "fixture response" }],
        },
        {
          type: "user_input",
          content: [{ type: "text", text: "second fixture message" }],
        },
      ],
      stream: true,
      store: false,
      system_instruction: "Fixture instructions",
      service_tier: "standard",
      generation_config: {
        max_output_tokens: 100,
        thinking_level: "medium",
        thinking_summaries: "none",
      },
    });
    expect(captured?.body).not.toHaveProperty("previous_interaction_id");
    expect(captured?.body).not.toHaveProperty("background");
    expect(captured?.body).not.toHaveProperty("tools");
    expect(captured?.body).not.toHaveProperty("safety_settings");
    expect(captured?.body).not.toHaveProperty("response_modalities");
    expect(captured?.body).not.toHaveProperty("response_format");
    expect(captured?.body).not.toHaveProperty("temperature");
    expect(captured?.body).not.toHaveProperty("top_p");
    expect(captured?.body).not.toHaveProperty("top_k");
    expect(captured?.body).not.toHaveProperty("candidate_count");
    expect(captured?.body).not.toHaveProperty("api_version");
    expect(events).toEqual([
      {
        kind: "response_started",
        provider_id: "gemini",
        provider_request_id: "int_fixture_normal",
        actual_model_id: "gemini-3.6-flash",
      },
      { kind: "text_delta", text: "fixture-ok" },
      {
        kind: "usage",
        mode: "snapshot",
        final: true,
        usage: {
          input_tokens: 9,
          output_tokens: 5,
          cache_read_tokens: 3,
          cache_write_tokens: 0,
          reasoning_tokens: 2,
        },
      },
      { kind: "completed", reason: "stop" },
    ]);
  });

  it("normalizes function-call arguments while the first binding sends no tools", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fixtureResponse(
      "interactions-tool.sse",
    )));

    const events = await collect(createProvider().invokeStream(invocation()));
    expect(events).toContainEqual({
      kind: "tool_call_start",
      call_id: "call_fixture",
      tool_name: "lookup_fixture",
    });
    expect(events).toContainEqual({
      kind: "tool_call_input_delta",
      call_id: "call_fixture",
      json_fragment: "{\"record_id\":",
    });
    expect(events).toContainEqual({
      kind: "tool_call_complete",
      call_id: "call_fixture",
      input: { record_id: "fixture-1" },
    });
    expect(events.at(-1)).toEqual({
      kind: "completed",
      reason: "tool_call",
    });
  });

  it("does not invent a safety classification from an undocumented model-output error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fixtureResponse(
      "interactions-model-output-error-no-policy-discriminator.sse",
    )));

    const events = await collect(createProvider().invokeStream(invocation()));
    expect(events.at(-1)).toEqual({
      kind: "failed",
      error: expect.objectContaining({
        error_class: "upstream_error",
        code: "interaction_failed",
      }),
    });
    expect(JSON.stringify(events)).not.toContain("REDACTED");
    expect(JSON.stringify(events)).not.toContain("safety_block");
  });

  it("uses models.get for non-generating readiness and validates exact model identity", async () => {
    const requests: CapturedRequest[] = [];
    vi.stubGlobal("fetch", vi.fn(async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      requests.push(await captureRequest(input, init));
      return new Response(JSON.stringify({
        name: "models/gemini-3.6-flash",
        version: "3.6",
        supportedGenerationMethods: ["generateContent"],
      }), {
        headers: { "Content-Type": "application/json" },
      });
    }));

    const readiness = await createProvider().checkReadiness(
      "gemini-3.6-flash",
      { credential: { secret: "readiness-key" } },
    );

    expect(readiness).toMatchObject({
      modelId: "gemini-3.6-flash",
      implemented: true,
      credentialed: true,
      healthy: true,
      eligible: true,
      reason: "ready",
      retryable: false,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("GET");
    expect(requests[0]?.url).toContain(
      "generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash",
    );
    expect(requests[0]?.body).toBeUndefined();
  });

  it.each([
    [401, "authentication"],
    [403, "permission"],
    [404, "model_unavailable"],
    [429, "quota_exhausted"],
    [503, "overloaded"],
  ] as const)(
    "maps SDK HTTP %i failures without exposing provider detail",
    async (status, expectedClass) => {
      vi.stubGlobal("fetch", vi.fn(async () => googleErrorResponse(
        status,
        status === 429 ? "RESOURCE_EXHAUSTED fixture quota" : "SECRET_DETAIL",
      )));

      const events = await collect(createProvider().invokeStream(invocation()));
      expect(events).toEqual([{
        kind: "failed",
        error: expect.objectContaining({
          error_class: expectedClass,
        }),
      }]);
      expect(JSON.stringify(events)).not.toContain("SECRET_DETAIL");
      expect(JSON.stringify(events)).not.toContain("RESOURCE_EXHAUSTED");
    },
  );

  it("separates rate limiting from explicit quota exhaustion", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => googleErrorResponse(
      429,
      "Request rate is temporarily limited",
    )));
    const events = await collect(createProvider().invokeStream(invocation()));
    expect(events).toEqual([{
      kind: "failed",
      error: expect.objectContaining({
        error_class: "rate_limited",
        code: "provider_rate_limited",
        retryable: true,
      }),
    }]);
  });

  it("fails closed on configured account, region, and free-tier data mismatches", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const provider = createProvider();

    const accountMismatch = await collect(provider.invokeStream(invocation({
      binding: binding({ providerAccountClass: "platform_paid" }),
    })));
    expect(accountMismatch).toEqual([{
      kind: "failed",
      error: expect.objectContaining({
        error_class: "permission",
        code: "provider_account_class_mismatch",
      }),
    }]);

    const regionMismatch = await collect(provider.invokeStream(invocation({
      binding: binding({ providerRegion: "us-central1" }),
    })));
    expect(regionMismatch).toEqual([{
      kind: "failed",
      error: expect.objectContaining({
        error_class: "permission",
        code: "provider_region_mismatch",
      }),
    }]);

    const freeDataMismatch = await collect(provider.invokeStream(invocation({
      binding: binding({ allowedDataClasses: ["synthetic", "internal"] }),
    })));
    expect(freeDataMismatch).toEqual([{
      kind: "failed",
      error: expect.objectContaining({
        error_class: "permission",
        code: "free_account_data_policy_violation",
      }),
    }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported history and unsupported binding capabilities before network I/O", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const provider = createProvider();

    const assistantLast = await collect(provider.invokeStream(invocation({
      prompt: {
        messages: [{ role: "assistant", content: "not a valid final turn" }],
        max_tokens: 100,
      },
    })));
    expect(assistantLast).toEqual([{
      kind: "failed",
      error: expect.objectContaining({
        error_class: "invalid_request",
        code: "invalid_bounded_history",
      }),
    }]);

    const image = await collect(provider.invokeStream(invocation({
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
    expect(image).toEqual([{
      kind: "failed",
      error: expect.objectContaining({
        error_class: "invalid_request",
        code: "unsupported_or_invalid_input",
      }),
    }]);

    const toolsBinding = await collect(provider.invokeStream(invocation({
      binding: binding({
        capabilities: {
          streaming: true,
          tools: true,
          vision: false,
          maxContextTokens: 200_000,
          maxOutputTokens: 8_192,
        },
      }),
    })));
    expect(toolsBinding).toEqual([{
      kind: "failed",
      error: expect.objectContaining({
        error_class: "invalid_request",
        code: "binding_not_supported",
      }),
    }]);

    const structuredOutput = await collect(provider.invokeStream(invocation({
      prompt: {
        messages: [{ role: "user", content: "return JSON" }],
        max_tokens: 100,
        response_format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: { answer: { type: "string" } },
          },
        },
      },
    })));
    expect(structuredOutput).toEqual([{
      kind: "failed",
      error: expect.objectContaining({
        error_class: "invalid_request",
        code: "structured_output_not_enabled",
      }),
    }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["failed", "upstream_error", "interaction_failed"],
    ["incomplete", "stream_incomplete", "interaction_incomplete"],
    ["budget_exceeded", "quota_exhausted", "provider_budget_exceeded"],
  ] as const)(
    "normalizes terminal status %s",
    async (status, errorClass, code) => {
      vi.stubGlobal("fetch", vi.fn(async () => sseResponse(eventsToSse([
        createdEvent(`int_${status}`),
        {
          event_type: "interaction.completed",
          interaction: {
            id: `int_${status}`,
            model: "gemini-3.6-flash",
            status,
            service_tier: "standard",
            usage: fixtureUsage(),
          },
        },
      ]))));

      const events = await collect(createProvider().invokeStream(invocation()));
      expect(events.at(-1)).toEqual({
        kind: "failed",
        error: expect.objectContaining({
          error_class: errorClass,
          code,
        }),
      });
    },
  );

  it("rejects model, service-tier, and usage drift", async () => {
    const cases = [
      {
        interaction: {
          id: "int_drift",
          model: "gemini-3.5-flash",
          status: "in_progress",
        },
        expected: "actual_model_mismatch",
      },
      {
        interaction: {
          id: "int_drift",
          model: "gemini-3.6-flash",
          status: "completed",
          service_tier: "priority",
          usage: fixtureUsage(),
        },
        expected: "unexpected_service_tier",
        created: true,
      },
      {
        interaction: {
          id: "int_drift",
          model: "gemini-3.6-flash",
          status: "completed",
          service_tier: "standard",
          usage: {
            ...fixtureUsage(),
            total_cached_tokens: 100,
          },
        },
        expected: "invalid_final_usage",
        created: true,
      },
    ] as const;

    for (const item of cases) {
      vi.stubGlobal("fetch", vi.fn(async () => sseResponse(eventsToSse(
        item.created
          ? [
              createdEvent("int_drift"),
              {
                event_type: "interaction.completed",
                interaction: item.interaction,
              },
            ]
          : [{
              event_type: "interaction.created",
              interaction: item.interaction,
            }],
      ))));
      const events = await collect(
        createProvider().invokeStream(invocation()),
      );
      expect(events.at(-1)).toEqual({
        kind: "failed",
        error: expect.objectContaining({ code: item.expected }),
      });
    }
  });

  it("normalizes cancellation and truncated SDK streams to one terminal", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn(async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const stream = new ReadableStream<Uint8Array>({
        start(streamController) {
          streamController.enqueue(new TextEncoder().encode(eventToSse(
            createdEvent("int_cancel"),
          )));
          controller.signal.addEventListener("abort", () => {
            streamController.error(new DOMException("aborted", "AbortError"));
          }, { once: true });
        },
      });
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream" },
      });
    }));

    const iterator = createProvider().invokeStream(invocation({
      signal: controller.signal,
    }))[Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({
      done: false,
      value: expect.objectContaining({ kind: "response_started" }),
    });
    controller.abort();
    expect(await iterator.next()).toEqual({
      done: false,
      value: { kind: "cancelled" },
    });
    expect(await iterator.next()).toEqual({ done: true, value: undefined });

    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(eventsToSse([
      createdEvent("int_truncated"),
    ]))));
    const truncated = await collect(
      createProvider().invokeStream(invocation()),
    );
    expect(truncated.at(-1)).toEqual({
      kind: "failed",
      error: expect.objectContaining({
        error_class: "stream_incomplete",
        code: "stream_ended_without_terminal",
      }),
    });
  });
});

interface CapturedRequest {
  url: string;
  method: string;
  headers: Headers;
  body?: Record<string, unknown>;
}

async function captureRequest(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<CapturedRequest> {
  const request = input instanceof Request
    ? input
    : new Request(input, init);
  const text = request.method === "GET"
    ? ""
    : await request.clone().text();
  return {
    url: request.url,
    method: request.method,
    headers: request.headers,
    ...(text ? { body: JSON.parse(text) as Record<string, unknown> } : {}),
  };
}

function createProvider(
  override: Partial<ConstructorParameters<typeof GeminiTextProvider>[0]> = {},
): GeminiTextProvider {
  return new GeminiTextProvider({
    apiKey: "configured-key",
    timeoutMs: 10_000,
    defaultModelId: "gemini-3.6-flash",
    projectId: "fixture-project",
    providerRegion: "global",
    providerAccountClass: "developer_free",
    ...override,
  });
}

function binding(
  override: Partial<AtlasModelBinding> = {},
): AtlasModelBinding {
  return {
    bindingId: "gemini-eval",
    publicModelId: "atlas-gemini-eval",
    providerId: "gemini",
    upstreamModelId: "gemini-3.6-flash",
    adapterId: GEMINI_INTERACTIONS_ADAPTER_ID,
    adapterVersion: GEMINI_INTERACTIONS_ADAPTER_VERSION,
    displayName: "Atlas Gemini Evaluation",
    displayTier: "fast",
    bindingExposure: "internal_evaluation",
    status: "available",
    capabilities: {
      streaming: true,
      tools: false,
      vision: false,
      maxContextTokens: 200_000,
      maxOutputTokens: 8_192,
    },
    credentialPolicy: "local",
    dataHandlingProfileId:
      "gemini-developer-free-interactions-store-false-v1",
    routingPolicyId: "no-fallback-v1",
    allowedDataClasses: ["synthetic"],
    allowedRegions: ["global"],
    providerRegion: "global",
    providerAccountClass: "developer_free",
    priceVersion: "google-gemini-api-public-pricing-2026-07-23",
    inputPricePerMtokUsd: 1.5,
    cacheReadPricePerMtokUsd: 0.15,
    cacheWritePricePerMtokUsd: null,
    outputPricePerMtokUsd: 7.5,
    reasoningPricePerMtokUsd: 7.5,
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
      safetyIdentifier: "a".repeat(64),
      promptVersion: "fixture",
    },
    ...override,
  };
}

async function collect(
  stream: AsyncIterable<CanonicalStreamEvent> | undefined,
): Promise<CanonicalStreamEvent[]> {
  const events: CanonicalStreamEvent[] = [];
  if (!stream) return events;
  for await (const event of stream) events.push(event);
  return events;
}

function fixtureResponse(name: string): Response {
  return sseResponse(readFileSync(
    new URL(`./fixtures/gemini/${name}`, import.meta.url),
    "utf8",
  ));
}

function sseResponse(body: string): Response {
  return new Response(body, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

function googleErrorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({
    error: {
      code: status,
      message,
      status: status === 429 ? "RESOURCE_EXHAUSTED" : "ERROR",
    },
  }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function eventsToSse(
  events: readonly Record<string, unknown>[],
): string {
  return `${events.map((event) => (
    `event: ${String(event["event_type"])}\ndata: ${JSON.stringify(event)}\n\n`
  )).join("")}event: done\ndata: [DONE]\n\n`;
}

function eventToSse(event: Record<string, unknown>): string {
  return `event: ${String(event["event_type"])}\n`
    + `data: ${JSON.stringify(event)}\n\n`;
}

function createdEvent(id: string): Record<string, unknown> {
  return {
    event_type: "interaction.created",
    interaction: {
      id,
      model: "gemini-3.6-flash",
      status: "in_progress",
      service_tier: "standard",
    },
  };
}

function fixtureUsage(): Record<string, number> {
  return {
    total_input_tokens: 5,
    total_cached_tokens: 0,
    total_output_tokens: 1,
    total_thought_tokens: 0,
    total_tool_use_tokens: 0,
    total_tokens: 6,
  };
}
