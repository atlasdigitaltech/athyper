import { describe, expect, it, vi } from "vitest";
import { createMeilisearchIndex } from "../index.js";

const document = {
  id: "x",
  planeKey: "neon",
  tenantId: "t",
  attachmentId: "a",
  entityType: "invoice",
  entityId: "e",
  title: "Invoice",
  text: "body",
  contentType: "application/pdf",
  fileName: "a.pdf",
  piiTypes: [],
  updatedAt: "2026-08-09T00:00:00Z",
} as const;
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("Meilisearch index", () => {
  it("uses a stable legal storage ID for writes and deletes without collapsing scoped identities", async () => {
    const fetch = vi.fn(async (url: string, _init?: RequestInit) => url.endsWith("/tasks/7") ? json({uid:7,status:"succeeded"}) : json({taskUid:7},202));
    const index=createMeilisearchIndex({baseUrl:"http://searchcore:7700",apiKey:"test",taskPollIntervalMs:0,fetch:fetch as never});
    const id="neon:tenant:attachment";
    await index.upsert({...document,id});await index.upsert({...document,id});await index.upsert({...document,id:"mesh:tenant:attachment"});await index.remove(id);
    const first=JSON.parse(String(fetch.mock.calls[0]![1]!.body))[0].id;
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(String(fetch.mock.calls[2]![1]!.body))[0].id).toBe(first);
    expect(JSON.parse(String(fetch.mock.calls[4]![1]!.body))[0].id).not.toBe(first);
    expect(fetch.mock.calls[6]![0]).toBe(`http://searchcore:7700/indexes/documents/documents/${first}`);
  });
  it("forces plane and tenant filters server-side", async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ hits: [], estimatedTotalHits: 0, processingTimeMs: 2 }),
    );
    const index = createMeilisearchIndex({
      baseUrl: "http://searchcore:7700",
      apiKey: "secret",
      fetch: fetch as never,
    });
    await index.search({
      planeKey: "mesh",
      tenantId: "tenant-1",
      text: "invoice",
      entityTypes: ["invoice"],
      limit: 20,
      offset: 0,
    });
    const body = JSON.parse(String(fetch.mock.calls[0]![1]!.body)) as {
      filter: string[];
    };
    expect(body.filter).toEqual(
      expect.arrayContaining([
        'plane_key = "mesh"',
        'tenant_id = "tenant-1"',
        'entity_type IN ["invoice"]',
      ]),
    );
  });
  it("waits for an accepted write task and never puts the key in the body", async () => {
    const fetch = vi.fn(async (url: string, _init?: RequestInit) =>
      url.endsWith("/tasks/7")
        ? json({ uid: 7, status: "succeeded" })
        : json({ taskUid: 7 }, 202),
    );
    const index = createMeilisearchIndex({
      baseUrl: "http://searchcore:7700",
      apiKey: "master-secret",
      taskPollIntervalMs: 0,
      fetch: fetch as never,
    });
    await index.upsert(document);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[0]![1]!.body)).not.toContain(
      "master-secret",
    );
    expect(fetch.mock.calls[1]?.[0]).toBe("http://searchcore:7700/tasks/7");
  });
  it("polls an enqueued task until it succeeds", async () => {
    let polls = 0;
    const fetch = vi.fn(async (url: string) => {
      if (!url.endsWith("/tasks/8")) return json({ taskUid: 8 }, 202);
      polls++;
      return json({ uid: 8, status: polls === 1 ? "enqueued" : "succeeded" });
    });
    const index = createMeilisearchIndex({
      baseUrl: "http://searchcore:7700",
      apiKey: "secret",
      taskPollIntervalMs: 0,
      fetch: fetch as never,
    });
    await index.remove("x");
    expect(polls).toBe(2);
  });
  it("surfaces asynchronous task failures", async () => {
    const fetch = vi.fn(async (url: string) =>
      url.endsWith("/tasks/9")
        ? json({
            uid: 9,
            status: "failed",
            error: {
              code: "invalid_document",
              message: "document is too large",
            },
          })
        : json({ taskUid: 9 }, 202),
    );
    const index = createMeilisearchIndex({
      baseUrl: "http://searchcore:7700",
      apiKey: "secret",
      taskPollIntervalMs: 0,
      fetch: fetch as never,
    });
    await expect(index.upsert(document)).rejects.toThrow(
      "Meilisearch task 9 failed: document is too large",
    );
  });
  it("creates an absent index and waits for settings", async () => {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/indexes/documents") && !init?.method)
        return json({}, 404);
      if (url.endsWith("/tasks/1"))
        return json({ uid: 1, status: "succeeded" });
      if (url.endsWith("/tasks/2"))
        return json({ uid: 2, status: "succeeded" });
      return json({ taskUid: JSON.parse(String(init?.body)).uid ? 1 : 2 }, 202);
    });
    const index = createMeilisearchIndex({
      baseUrl: "http://searchcore:7700",
      apiKey: "secret",
      taskPollIntervalMs: 0,
      fetch: fetch as never,
    });
    await index.initialize();
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      "http://searchcore:7700/indexes/documents",
      "http://searchcore:7700/indexes",
      "http://searchcore:7700/tasks/1",
      "http://searchcore:7700/indexes/documents/settings",
      "http://searchcore:7700/tasks/2",
    ]);
  });
  it("does not enqueue duplicate creation for an existing index", async () => {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/tasks/2"))
        return json({ uid: 2, status: "succeeded" });
      if (url.endsWith("/indexes/documents") && !init?.method)
        return json({ uid: "documents" });
      return json({ taskUid: 2 }, 202);
    });
    const index = createMeilisearchIndex({
      baseUrl: "http://searchcore:7700",
      apiKey: "secret",
      taskPollIntervalMs: 0,
      fetch: fetch as never,
    });
    await index.initialize();
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      "http://searchcore:7700/indexes/documents",
      "http://searchcore:7700/indexes/documents/settings",
      "http://searchcore:7700/tasks/2",
    ]);
  });
  it("rejects malformed accepted task responses", async () => {
    const fetch = vi.fn(async () => json({}, 202));
    const index = createMeilisearchIndex({
      baseUrl: "http://searchcore:7700",
      apiKey: "secret",
      fetch: fetch as never,
    });
    await expect(index.upsert(document)).rejects.toThrow("valid taskUid");
  });

  // A body that never enqueues or closes, whose controller errors out once the request's
  // AbortSignal fires — mirrors how a real fetch implementation aborts an in-flight body read.
  function stalledBody(signal: AbortSignal) {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        signal.addEventListener("abort", () =>
          controller.error(new DOMException("aborted", "AbortError")),
        );
      },
    });
  }

  it("times out a stalled body on a 2xx response instead of hanging", async () => {
    const fetch = vi.fn(
      async (_url: string, init?: RequestInit) =>
        new Response(stalledBody(init?.signal as AbortSignal), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const index = createMeilisearchIndex({
      baseUrl: "http://searchcore:7700",
      apiKey: "secret",
      timeoutMs: 20,
      fetch: fetch as never,
    });
    await expect(
      index.search({
        planeKey: "neon",
        tenantId: "t",
        text: "x",
        limit: 10,
        offset: 0,
      }),
    ).rejects.toThrow();
  });

  it("times out a stalled body on an error response instead of hanging", async () => {
    const fetch = vi.fn(
      async (_url: string, init?: RequestInit) =>
        new Response(stalledBody(init?.signal as AbortSignal), { status: 500 }),
    );
    const index = createMeilisearchIndex({
      baseUrl: "http://searchcore:7700",
      apiKey: "secret",
      timeoutMs: 20,
      fetch: fetch as never,
    });
    await expect(
      index.search({
        planeKey: "neon",
        tenantId: "t",
        text: "x",
        limit: 10,
        offset: 0,
      }),
    ).rejects.toThrow();
  });

  it("close() aborts an in-flight body read, not just the pre-body fetch", async () => {
    let capturedSignal: AbortSignal | undefined;
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal as AbortSignal;
      return new Response(stalledBody(capturedSignal), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const index = createMeilisearchIndex({
      baseUrl: "http://searchcore:7700",
      apiKey: "secret",
      timeoutMs: 60_000,
      fetch: fetch as never,
    });
    const pending = index.search({
      planeKey: "neon",
      tenantId: "t",
      text: "x",
      limit: 10,
      offset: 0,
    });
    await vi.waitFor(() => expect(capturedSignal).toBeDefined());
    expect(capturedSignal!.aborted).toBe(false);
    index.close();
    expect(capturedSignal!.aborted).toBe(true);
    await expect(pending).rejects.toThrow();
  });
  it("reports a stalled health body as unhealthy", async () => {
    const fetch = vi.fn(
      async (_url: string, init?: RequestInit) =>
        new Response(stalledBody(init?.signal as AbortSignal), { status: 200 }),
    );
    const index = createMeilisearchIndex({
      baseUrl: "http://searchcore:7700",
      apiKey: "secret",
      timeoutMs: 20,
      fetch: fetch as never,
    });
    expect((await index.health()).status).toBe("unhealthy");
  });

  it("does not continue initialization after its status probe times out", async () => {
    const fetch = vi.fn(
      async (_url: string, init?: RequestInit) =>
        new Response(stalledBody(init?.signal as AbortSignal), { status: 404 }),
    );
    const index = createMeilisearchIndex({
      baseUrl: "http://searchcore:7700",
      apiKey: "secret",
      timeoutMs: 20,
      fetch: fetch as never,
    });
    await expect(index.initialize()).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reports health as unhealthy when close aborts its body", async () => {
    let started!: () => void;
    const reading = new Promise<void>((resolve) => {
      started = resolve;
    });
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      started();
      return new Response(stalledBody(init?.signal as AbortSignal), {
        status: 200,
      });
    });
    const index = createMeilisearchIndex({
      baseUrl: "http://searchcore:7700",
      apiKey: "secret",
      fetch: fetch as never,
    });
    const pending = index.health();
    await reading;
    index.close();
    expect((await pending).status).toBe("unhealthy");
  });

  it.each(["search", "upsert", "remove", "initialize", "health"] as const)(
    "bounds oversized %s responses and cancels upstream",
    async (operation) => {
      const cancel = vi.fn();
      const response = new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(5000));
          },
          cancel,
        }),
      );
      const index = createMeilisearchIndex({
        baseUrl: "http://searchcore:7700",
        apiKey: "secret",
        maxResponseBytes: 32,
        fetch: (async () => response) as never,
      });
      if (operation === "health")
        expect(await index.health()).toMatchObject({
          status: "unhealthy",
          message: expect.stringContaining("exceeds"),
        });
      else {
        const pending =
          operation === "search"
            ? index.search({
                planeKey: "neon",
                tenantId: "t",
                text: "x",
                limit: 1,
                offset: 0,
              })
            : operation === "upsert"
              ? index.upsert(document)
              : operation === "remove"
                ? index.remove("x")
                : index.initialize();
        await expect(pending).rejects.toThrow("exceeds");
      }
      expect(cancel).toHaveBeenCalledOnce();
    },
  );
  it("caps error bodies instead of fully buffering before truncation", async () => {
    const cancel = vi.fn();
    const fetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new Uint8Array(4097));
          },
          cancel,
        }),
        { status: 500 },
      );
    const index = createMeilisearchIndex({
      baseUrl: "http://searchcore:7700",
      apiKey: "secret",
      fetch: fetch as never,
    });
    await expect(
      index.search({
        planeKey: "neon",
        tenantId: "t",
        text: "x",
        limit: 1,
        offset: 0,
      }),
    ).rejects.toThrow("exceeds 4096");
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("accepts an exact-limit JSON body split across UTF-8 chunks", async () => {
    const payload = new TextEncoder().encode(
      JSON.stringify({ hits: [], estimatedTotalHits: 0, note: "é" }),
    );
    const split = payload.indexOf(195) + 1;
    const fetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(payload.subarray(0, split));
            c.enqueue(payload.subarray(split));
            c.close();
          },
        }),
      );
    const index = createMeilisearchIndex({
      baseUrl: "http://searchcore:7700",
      apiKey: "secret",
      maxResponseBytes: payload.length,
      fetch: fetch as never,
    });
    expect(
      (
        await index.search({
          planeKey: "neon",
          tenantId: "t",
          text: "x",
          limit: 1,
          offset: 0,
        })
      ).hits,
    ).toEqual([]);
  });
  it("times out a non-cooperative body without waiting for stuck cancellation", async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const fetch = async () =>
      new Response(new ReadableStream<Uint8Array>({ cancel }));
    const index = createMeilisearchIndex({
      baseUrl: "http://searchcore:7700",
      apiKey: "secret",
      timeoutMs: 20,
      fetch: fetch as never,
    });
    await expect(
      index.search({
        planeKey: "neon",
        tenantId: "t",
        text: "x",
        limit: 1,
        offset: 0,
      }),
    ).rejects.toThrow();
    expect(cancel).toHaveBeenCalledOnce();
  });
});
