import { describe, expect, it, vi } from "vitest";

import { createGotenbergRenderer } from "../gotenberg-renderer.js";
import { RenderingError } from "../rendering.error.js";

const PDF = new TextEncoder().encode("%PDF-1.7\nrendered");

describe("Gotenberg renderer", () => {
  it("renders validated HTML using a bounded multipart request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(PDF, {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
    );
    const renderer = createGotenbergRenderer(
      { baseUrl: "http://docrender:3000/" },
      {
        fetch: fetchMock,
        now: vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(125),
      },
    );

    const result = await renderer.renderPdf({
      html: "<!doctype html><p>Invoice</p>",
      documentName: "Invoice 1001.pdf",
      options: {
        format: "Letter",
        landscape: true,
        marginsInches: { top: 0.5 },
      },
    });
    expect(result).toMatchObject({
      mediaType: "application/pdf",
      provider: "gotenberg",
      durationMs: 25,
    });
    expect(Buffer.from(result.bytes).toString()).toContain("%PDF-");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://docrender:3000/forms/chromium/convert/html");
    expect(init.redirect).toBe("error");
    expect(init.headers).toEqual({
      "Gotenberg-Output-Filename": "Invoice-1001",
    });
    const form = init.body as FormData;
    expect(form.get("paperWidth")).toBe("11");
    expect(form.get("paperHeight")).toBe("8.5");
    expect(form.get("failOnHttpStatusCodes")).toBe("[499,599]");
    expect(form.get("failOnResourceLoadingFailed")).toBe("true");
  });

  it("rejects empty, oversized, and invalid options before calling Gotenberg", async () => {
    const fetchMock = vi.fn();
    const renderer = createGotenbergRenderer(
      { baseUrl: "http://docrender:3000", maxHtmlBytes: 10 },
      { fetch: fetchMock },
    );
    await expect(renderer.renderPdf({ html: " " })).rejects.toMatchObject({
      category: "invalid_input",
      retryable: false,
    });
    await expect(
      renderer.renderPdf({ html: "12345678901" }),
    ).rejects.toBeInstanceOf(RenderingError);
    await expect(
      renderer.renderPdf({ html: "ok", options: { scale: 3 } }),
    ).rejects.toThrow("scale");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects empty and non-PDF successful responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(new Uint8Array(), { status: 200 }))
      .mockResolvedValueOnce(
        new Response("<html>error</html>", { status: 200 }),
      );
    const renderer = createGotenbergRenderer(
      { baseUrl: "http://docrender:3000" },
      { fetch: fetchMock },
    );
    await expect(
      renderer.renderPdf({ html: "<p>x</p>" }),
    ).rejects.toMatchObject({ category: "invalid_output" });
    await expect(renderer.renderPdf({ html: "<p>x</p>" })).rejects.toThrow(
      "non-PDF",
    );
  });

  it("classifies provider throttling, bad input, and health", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response("bad html", { status: 400 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const renderer = createGotenbergRenderer(
      { baseUrl: "http://docrender:3000" },
      { fetch: fetchMock },
    );
    await expect(
      renderer.renderPdf({ html: "<p>x</p>" }),
    ).rejects.toMatchObject({ retryable: true });
    await expect(
      renderer.renderPdf({ html: "<p>x</p>" }),
    ).rejects.toMatchObject({ retryable: false });
    await expect(renderer.health()).resolves.toMatchObject({
      status: "healthy",
    });
  });

  it("preserves HTTP status classification when the diagnostic body cannot be read", async () => {
    const brokenBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("connection reset"));
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(brokenBody, { status: 400 }));
    const renderer = createGotenbergRenderer(
      { baseUrl: "http://docrender:3000" },
      { fetch: fetchMock },
    );
    await expect(
      renderer.renderPdf({ html: "<p>x</p>" }),
    ).rejects.toMatchObject({
      category: "invalid_input",
      retryable: false,
      statusCode: 400,
    });
  });

  it("truncates error diagnostics beyond 1024 bytes and cancels the remainder", async () => {
    // A stream that never closes on its own (cancel() is the only way out) proves the reader was
    // actually cancelled instead of having merely drained a stream that closed by itself.
    let cancelled = false;
    const long = "x".repeat(2_000);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode(long));
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(stream, { status: 429 }));
    const renderer = createGotenbergRenderer(
      { baseUrl: "http://docrender:3000" },
      { fetch: fetchMock },
    );
    const error = (await renderer
      .renderPdf({ html: "<p>x</p>" })
      .catch((caught: unknown) => caught)) as Error;
    expect(error.message).toContain("x".repeat(1_024));
    expect(error.message).not.toContain("x".repeat(1_025));
    expect(cancelled).toBe(true);
  });

  it("cancels at exactly 1024 diagnostic bytes without waiting for the stalled remainder", async () => {
    const diagnostic = "x".repeat(1_024);
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(diagnostic));
        // Leave the stream open without producing another chunk.
      },
      cancel,
    });
    const renderer = createGotenbergRenderer(
      { baseUrl: "http://docrender:3000" },
      {
        fetch: vi.fn().mockResolvedValue(new Response(stream, { status: 429 })),
      },
    );

    await expect(
      renderer.renderPdf({ html: "<p>x</p>" }),
    ).rejects.toMatchObject({
      name: "RenderingError",
      category: "transient",
      retryable: true,
      statusCode: 429,
      message: `Gotenberg rejected the render with HTTP 429: ${diagnostic}`,
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
  }, 1_000);

  it.each([
    {
      scenario: "declared PDF overflow",
      status: 200,
      declaredLength: "100",
      category: "invalid_output",
      retryable: false,
    },
    {
      scenario: "streamed PDF overflow",
      status: 200,
      declaredLength: undefined,
      category: "invalid_output",
      retryable: false,
    },
    {
      scenario: "truncated error diagnostics",
      status: 400,
      declaredLength: undefined,
      category: "invalid_input",
      retryable: false,
    },
  ])(
    "preserves the intended error when cancellation rejects during $scenario",
    async ({ status, declaredLength, category, retryable }) => {
      const cancel = vi.fn().mockRejectedValue(new Error("cleanup failed"));
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("x".repeat(2_000)));
        },
        cancel,
      });
      const renderer = createGotenbergRenderer(
        { baseUrl: "http://docrender:3000", maxPdfBytes: 10 },
        {
          fetch: vi.fn().mockResolvedValue(
            new Response(stream, {
              status,
              ...(declaredLength
                ? { headers: { "content-length": declaredLength } }
                : {}),
            }),
          ),
        },
      );

      await expect(
        renderer.renderPdf({ html: "<p>x</p>" }),
      ).rejects.toMatchObject({
        name: "RenderingError",
        category,
        retryable,
        statusCode: status,
        message:
          status === 400
            ? `Gotenberg rejected the render with HTTP 400: ${"x".repeat(1_024)}`
            : "Rendered PDF exceeds the output limit",
      });
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(stream.locked).toBe(false);
    },
  );

  it("streams a multi-chunk PDF, including a signature split across chunks", async () => {
    const part1 = new TextEncoder().encode("%P");
    const part2 = new TextEncoder().encode("DF-1.7\nrest of the document");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(part1);
        controller.enqueue(part2);
        controller.close();
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(stream, { status: 200 }));
    const renderer = createGotenbergRenderer(
      { baseUrl: "http://docrender:3000" },
      { fetch: fetchMock },
    );
    const result = await renderer.renderPdf({ html: "<p>x</p>" });
    expect(Buffer.from(result.bytes).toString()).toContain("%PDF-1.7");
  });

  it("accepts a PDF exactly at the configured byte limit", async () => {
    const pdf = new TextEncoder().encode(`%PDF-1.7${"a".repeat(2)}`);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(pdf, { status: 200 }));
    const renderer = createGotenbergRenderer(
      { baseUrl: "http://docrender:3000", maxPdfBytes: pdf.byteLength },
      { fetch: fetchMock },
    );
    await expect(
      renderer.renderPdf({ html: "<p>x</p>" }),
    ).resolves.toMatchObject({
      mediaType: "application/pdf",
    });
  });

  it("rejects a declared oversized response without buffering the body", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(PDF);
        controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "content-length": "999999999" },
      }),
    );
    const renderer = createGotenbergRenderer(
      { baseUrl: "http://docrender:3000", maxPdfBytes: 10 },
      { fetch: fetchMock },
    );
    await expect(
      renderer.renderPdf({ html: "<p>x</p>" }),
    ).rejects.toMatchObject({
      category: "invalid_output",
      retryable: false,
    });
    expect(cancelled).toBe(true);
  });

  it("rejects a streamed response that overflows without a trustworthy content-length", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(
          new TextEncoder().encode("%PDF-1.7 way more bytes than allowed here"),
        );
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(stream, { status: 200 }));
    const renderer = createGotenbergRenderer(
      { baseUrl: "http://docrender:3000", maxPdfBytes: 10 },
      { fetch: fetchMock },
    );
    await expect(
      renderer.renderPdf({ html: "<p>x</p>" }),
    ).rejects.toMatchObject({
      category: "invalid_output",
      retryable: false,
    });
    expect(cancelled).toBe(true);
  });

  it("rejects a streamed overflow even when content-length understates the actual size", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            "%PDF-1.7 way more bytes than declared here",
          ),
        );
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "content-length": "5" },
      }),
    );
    const renderer = createGotenbergRenderer(
      { baseUrl: "http://docrender:3000", maxPdfBytes: 10 },
      { fetch: fetchMock },
    );
    await expect(
      renderer.renderPdf({ html: "<p>x</p>" }),
    ).rejects.toMatchObject({
      category: "invalid_output",
      retryable: false,
    });
  });

  /**
   * ReadableStream discards any queued chunks the instant `error()` is called, so calling
   * `enqueue()` then `error()` within the same `start()` tick never lets a reader observe the
   * chunk — it fails on the very first `read()`. To exercise a genuine mid-transfer failure
   * (first `read()` succeeds, a later one fails), the stream must deliver the chunk on one
   * `pull()` and error on the next, i.e. after the consumer has already read it.
   */
  function chunkThenFail(
    bytes: Uint8Array,
    error: Error,
  ): ReadableStream<Uint8Array> {
    let delivered = false;
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!delivered) {
          delivered = true;
          controller.enqueue(bytes);
          return;
        }
        controller.error(error);
      },
    });
  }

  it("classifies a mid-transfer failure after a successful response as retryable", async () => {
    const stream = chunkThenFail(
      new TextEncoder().encode("%PDF-1.7"),
      new Error("socket hang up"),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(stream, { status: 200 }));
    const renderer = createGotenbergRenderer(
      { baseUrl: "http://docrender:3000" },
      { fetch: fetchMock },
    );
    await expect(
      renderer.renderPdf({ html: "<p>x</p>" }),
    ).rejects.toMatchObject({
      category: "unavailable",
      retryable: true,
    });
  });

  it("classifies a mid-transfer abort as a retryable timeout", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    const stream = chunkThenFail(
      new TextEncoder().encode("%PDF-1.7"),
      abortError,
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(stream, { status: 200 }));
    const renderer = createGotenbergRenderer(
      { baseUrl: "http://docrender:3000" },
      { fetch: fetchMock },
    );
    await expect(
      renderer.renderPdf({ html: "<p>x</p>" }),
    ).rejects.toMatchObject({
      category: "timeout",
      retryable: true,
    });
  });
});
