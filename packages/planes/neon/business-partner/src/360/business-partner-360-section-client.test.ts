import { describe, expect, it } from "vitest";
import { sectionQueryKey } from "./business-partner-360-section-client";
describe("Business Partner 360 common section client", () => {
  it("isolates global section pages by record, date, permission epoch, and opaque cursor", () => {
    const query = {
      tenantId: "tenant-1",
      principalId: "principal-1",
      businessPartnerId: "bp-1",
      sectionCode: "contacts" as const,
      roleLens: "all" as const,
      authEpoch: 9,
      asOf: "2026-08-30",
      cursor: "opaque-page-2",
    };
    expect(sectionQueryKey(query)).toEqual([
      "business-partner-360",
      "tenant-1",
      "principal-1",
      "bp-1",
      "contacts",
      "all",
      "global",
      "no-company",
      "no-legal-entity",
      "2026-08-30",
      9,
      "opaque-page-2",
    ]);
    expect(sectionQueryKey({ ...query, authEpoch: 10 })).not.toEqual(
      sectionQueryKey(query),
    );
    expect(sectionQueryKey({ ...query, sectionCode: "addresses" })).not.toEqual(
      sectionQueryKey(query),
    );
    expect(sectionQueryKey({ ...query, roleLens: "supplier", operatingOrganizationId: "org-2", companyCodeId: "company-2" })).not.toEqual(sectionQueryKey(query));
  });
});
