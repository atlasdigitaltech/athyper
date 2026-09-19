import { describe, expect, it } from "vitest";
import { roleCompanyQueryKey } from "./business-partner-360-role-client";
describe("Business Partner 360 scoped role client", () => {
  it("invalidates scoped company queries without changing global identity keys", () => {
    const base = {
      tenantId: "tenant-1",
      principalId: "principal-1",
      businessPartnerId: "bp-1",
      sectionCode: "supplier-company" as const,
      roleLens: "supplier" as const,
      operatingOrganizationId: "org-1",
      companyCodeId: "company-1",
      authEpoch: 3,
    };
    expect(
      roleCompanyQueryKey({ ...base, operatingOrganizationId: "org-2" }),
    ).not.toEqual(roleCompanyQueryKey(base));
    expect(
      roleCompanyQueryKey({ ...base, companyCodeId: "company-2" }),
    ).not.toEqual(roleCompanyQueryKey(base));
  });
  it("isolates supplier and customer company caches", () => {
    const base = {
      tenantId: "tenant-1",
      principalId: "principal-1",
      businessPartnerId: "bp-1",
      sectionCode: "supplier-company" as const,
      roleLens: "all" as const,
      operatingOrganizationId: "org-1",
      companyCodeId: "company-1",
      authEpoch: 3,
    };
    expect(
      roleCompanyQueryKey({ ...base, sectionCode: "customer-company" }),
    ).not.toEqual(roleCompanyQueryKey(base));
  });
});
