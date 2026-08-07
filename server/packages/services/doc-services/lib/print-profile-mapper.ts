import type { PdfRenderOptions } from "@athyper/platform-rendering";

const PAPER_SIZES: Record<string, { width: number; height: number }> = {
  A3:     { width: 11.69, height: 16.54 },
  A4:     { width: 8.27,  height: 11.69 },
  A5:     { width: 5.83,  height: 8.27 },
  B4:     { width: 9.84,  height: 13.90 },
  Letter: { width: 8.5,   height: 11 },
  Legal:  { width: 8.5,   height: 14 },
};

const MARGINS: Record<string, string> = {
  none:   "0",
  narrow: "0.5",
  normal: "1",
  wide:   "1.5",
};

interface PrintProfileRow {
  paper_size:   string;
  orientation:  string;
  margins:      string;
  header_footer: boolean;
  background_graphics: boolean;
}

export function mapProfileToRenderOptions(profile: PrintProfileRow): PdfRenderOptions {
  const landscape = profile.orientation === "landscape";
  const paper     = PAPER_SIZES[profile.paper_size] ?? PAPER_SIZES["A4"]!;
  const margin    = MARGINS[profile.margins] ?? MARGINS["normal"]!;

  return {
    format:             (profile.paper_size as PdfRenderOptions["format"]) ?? "A4",
    landscape,
    printBackground:    profile.background_graphics,
    displayHeaderFooter: profile.header_footer,
    margin: {
      top:    margin + "in",
      bottom: margin + "in",
      left:   (parseFloat(margin) * 0.8).toFixed(2) + "in",
      right:  (parseFloat(margin) * 0.8).toFixed(2) + "in",
    },
  };
}

export const DEFAULT_RENDER_OPTIONS: PdfRenderOptions = {
  format:          "A4",
  landscape:       false,
  printBackground: true,
  margin: {
    top: "1in", bottom: "1in", left: "0.8in", right: "0.8in",
  },
};
