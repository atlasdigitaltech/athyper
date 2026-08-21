import { describe, expect, it, vi } from "vitest";

import { RendererUnavailableError, createRenderingService } from "../rendering-service.js";

describe("rendering service", () => {
  it("fails explicitly when no renderer is composed", async () => {
    await expect(
      createRenderingService().renderPdf({ html: "<p>Invoice</p>" }),
    ).rejects.toBeInstanceOf(RendererUnavailableError);
  });

  it("delegates conversion without taking template or storage ownership", async () => {
    const renderPdf = vi.fn().mockResolvedValue({
      bytes: new Uint8Array([1]),
      mediaType: "application/pdf",
      provider: "gotenberg",
      durationMs: 10,
    });
    const service = createRenderingService({
      renderPdf,
      health: vi.fn().mockResolvedValue({ status: "healthy" }),
    });
    await service.renderPdf({ html: "<p>Invoice</p>" });
    expect(renderPdf).toHaveBeenCalledWith({ html: "<p>Invoice</p>" });
    await expect(service.isAvailable()).resolves.toBe(true);
  });
});
