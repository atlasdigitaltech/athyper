import { describe, expect, expectTypeOf, it } from "vitest";
import type { PdfRenderRequest, PdfRenderer } from "../index.js";

describe("rendering contract API", () => {
  it("defines HTML-to-PDF without selecting an engine or storage", () => {
    const request = {
      html: "<!doctype html><html><body>Invoice</body></html>",
      documentName: "invoice.pdf",
      options: { format: "A4", marginsInches: { top: 0.4 } },
    } as const satisfies PdfRenderRequest;
    expect(request.options.format).toBe("A4");
    expectTypeOf<PdfRenderer>().toHaveProperty("renderPdf");
    expectTypeOf<PdfRenderer>().toHaveProperty("health");
  });
});
