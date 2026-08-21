import { describe, expect, it, vi } from "vitest";

import { createPreviewRendererAdapter } from "./preview-renderer-adapter.js";

describe("preview renderer adapter", () => {
  it("renders a bounded base64 response", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      contentType: "image/png",
      width: 10,
      height: 20,
      provider: "fixture",
      providerVersion: "1",
      durationMs: 3,
      bytes: "b2s=",
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const renderer = createPreviewRendererAdapter(
      { baseUrl: "https://renderer.example" },
      { fetch: fetch as typeof globalThis.fetch, now: () => 10 },
    );

    const result = await renderer.render({
      content: new Uint8Array([1]),
      sourceContentType: "application/pdf",
      renditionCode: "thumbnail_sm",
      specificationHash: "a".repeat(64),
    });

    expect(result).toMatchObject({ contentType: "image/png", width: 10, height: 20, provider: "fixture" });
    expect([...result.bytes]).toEqual([111, 107]);
  });

  it("rejects non-HTTP endpoints", () => {
    expect(() => createPreviewRendererAdapter({ baseUrl: "file:///tmp/renderer" })).toThrow("HTTP or HTTPS");
  });
});
