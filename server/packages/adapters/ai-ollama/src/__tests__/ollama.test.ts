import { expect, it, vi } from "vitest";
import { LocalInferenceQueue, OllamaModelProvider } from "../index.js";
import type { AtlasProviderInvocation } from "@athyper/server-contract-ai";
const digest = "sha256:" + "a".repeat(64);
const invocation: AtlasProviderInvocation = {
  binding: {
    bindingId: "local",
    bindingRevision: digest,
    publicModelId: "atlas-re-1.0-local",
    providerId: "ollama",
    upstreamModelId: "qwen3:8b",
    modelDigest: digest,
    adapterId: "ollama-native",
    adapterVersion: "1",
    displayTier: "balanced",
    exposure: "product",
    status: "available",
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      structuredOutput: true,
      maxContextTokens: 4096,
      maxOutputTokens: 1024,
    },
    credentialPolicy: "local_transport",
    credentialOwnerId: "local",
    providerRegion: "local",
    dataHandlingProfileId: "local",
    routingPolicyId: "no-fallback-v1",
    allowedDataClasses: ["internal"],
    priceVersion: "local",
    inputPricePerMtokUsd: 0,
    outputPricePerMtokUsd: 0,
  },
  credential: {
    authMode: "local_transport",
    endpoint: "http://atlas-inference:11434",
    ownerId: "local",
    credentialId: null,
    credentialRevision: null,
  },
  prompt: {
    messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
    maxOutputTokens: 128,
  },
  trace: {
    runId: "r",
    providerCallId: "c",
    tenantId: "t",
    principalHash: "h",
    safetyIdentifier: "s",
    promptRevision: "p",
    policyRevision: "p",
  },
};
const final = {
  model: "qwen3:8b",
  done: true,
  done_reason: "stop",
  prompt_eval_count: 10,
  prompt_eval_cached_count: 3,
  eval_count: 2,
};
function setup(events: unknown[], overrides: Record<string, unknown> = {}) {
  const fetcher = vi.fn(async (url: any, options: any) => {
    const path = new URL(url).pathname;
    if (path === "/api/version") return Response.json({ version: "0.33.3" });
    if (path === "/api/tags")
      return Response.json({
        models: [{ name: "qwen3:8b", digest, ...overrides }],
      });
    if (path === "/api/ps")
      return Response.json({
        models: [
          {
            name: "qwen3:8b",
            context_length: 4096,
            digest,
            size: 10,
            size_vram: 10,
          },
        ],
      });
    expect(options.headers.authorization).toBeUndefined();
    expect(JSON.parse(options.body)).toMatchObject({
      think: false,
      options: { num_ctx: 4096, num_predict: 128 },
    });
    const bytes = new TextEncoder().encode(
      events.map((x) => JSON.stringify(x)).join("\n"),
    );
    return new Response(
      new ReadableStream({
        start(c) {
          for (let i = 0; i < bytes.length; i += 3)
            c.enqueue(bytes.slice(i, i + 3));
          c.close();
        },
      }),
    );
  }) as unknown as typeof fetch;
  return {
    provider: new OllamaModelProvider({
      modelDigest: digest,
      engineVersion: "0.33.3",
      fetch: fetcher,
    }),
    fetcher,
  };
}
async function collect(provider: OllamaModelProvider, input = invocation) {
  const values = [];
  for await (const e of provider.invoke(input)) values.push(e);
  return values;
}
it("streams split UTF-8/NDJSON without an API key and avoids double-counting cached tokens", async () => {
  const { provider } = setup([
    { model: "qwen3:8b", message: { content: "你好" } },
    final,
  ]);
  const events = await collect(provider);
  expect(events).toContainEqual({ kind: "text_delta", text: "你好" });
  expect(events).toContainEqual({
    kind: "usage",
    mode: "snapshot",
    final: true,
    usage: { inputTokens: 7, cacheReadTokens: 3, outputTokens: 2 },
  });
  expect(events.at(-1)).toEqual({ kind: "completed", reason: "stop" });
});
it("rejects missing terminal events and never invents final usage", async () => {
  const { provider } = setup([
    { model: "qwen3:8b", message: { content: "partial" } },
  ]);
  const events = await collect(provider);
  expect(events.at(-1)).toMatchObject({
    kind: "failed",
    error: { errorClass: "stream_incomplete" },
  });
  expect(events.some((e) => e.kind === "usage")).toBe(false);
});
it("rejects a changed artifact before generation", async () => {
  const { provider, fetcher } = setup([], { digest: "b".repeat(64) });
  expect((await collect(provider)).at(-1)).toMatchObject({
    kind: "failed",
    error: { code: "registry_digest_mismatch" },
  });
  expect(
    vi
      .mocked(fetcher)
      .mock.calls.some(([url]) => String(url).endsWith("/api/chat")),
  ).toBe(false);
});
it("rejects thinking output, invalid models and oversized output usage", async () => {
  for (const event of [
    { model: "wrong" },
    { model: "qwen3:8b", message: { thinking: "secret" } },
    { ...final, eval_count: 200 },
  ]) {
    const { provider } = setup([event]);
    expect((await collect(provider)).at(-1)).toMatchObject({
      kind: "failed",
      error: { errorClass: "protocol_error" },
    });
  }
});
it("converts complete native tool arguments into portable calls", async () => {
  const { provider } = setup([
    {
      model: "qwen3:8b",
      message: {
        tool_calls: [
          { function: { name: "lookup", arguments: { id: "synthetic" } } },
        ],
      },
    },
    final,
  ]);
  const events = await collect(provider, {
    ...invocation,
    prompt: {
      ...invocation.prompt,
      tools: [
        {
          name: "lookup",
          description: "lookup",
          inputSchema: { type: "object" },
        },
      ],
    },
  });
  expect(events).toContainEqual({
    kind: "tool_call_complete",
    callId: "c:0",
    toolName: "lookup",
    input: { id: "synthetic" },
  });
  expect(events.at(-1)).toEqual({ kind: "completed", reason: "tool_call" });
});
it("cancels a queued request and keeps bounded admission", async () => {
  const q = new LocalInferenceQueue(1, 1000),
    active = await q.acquire(new AbortController().signal),
    abort = new AbortController();
  const waiting = q.acquire(abort.signal);
  await expect(q.acquire(new AbortController().signal)).rejects.toThrow(
    "local_queue_full",
  );
  abort.abort(new Error("cancel"));
  await expect(waiting).rejects.toThrow("cancel");
  active();
  const release = await q.acquire(new AbortController().signal);
  release();
});
it("times out queued work without leaking the active slot", async () => {
  const q = new LocalInferenceQueue(1, 5),
    release = await q.acquire(new AbortController().signal);
  await expect(q.acquire(new AbortController().signal)).rejects.toThrow(
    "local_queue_timeout",
  );
  release();
  (await q.acquire(new AbortController().signal))();
});
it("pre-aborted invocations make no requests", async () => {
  const { provider, fetcher } = setup([]);
  const signal = AbortSignal.abort();
  expect((await collect(provider, { ...invocation, signal })).at(-1)).toEqual({
    kind: "cancelled",
  });
  expect(fetcher).not.toHaveBeenCalled();
});
it("prohibits cloud failover and rejects context overflow before dispatch", async () => {
  const { provider, fetcher } = setup([]);
  const input = {
    ...invocation,
    prompt: {
      ...invocation.prompt,
      messages: [
        {
          role: "user" as const,
          content: [{ type: "text" as const, text: "你".repeat(3000) }],
        },
      ],
    },
  };
  expect((await collect(provider, input)).at(-1)).toMatchObject({
    kind: "failed",
    error: { code: "context_budget_exceeded" },
  });
  expect(fetcher).not.toHaveBeenCalled();
  expect(
    (
      await collect(provider, {
        ...invocation,
        binding: {
          ...invocation.binding,
          routingPolicyId: "ordered-failover-v1",
          fallbackBindingIds: ["cloud"],
        },
      })
    ).at(-1),
  ).toMatchObject({
    kind: "failed",
    error: { code: "local_binding_mismatch" },
  });
});

it("distinguishes readiness policy failures without exposing prompt text", async () => {
  for (const [changed, code] of [
    [{ context_length: 8192 }, "context_length_mismatch"],
    [{ size_vram: 1 }, "gpu_residency_insufficient"],
    [{ digest: "b".repeat(64) }, "loaded_digest_mismatch"],
  ] as const) {
    const diagnostics: unknown[] = [];
    const f = setup([final]);
    const fetcher = async (url: any, init: any) =>
      String(url).endsWith("/api/ps")
        ? Response.json({
            models: [
              {
                name: "qwen3:8b",
                context_length: 4096,
                digest,
                size: 10,
                size_vram: 10,
                ...changed,
              },
            ],
          })
        : f.fetcher(url, init);
    const p = new OllamaModelProvider({
      modelDigest: digest,
      engineVersion: "0.33.3",
      fetch: fetcher as typeof fetch,
      observe: (e) => diagnostics.push(e),
    });
    expect((await collect(p)).at(-1)).toMatchObject({
      kind: "failed",
      error: { code },
    });
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ phase: "failed", code, modelDigest: digest }),
    );
    expect(JSON.stringify(diagnostics)).not.toContain('"Hi"');
  }
});
it("retries only missing residency warmup and reauthorizes before dispatch", async () => {
  let ps = 0,
    loads = 0,
    chats = 0;
  const reauthorize = vi.fn(async () => true);
  const f = setup([final]);
  const fetcher = async (url: any, init: any) => {
    if (String(url).endsWith("/api/ps") && ++ps < 3)
      return Response.json({ models: [] });
    if (String(url).endsWith("/api/generate")) {
      loads++;
      expect(JSON.parse(init.body)).not.toHaveProperty("prompt");
      return Response.json({ done: true });
    }
    if (String(url).endsWith("/api/chat")) chats++;
    return f.fetcher(url, init);
  };
  const p = new OllamaModelProvider({
    modelDigest: digest,
    engineVersion: "0.33.3",
    fetch: fetcher as typeof fetch,
  });
  expect(
    (await collect(p, { ...invocation, reauthorize })).at(-1),
  ).toMatchObject({ kind: "completed" });
  expect(loads).toBe(2);
  expect(chats).toBe(1);
  expect(reauthorize).toHaveBeenCalledTimes(4);
});
it("revocation after waiting prevents prompt dispatch", async () => {
  const f = setup([final]);
  const reauthorize = vi
    .fn()
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(false);
  const events = await collect(f.provider, { ...invocation, reauthorize });
  expect(events.at(-1)).toMatchObject({
    kind: "failed",
    error: { code: "authorization_changed" },
  });
  expect(
    vi
      .mocked(f.fetcher)
      .mock.calls.some(([url]) => String(url).endsWith("/api/chat")),
  ).toBe(false);
});
it("bounds repeated absent residency and never calls chat", async () => {
  let loads = 0;
  const f = setup([final]);
  const p = new OllamaModelProvider({
    modelDigest: digest,
    engineVersion: "0.33.3",
    readinessTimeoutMs: 15,
    readinessPollMs: 1,
    fetch: async (url: any, init: any) => {
      if (String(url).endsWith("/api/ps")) return Response.json({ models: [] });
      if (String(url).endsWith("/api/generate")) {
        loads++;
        return Response.json({ done: true });
      }
      return f.fetcher(url, init);
    },
  });
  expect(
    (await collect(p, { ...invocation, reauthorize: async () => true })).at(-1),
  ).toMatchObject({
    kind: "failed",
    error: { code: "readiness_deadline_exceeded" },
  });
  expect(loads).toBe(2);
});

it("accounts for a timed-out warmup and never retries its uncertain outcome", async () => {
  const f = setup([final]);
  let loads = 0;
  const p = new OllamaModelProvider({
    modelDigest: digest,
    engineVersion: "0.33.3",
    readinessTimeoutMs: 20,
    fetch: async (url: any, init: any) => {
      if (String(url).endsWith("/api/ps")) return Response.json({ models: [] });
      if (String(url).endsWith("/api/generate")) {
        loads++;
        return await new Promise<Response>((_resolve, reject) =>
          init.signal.addEventListener(
            "abort",
            () => reject(init.signal.reason),
            { once: true },
          ),
        );
      }
      return f.fetcher(url, init);
    },
  });
  const result = (
    await collect(p, { ...invocation, reauthorize: async () => true })
  ).at(-1);
  expect(result).toMatchObject({
    kind: "failed",
    error: { code: "readiness_deadline_exceeded", retryable: false },
  });
  if (result?.kind === "failed")
    expect(result.error.diagnostics?.loadDurationMs).toBeGreaterThan(0);
  expect(loads).toBe(1);
});

it("fails closed when reauthorization is unavailable without logging its error content", async () => {
  const f = setup([final]);
  const events = await collect(f.provider, {
    ...invocation,
    reauthorize: async () => {
      throw new Error("private service detail");
    },
  });
  expect(events.at(-1)).toMatchObject({
    kind: "failed",
    error: { code: "authorization_changed" },
  });
  expect(JSON.stringify(events)).not.toContain("private service detail");
  expect(f.fetcher).not.toHaveBeenCalled();
});

it("cancellation interrupts a stalled authorization check and releases capacity", async () => {
  const f = setup([final]),
    controller = new AbortController(),
    queue = new LocalInferenceQueue(1, 100);
  const provider = new OllamaModelProvider({
    modelDigest: digest,
    engineVersion: "0.33.3",
    fetch: f.fetcher,
    queue,
  });
  const pending = collect(provider, {
    ...invocation,
    signal: controller.signal,
    reauthorize: async () => await new Promise<boolean>(() => {}),
  });
  await new Promise((r) => setTimeout(r, 5));
  controller.abort();
  expect((await pending).at(-1)).toEqual({ kind: "cancelled" });
  expect(f.fetcher).not.toHaveBeenCalled();
  (await queue.acquire(new AbortController().signal))();
});

it('aborts an in-flight provider request when distributed ownership is lost', async () => {
  const { LocalError } = await import('../index.js');
  const f=setup([final]);let released=0,upstreamAborted=false;
  const provider=new OllamaModelProvider({modelDigest:digest,engineVersion:'0.33.3',queue:{async acquire(_signal,onLost){setTimeout(()=>onLost?.(new LocalError('overloaded','inference_admission_lost')),5);return async()=>{released++;};}},fetch:async(url:any,init:any)=>{
    if(String(url).endsWith('/api/chat'))return await new Promise<Response>((_resolve,reject)=>{const abort=()=>{upstreamAborted=true;reject(init.signal.reason);};init.signal.addEventListener('abort',abort,{once:true});if(init.signal.aborted)abort();});
    return f.fetcher(url,init);
  }});
  expect((await collect(provider)).at(-1)).toMatchObject({kind:'failed',error:{code:'inference_admission_lost',retryable:false}});
  expect(upstreamAborted).toBe(true);expect(released).toBe(1);
});
