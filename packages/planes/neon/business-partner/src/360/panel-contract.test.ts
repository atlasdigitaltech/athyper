import { BUSINESS_PARTNER_360_PANEL } from "./panel-definition";
import { describe, expect, it } from "vitest";
import {
  parseRecord360Panel,
  parseEntityRecordPresentation,
} from "@athyper/contract-platform-entity-runtime";
import { certificateValidity } from "./components/commercial-controls";

describe("published 360 panel", () => {
  it("rejects unknown providers and ambiguous navigation", () => {
    expect(() =>
      parseRecord360Panel({
        ...BUSINESS_PARTNER_360_PANEL,
        sidebar: [{ key: "bank", label: "Bank", provider: "sql" }],
      }),
    ).toThrow("Unregistered");
    expect(() =>
      parseRecord360Panel({
        ...BUSINESS_PARTNER_360_PANEL,
        sections: [...BUSINESS_PARTNER_360_PANEL.sections, "comments"],
      }),
    ).toThrow("both");
    expect(() =>
      parseRecord360Panel({
        ...BUSINESS_PARTNER_360_PANEL,
        sections: ["overview", "overview"],
      }),
    ).toThrow("Duplicate");
  });
  it("validates references through the existing Meta presentation parser", () => {
    expect(() =>
      parseEntityRecordPresentation({
        schemaVersion: 1,
        titleField: "name",
        panel: BUSINESS_PARTNER_360_PANEL,
        sections: [],
      }),
    ).toThrow("Unknown 360 section");
    const keys = [
      ...BUSINESS_PARTNER_360_PANEL.sections,
      ...BUSINESS_PARTNER_360_PANEL.tabs.flatMap((tab) =>
        tab.sectionKey ? [tab.sectionKey] : [],
      ),
    ];
    const value = parseEntityRecordPresentation({
      schemaVersion: 1,
      titleField: "name",
      panel: BUSINESS_PARTNER_360_PANEL,
      sections: keys.map((key) => ({
        key,
        label: key,
        fields: [],
        placement: "direct",
      })),
    });
    expect(value.panel?.tabs.map((tab) => tab.label)).toEqual([
      "360 View",
      "Roles & scope",
      "Requests",
      "Business Transactions",
      "Activity",
      "Comments",
      "Attachments",
    ]);
    expect(value.panel?.sections).not.toContain("customer-company");
    expect(value.panel?.tabs.find(t=>t.key==="roles")?.sectionKey).toBe("roles-scope");
    expect(value.panel?.sections).toContain("credit");
  });
});
describe("certificate validity", () => {
  it("uses the selected business date and keeps validity separate from verification", () => {
    expect(
      certificateValidity(
        { effectiveUntil: "2026-09-08", status: "verified" },
        "2026-09-08",
      ),
    ).toBe("Expired");
    expect(
      certificateValidity({ effectiveUntil: "2026-09-30" }, "2026-09-08"),
    ).toBe("Expiring soon");
    expect(
      certificateValidity({ effectiveUntil: "2026-09-30" }, "2026-05-01"),
    ).toBe("Within validity period");
    expect(
      certificateValidity({ effectiveFrom: "2026-10-01" }, "2026-09-08"),
    ).toBe("Not yet valid");
    expect(certificateValidity({}, "2026-09-08")).toBe(
      "Validity not specified",
    );
  });
});
