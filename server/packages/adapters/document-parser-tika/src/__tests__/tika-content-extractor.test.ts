import { describe, expect, it, vi } from "vitest";
import { createTikaContentExtractor } from "../index.js";

function stallingFetch(status = 200) {
  let streamController!: ReadableStreamDefaultController<Uint8Array>;
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
      },
    });
    init?.signal?.addEventListener("abort", () => {
      try {
        streamController.error(new DOMException("Aborted", "AbortError"));
      } catch {
        /* already closed */
      }
    });
    return new Response(body, {
      status,
      headers: { "content-type": "text/plain" },
    });
  });
  return fetch;
}

describe("Tika content extractor", () => {
  it("sends bounded bytes and normalizes extracted text", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(" hello\u0000 world ", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
    );
    const extractor = createTikaContentExtractor({
      baseUrl: "http://docparser:9998",
      fetch: fetch as never,
    });
    await expect(
      extractor.extract({
        content: new Uint8Array([1, 2]),
        contentType: "application/pdf",
        fileName: "a.pdf",
      }),
    ).resolves.toMatchObject({ text: "hello world", provider: "apache-tika" });
    expect(fetch).toHaveBeenCalledWith(
      "http://docparser:9998/tika",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("enforces input size before HTTP", async () => {
    const extractor = createTikaContentExtractor({
      baseUrl: "http://docparser:9998",
      maxInputBytes: 1,
      fetch: vi.fn() as never,
    });
    await expect(
      extractor.extract({
        content: new Uint8Array(2),
        contentType: "application/pdf",
      }),
    ).rejects.toMatchObject({ code: "EXTRACTION_SIZE_LIMIT" });
  });

  it("rejects immediately when the outer signal is already aborted, without ever calling fetch", async () => {
    const fetch = vi.fn(async () => new Response("ok"));
    const extractor = createTikaContentExtractor({
      baseUrl: "http://docparser:9998",
      fetch: fetch as never,
    });
    const controller = new AbortController();
    const reason = new Error("Caller cancelled");
    controller.abort(reason);
    await expect(
      extractor.extract({
        content: new Uint8Array([1]),
        contentType: "text/plain",
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "EXTRACTION_CANCELLED", cause: reason });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("times out a request whose body never finishes arriving", async () => {
    const fetch = stallingFetch();
    const extractor = createTikaContentExtractor({
      baseUrl: "http://docparser:9998",
      timeoutMs: 1,
      fetch: fetch as never,
    });
    await expect(
      extractor.extract({
        content: new Uint8Array([1]),
        contentType: "text/plain",
      }),
    ).rejects.toMatchObject({ code: "EXTRACTION_TIMEOUT" });
  });

  it("close() aborts a stalled body read that is still in flight", async () => {
    const fetch = stallingFetch();
    const extractor = createTikaContentExtractor({
      baseUrl: "http://docparser:9998",
      timeoutMs: 60_000,
      fetch: fetch as never,
    });
    const pending = extractor.extract({
      content: new Uint8Array([1]),
      contentType: "text/plain",
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    extractor.close();
    await expect(pending).rejects.toMatchObject({
      code: "EXTRACTION_CANCELLED",
      cause: expect.objectContaining({ message: "Tika extractor closed" }),
    });
  });
});

describe("Tika response lifecycle", () => {
  it.each([200, 503])(
    "keeps a stalled %s health body bounded",
    async (status) => {
      const extractor = createTikaContentExtractor({
        baseUrl: "http://docparser:9998",
        timeoutMs: 10,
        fetch: stallingFetch(status) as never,
      });
      await expect(extractor.health()).resolves.toMatchObject({
        status: "unhealthy",
        message: "Tika request exceeded 10 ms",
      });
    },
  );
  it.each([200, 503])("consumes a %s health response", async (status) => {
    const response = new Response("Tika greeting", { status });
    const fetch = vi.fn(async () => response);
    const extractor = createTikaContentExtractor({
      baseUrl: "http://docparser:9998",
      fetch: fetch as never,
    });
    await expect(extractor.health()).resolves.toMatchObject({
      status: status === 200 ? "healthy" : "unhealthy",
    });
    expect(response.bodyUsed).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "http://docparser:9998/tika",
      expect.objectContaining({ method: "GET" }),
    );
  });
  it("close cancels a health body still being consumed", async () => {
    const fetch = stallingFetch();
    const extractor = createTikaContentExtractor({
      baseUrl: "http://docparser:9998",
      fetch: fetch as never,
    });
    const pending = extractor.health();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    extractor.close();
    await expect(pending).resolves.toMatchObject({
      status: "unhealthy",
      message: "Tika request cancelled",
    });
  });
  it.each([200, 503])(
    "preserves caller cancellation during a %s body",
    async (status) => {
      const fetch = stallingFetch(status);
      const extractor = createTikaContentExtractor({
        baseUrl: "http://docparser:9998",
        fetch: fetch as never,
      });
      const controller = new AbortController();
      const reason = new Error("Job cancelled");
      const pending = extractor.extract({
        content: new Uint8Array([1]),
        contentType: "text/plain",
        signal: controller.signal,
      });
      const assertion = expect(pending).rejects.toMatchObject({
        code: "EXTRACTION_CANCELLED",
        cause: reason,
      });
      await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
      controller.abort(reason);
      await assertion;
    },
  );
  it("classifies a stalled error body as a timeout", async () => {
    const extractor = createTikaContentExtractor({
      baseUrl: "http://docparser:9998",
      timeoutMs: 10,
      fetch: stallingFetch(503) as never,
    });
    await expect(
      extractor.extract({
        content: new Uint8Array([1]),
        contentType: "text/plain",
      }),
    ).rejects.toMatchObject({ code: "EXTRACTION_TIMEOUT" });
  });
  it("retains the HTTP failure when the error body completes", async () => {
    const extractor = createTikaContentExtractor({
      baseUrl: "http://docparser:9998",
      fetch: vi.fn(async () => new Response("busy", { status: 503 })) as never,
    });
    await expect(
      extractor.extract({
        content: new Uint8Array([1]),
        contentType: "text/plain",
      }),
    ).rejects.toMatchObject({
      code: "EXTRACTION_FAILED",
      message: "Tika returned 503: busy",
    });
  });

  it("caps the success body at maxResponseBytes instead of buffering the whole response", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        // An effectively unbounded response: without a byte cap this would buffer forever.
        controller.enqueue(new TextEncoder().encode("x".repeat(1_000)));
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetch = vi.fn(
      async () =>
        new Response(body, {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
    );
    const extractor = createTikaContentExtractor({
      baseUrl: "http://docparser:9998",
      maxResponseBytes: 2_500,
      maxTextChars: 10_000,
      fetch: fetch as never,
    });
    const result = await extractor.extract({
      content: new Uint8Array([1]),
      contentType: "text/plain",
    });
    expect(result.text.length).toBeLessThanOrEqual(2_500);
    expect(result.text.length).toBeGreaterThan(0);
    expect(cancelled).toBe(true);
  });

  it("caps the error body length independently of maxResponseBytes", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode("e".repeat(1_000)));
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetch = vi.fn(async () => new Response(body, { status: 500 }));
    const extractor = createTikaContentExtractor({
      baseUrl: "http://docparser:9998",
      maxResponseBytes: 10_000_000,
      fetch: fetch as never,
    });
    await expect(
      extractor.extract({
        content: new Uint8Array([1]),
        contentType: "text/plain",
      }),
    ).rejects.toMatchObject({ code: "EXTRACTION_FAILED" });
    expect(cancelled).toBe(true);
  });
});
