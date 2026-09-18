import { describe, expect, it } from "vitest";
import type { PartnerAggregate } from "./client";
import {
  availableRoleExtensions,
  roleAuthoritySnapshot,
} from "./role-extension-experience";

function aggregate(
  roles: "none" | "supplier" | "customer" | "both",
): PartnerAggregate {
  return {
    provenance: [{
      plane: "neon",
      service: "master-data",
      sourceObject: "master.business_partner.aggregate_projection",
      observedAt: "2026-09-04T00:00:00Z",
    }],
    businessPartner: {
      id: "bp-1",
      code: "BP.R2",
      name: "R2 Organization",
      partnerCategory: "organization",
      aliases: [],
      status: "active",
      createdAt: "2026-09-04T00:00:00Z",
    },
    suppliers:
      roles === "supplier" || roles === "both"
        ? [
            {
              id: "supplier-1",
              supplierCode: "SUP.R2",
              supplierType: "general",
              status: "onboarding",
              createdAt: "2026-09-04T00:00:00Z",
            },
          ]
        : [],
    customers:
      roles === "customer" || roles === "both"
        ? [
            {
              id: "customer-1",
              customerCode: "CUS.R2",
              customerType: "corporate",
              status: "prospect",
              recordVersion: 1,
              designations: [
                {
                  id: "designation-1",
                  type: "standard",
                  priorityTier: 2,
                  effectiveFrom: "2026-09-04",
                },
              ],
              createdAt: "2026-09-04T00:00:00Z",
            },
          ]
        : [],
    supplierCompanyProfiles: [],
    customerCompanyProfiles: [],
    organizationAssignments: [],
    onboardingRequests: [],
  };
}

describe("R2 role-extension experience", () => {
  it.each([
    ["none", ["supplier", "customer"]],
    ["supplier", ["customer"]],
    ["customer", ["supplier"]],
    ["both", []],
  ] as const)(
    "offers only missing roles for a %s target",
    (roles, expected) => {
      expect(availableRoleExtensions(aggregate(roles))).toEqual(expected);
    },
  );

  it("captures bounded identity and opposite-role authority for before/after proof", () => {
    const snapshot = roleAuthoritySnapshot(aggregate("customer"));
    expect(snapshot).toEqual({
      businessPartner: {
        id: "bp-1",
        code: "BP.R2",
        name: "R2 Organization",
        status: "active",
      },
      suppliers: [],
      customers: [
        {
          id: "customer-1",
          code: "CUS.R2",
          status: "prospect",
          designations: [
            {
              id: "designation-1",
              type: "standard",
              priorityTier: 2,
              effectiveFrom: "2026-09-04",
              effectiveUntil: undefined,
            },
          ],
        },
      ],
    });
    expect(snapshot).not.toHaveProperty("proposedPayload");
  });
});
