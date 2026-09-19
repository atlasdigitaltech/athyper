import { describe, expect, it } from "vitest";
import { summaryQueryKey } from "./business-partner-360-client";
describe("Business Partner 360 client identity", () => {
  it("invalidates by BP, deterministic scope, as-of and permission epoch", () => {
    const base = {
      tenantId: "tenant-1",
      principalId: "principal-1",
      businessPartnerId: "bp-1",
      roleLens: "supplier" as const,
      operatingOrganizationId: "org-1",
      companyCodeId: "company-1",
      legalEntityId: "legal-1",
      asOf: "2026-08-30",
      authEpoch: 4,
    };
    const key = summaryQueryKey(base);
    expect(key).toEqual([
      "business-partner-360",
      "tenant-1",
      "principal-1",
      "bp-1",
      "summary",
      "supplier",
      "org-1",
      "company-1",
      "legal-1",
      "2026-08-30",
      4,
    ]);
    expect(summaryQueryKey({ ...base, authEpoch: 5 })).not.toEqual(key);
    expect(summaryQueryKey({ ...base, businessPartnerId: "bp-2" })).not.toEqual(
      key,
    );
  });
});
