import { describe, expect, it } from "vitest";

import * as composites from "../composites";
import * as data from "../data";
import * as ui from "../index";
import * as layout from "../layout";
import * as primitives from "../primitives";
import { formatRelativeAbbrev } from "../primitives/RelativeTimeCell";

describe("@athyper/ui exports", () => {
  it("exposes the primary primitive, data, layout, and composite entry points", () => {
    expect(primitives.Button).toBeDefined();
    expect(primitives.Input).toBeDefined();
    expect(data.DataTable).toBeDefined();
    expect(layout.PageFrame).toBeDefined();
    expect(composites.SearchInput).toBeDefined();
    expect(composites.AdvancedEntityChooserPanel).toBeDefined();
    expect(ui.SearchInput).toBeDefined();
    expect(ui.AdvancedEntityChooserPanel).toBeDefined();
  });

  it("formats compact relative time without reading the clock during tests", () => {
    const now = new Date("2026-06-03T12:00:00.000Z").getTime();

    expect(formatRelativeAbbrev(new Date("2026-06-03T11:59:30.000Z"), now)).toBe("now");
    expect(formatRelativeAbbrev(new Date("2026-06-03T11:55:00.000Z"), now)).toBe("5m");
    expect(formatRelativeAbbrev(new Date("2026-06-03T09:00:00.000Z"), now)).toBe("3h");
  });
});
