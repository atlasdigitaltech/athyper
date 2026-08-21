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
      { fetch: fetchMock, now: vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(125) },
    );

    const result = await renderer.renderPdf({
      html: "<!doctype html><p>Invoice</p>",
      documentName: "Invoice 1001.pdf",
      options: { format: "Letter", landscape: true, marginsInches: { top: 0.5 } },
    });
    expect(result).toMatchObject({ mediaType: "application/pdf", provider: "gotenberg", durationMs: 25 });
    expect(Buffer.from(result.bytes).toString()).toContain("%PDF-");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://docrender:3000/forms/chromium/convert/html");
    expect(init.redirect).toBe("error");
    expect(init.headers).toEqual({ "Gotenberg-Output-Filename": "Invoice-1001" });
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
    await expect(renderer.renderPdf({ html: "12345678901" })).rejects.toBeInstanceOf(RenderingError);
    await expect(renderer.renderPdf({ html: "ok", options: { scale: 3 } })).rejects.toThrow("scale");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects empty and non-PDF successful responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(new Uint8Array(), { status: 200 }))
      .mockResolvedValueOnce(new Response("<html>error</html>", { status: 200 }));
    const renderer = createGotenbergRenderer(
      { baseUrl: "http://docrender:3000" },
      { fetch: fetchMock },
    );
    await expect(renderer.renderPdf({ html: "<p>x</p>" })).rejects.toMatchObject({ category: "invalid_output" });
    await expect(renderer.renderPdf({ html: "<p>x</p>" })).rejects.toThrow("non-PDF");
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
    await expect(renderer.renderPdf({ html: "<p>x</p>" })).rejects.toMatchObject({ retryable: true });
    await expect(renderer.renderPdf({ html: "<p>x</p>" })).rejects.toMatchObject({ retryable: false });
    await expect(renderer.health()).resolves.toMatchObject({ status: "healthy" });
  });
});
