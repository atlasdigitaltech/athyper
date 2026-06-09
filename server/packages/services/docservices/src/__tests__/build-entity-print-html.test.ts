import { describe, expect, it } from "vitest";
import type { PrintIdentity, ResolvedPrintSection } from "@athyper/entity-print/core";
import { buildEntityPrintHtml } from "../../lib/build-entity-print-html.js";

const identity: PrintIdentity = {
  typeLabel: "Site",
  code: "SITE-001",
  name: "Main Site",
  subtitle: null,
  status: "active",
  pinnedFacts: [],
};

function section(
  key: string,
  label: string,
  pageSpan: "full" | "half",
  columns: 1 | 2 | 3 = 2,
): ResolvedPrintSection {
  return {
    key,
    label,
    page_span: pageSpan,
    columns,
    fields: [
      {
        name: `${key}_value`,
        label: `${label} Value`,
        data_type: "text",
        ui_type: "text",
      },
    ],
  };
}

describe("buildEntityPrintHtml", () => {
  it("renders explicit full-width sections before half sections in two-column mode", () => {
    const html = buildEntityPrintHtml({
      identity,
      sections: [
        section("reference", "Location & Structure", "half"),
        section("profile", "Site Details", "full"),
      ],
      record: {
        reference_value: "Warehouse",
        profile_value: "Distribution Center",
      },
      tenantName: "Athyper Group Holdings",
      printedAt: "Jun 2, 2026",
      twoColumn: true,
    });

    expect(html.indexOf("Site Details")).toBeLessThan(html.indexOf("Location &amp; Structure"));
  });

  it("uses resolved section column counts for field grids", () => {
    const html = buildEntityPrintHtml({
      identity,
      sections: [section("profile", "Site Details", "half", 3)],
      record: { profile_value: "Distribution Center" },
      tenantName: "Athyper Group Holdings",
      printedAt: "Jun 2, 2026",
    });

    expect(html).toContain("grid-template-columns:1fr 1fr 1fr");
  });
});
