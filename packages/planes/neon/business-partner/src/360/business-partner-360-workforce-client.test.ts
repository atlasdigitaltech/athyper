import { describe, expect, it } from "vitest";
import {
  isWorkforcePayloadSafe,
  workforceQueryKey,
} from "./business-partner-360-workforce-client";

describe("Business Partner 360 workforce client", () => {
  it("invalidates by record, scope, date, role, and permission epoch", () => {
    const query = {
      tenantId: "tenant-1",
      principalId: "principal-1",
      businessPartnerId: "bp-1",
      sectionCode: "workforce" as const,
      roleLens: "workforce" as const,
      operatingOrganizationId: "org-1",
      companyCodeId: "company-1",
      legalEntityId: "legal-1",
      asOf: "2026-08-30",
      authEpoch: 4,
    };
    const key = workforceQueryKey(query);
    expect(key).toEqual([
      "business-partner-360",
      "tenant-1",
      "principal-1",
      "bp-1",
      "workforce",
      "workforce",
      "org-1",
      "company-1",
      "legal-1",
      "2026-08-30",
      4,
    ]);
    expect(workforceQueryKey({ ...query, authEpoch: 5 })).not.toEqual(key);
    expect(
      workforceQueryKey({ ...query, businessPartnerId: "bp-2" }),
    ).not.toEqual(key);
  });
  it.each([
    "dateOfBirth",
    "nationalIdToken",
    "compensation",
    "billRate",
    "protectedAttributes",
  ])("rejects default payload field %s", (field) => {
    expect(isWorkforcePayloadSafe({ personal: { [field]: "secret" } })).toBe(
      false,
    );
  });
  it("accepts safe employment, assignment, case, engagement and placement coordinates", () => {
    expect(
      isWorkforcePayloadSafe({
        personal: { displayName: "Ada" },
        employments: [{ hireDate: "2026-01-01" }],
        assignments: [{ effectiveFrom: "2026-01-01" }],
        peopleCases: [{ kind: "onboarding" }],
        engagements: [
          { workerNumber: "CW-1", placements: [{ allocationPercent: 100 }] },
        ],
      }),
    ).toBe(true);
  });
});
