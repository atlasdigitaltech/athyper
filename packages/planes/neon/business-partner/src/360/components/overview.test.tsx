import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Summary } from "../business-partner-360-client";
import { BusinessPartner360Provider } from "../business-partner-360-context";
import { Overview } from "./overview";
import { SectionStatePanel } from "./section-state";

vi.mock("./relationship-overview",()=>({RelationshipOverview:()=>null}));

const summary: Summary = {
  schemaVersion: 1,
  asOf: "2026-09-08",
  generatedAt: "2026-09-08",
  businessPartnerVersion: 1,
  scope: { businessPartnerId: "bp-1", asOf: "2026-09-08" },
  identity: {
    id: "bp-1",
    code: "BP-0001",
    category: "organization",
    displayName: "Northwind Industrial Supplies Ltd",
    lifecycleStatus: "active",
  },
  roles: [{ id: "role-1", code: "supplier", status: "active" }],
  identifiers: [
    {
      id: "tax-1",
      schemeCode: "business_registration",
      maskedValue: "••••5432",
      verified: true,
    },
  ],
  openWork: { activeRequestCount: 4, returnedRequestCount: 1 },
  recentActivity: [],
  provenance: [],
  sections: [{ code: "requests", authorization: "granted", state: "ready" }],
  completeness: {
    status: "incomplete",
    percent: 50,
    completeCount: 1,
    requiredCount: 2,
    restrictedCount: 0,
    readOnly: false,
    fingerprint: "test",
    recommended: [],
    required: [
      {
        code: "identity.name",
        fieldCode: "name",
        sectionCode: "identity",
        state: "missing",
        action: {
          code: "edit",
          label: "Add name",
          href: "/change",
          authority: "test",
          requestKind: "amend_partner",
          permission: "test",
        },
      },
    ],
  },
};
function render(value: Summary) {
  return renderToStaticMarkup(
    <BusinessPartner360Provider
      value={{
        summary: value,
        section: "overview",
        roleLens: "all",
        selectSection: () => {},
        selectRole: () => {},
      }}
    >
      <div className="bp360">
        <SectionStatePanel state="ready">
          <Overview summary={value} />
        </SectionStatePanel>
      </div>
    </BusinessPartner360Provider>,
  );
}

describe("Partner overview presentation", () => {
  it("leaves the page heading to the entity application and labels masked identifiers", () => {
    const html = render(summary);
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("Section summary");
    expect(html).toContain("Business registration: ");
    expect(html).toContain("••••5432");
    expect(html).toContain("View requests");
  });
  it("does not present unavailable completeness as a percentage", () => {
    const html = render({
      ...summary,
      completeness: {
        ...summary.completeness,
        status: "definition_unavailable",
      },
    });
    expect(html).toContain("Completeness guidance is currently unavailable.");
    expect(html).not.toContain("50%");
    expect(html).not.toContain('href="/change"');
  });
  it("keeps historical guidance read-only and restricted request navigation unavailable", () => {
    const html = render({
      ...summary,
      completeness: { ...summary.completeness, readOnly: true },
      sections: [
        { code: "requests", authorization: "restricted", state: "ready" },
      ],
    });
    expect(html).toContain("Historical view is read-only.");
    expect(html).not.toContain('href="/change"');
    expect(html).not.toContain("View requests");
  });
});
