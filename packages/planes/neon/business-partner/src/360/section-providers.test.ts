import { describe, expect, it } from "vitest";
import { BUSINESS_PARTNER_360_PANEL, realignPartnerPanel } from "./panel-definition";
import { assertSectionProvidersRegistered } from "./section-providers";

describe("assertSectionProvidersRegistered", () => {
  it("passes for the real, published Business Partner 360 panel", () => {
    expect(() => assertSectionProvidersRegistered(BUSINESS_PARTNER_360_PANEL)).not.toThrow();
  });

  it("passes for the realigned panel used to upgrade older published layouts", () => {
    expect(() => assertSectionProvidersRegistered(realignPartnerPanel(BUSINESS_PARTNER_360_PANEL))).not.toThrow();
  });

  it("rejects a section reference with no matching renderSection provider", () => {
    expect(() =>
      assertSectionProvidersRegistered({
        sections: ["overview", "not-a-real-section"],
        tabs: [],
      }),
    ).toThrow(/Unregistered Business Partner 360 section provider.*not-a-real-section/);
  });

  it("rejects an unregistered section referenced only from a tab's sectionKey", () => {
    expect(() =>
      assertSectionProvidersRegistered({
        sections: ["overview"],
        tabs: [{ sectionKey: "made-up-tab-section" }],
      }),
    ).toThrow(/made-up-tab-section/);
  });
});
