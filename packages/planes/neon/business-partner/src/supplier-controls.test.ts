import { describe, expect, it } from "vitest";
import type { PartnerAggregate, PartnerEligibility } from "./client";
import {
  supplierControlPermissions,
  supplierLifecycleEvidence,
} from "./supplier-controls";

describe("R4 supplier controls model", () => {
  it("binds each mutation family to its native permission", () => {
    expect(supplierControlPermissions).toEqual({
      qualification: "neon.supplier.qualification.admin",
      preference: "neon.supplier.preference.admin",
      activate: "neon.relationship.business_partner.activate",
      lifecycle: "neon.relationship.entity_case.create",
    });
  });

  it("builds the complete lifecycle dependency evidence shape", () => {
    const aggregate = {
      suppliers: [{ status: "active" }, { status: "onboarding" }],
      customers: [{ status: "active" }],
      organizationAssignments: [{ status: "active" }, { status: "inactive" }],
    } as unknown as PartnerAggregate;
    const readiness = {
      activeBlockIds: ["block-1"],
      qualifications: [
        { decision: "approved" },
        { decision: "conditional" },
        { decision: "pending" },
      ],
    } as unknown as PartnerEligibility;
    expect(supplierLifecycleEvidence(aggregate, readiness)).toEqual([
      { code: "supplier_roles", count: 1, blocking: false },
      { code: "customer_roles", count: 1, blocking: false },
      { code: "active_organization_assignments", count: 1, blocking: false },
      { code: "active_employments", count: 0, blocking: false },
      { code: "effective_blocks", count: 1, blocking: true },
      { code: "effective_qualifications", count: 2, blocking: false },
    ]);
  });
});
