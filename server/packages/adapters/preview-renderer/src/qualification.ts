import type { DerivativeRenderer } from "@athyper/server-contract-derivatives";

/** Real clean source conversion; a generic HTTP health endpoint cannot pass. */
export async function qualifyPreviewRenderer(renderer: DerivativeRenderer): Promise<void> {
  const content = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAFElEQVR4nGP8//8/AwwwMSAB3BwAlm4DBfIlvvkAAAAASUVORK5CYII=", "base64");
  const base = { content, sourceContentType: "image/png", specificationHash: "0".repeat(64) };
  const render: DerivativeRenderer["render"] = async input => {
    for (let attempt = 0; ; attempt++) {
      try { return await renderer.render(input); }
      catch (error) {
        if (attempt >= 5 || !(error instanceof Error) || !("statusCode" in error) || error.statusCode !== 429) throw error;
        await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
  };
  const pdf = await render({ ...base, renditionCode: "preview_default" });
  if (pdf.contentType !== "application/pdf" || Buffer.from(pdf.bytes.subarray(0, 5)).toString() !== "%PDF-") throw new Error("Preview renderer failed clean PDF qualification");
  const image = await render({ ...base, content: pdf.bytes, sourceContentType: "application/pdf", renditionCode: "thumbnail_sm" });
  const signature = Buffer.from(image.bytes);
  if (image.contentType !== "image/webp" || signature.toString("ascii", 0, 4) !== "RIFF" || signature.toString("ascii", 8, 12) !== "WEBP" || !image.width || !image.height) throw new Error("Preview renderer failed clean first-page qualification");
}
