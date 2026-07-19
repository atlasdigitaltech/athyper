import { describe, expect, it } from "vitest";
import { runtimeTableChrome, runtimeTableContentClassName } from "../table-chrome";

describe("runtime table chrome", () => {
  it("provides a local query viewport for scrollport-sized attached chrome", () => {
    expect(runtimeTableChrome.viewport).toContain("[container-type:inline-size]");
    expect(runtimeTableChrome.viewport).toContain("min-w-0");
  });

  it("allows desktop list and wide table modes to form a content-width sticky boundary", () => {
    expect(runtimeTableContentClassName("list")).toContain("md:w-max");
    expect(runtimeTableContentClassName("list")).toContain("md:min-w-full");
    expect(runtimeTableContentClassName("excel")).toContain("w-max");
    expect(runtimeTableContentClassName("excel")).toContain("min-w-full");
    expect(runtimeTableContentClassName("compact")).not.toContain("w-max");
  });

  it("keeps attached footers aligned to the visible query viewport", () => {
    expect(runtimeTableChrome.footerAttached).toContain("sticky");
    expect(runtimeTableChrome.footerAttached).toContain("left-0");
    expect(runtimeTableChrome.footerAttached).toContain("w-[100cqw]");
    expect(runtimeTableChrome.footerDetached).toContain("relative");
    expect(runtimeTableChrome.footerDetached).toContain("w-full");
  });

  it("keeps column-header controls grouped instead of pushing filters to the far edge", () => {
    expect(runtimeTableChrome.headerContent).toContain("gap-0.5");
    expect(runtimeTableChrome.headerButton).toContain("min-w-0");
    expect(runtimeTableChrome.headerButton).not.toContain("flex-1");
  });

  it("uses opaque semantic backgrounds for sticky headers", () => {
    for (const className of [
      runtimeTableChrome.head,
      runtimeTableChrome.headerCell,
      runtimeTableChrome.selectHeaderCell,
      runtimeTableChrome.favoriteHeaderCell,
      runtimeTableChrome.metaHeaderCell,
    ]) {
      expect(className).toMatch(/(?:^|\s)bg-muted(?:\s|$)/);
      expect(className).not.toContain("bg-muted/");
    }
  });
});
