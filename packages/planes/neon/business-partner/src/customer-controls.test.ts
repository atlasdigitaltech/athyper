import { describe, expect, it } from "vitest";
import {
  customerControlPermissions,
  customerControlHistoryRows,
  customerLifecycleActions,
  customerReadinessGuidance,
} from "./customer-controls";

describe("R5 customer controls model", () => {
  it("binds each Customer decision and lifecycle command to native authority", () => {
    expect(customerControlPermissions).toEqual({
      creditCreate: "neon.customer.credit.create",
      creditDecide: "neon.customer.credit.decide",
      designationCreate: "neon.customer.designation.create",
      designationDecide: "neon.customer.designation.decide",
      activate: "neon.customer.lifecycle.activate",
      suspend: "neon.customer.lifecycle.suspend",
      reactivate: "neon.customer.lifecycle.reactivate",
      deactivate: "neon.customer.lifecycle.deactivate",
      archive: "neon.customer.lifecycle.archive",
    });
  });

  it("offers only valid actions while exposing all five lifecycle commands", () => {
    expect(customerLifecycleActions("prospect")).toEqual(["activate"]);
    expect(customerLifecycleActions("active")).toEqual([
      "suspend",
      "deactivate",
    ]);
    expect(customerLifecycleActions("suspended")).toEqual([
      "reactivate",
      "deactivate",
    ]);
    expect(customerLifecycleActions("inactive")).toEqual(["archive"]);
    expect(customerLifecycleActions("archived")).toEqual([]);
  });

  it("maps stable readiness reasons to an accountable owner and action", () => {
    expect(customerReadinessGuidance("CREDIT_REVIEW_PENDING")).toEqual({
      owner: "Credit control",
      action: "Open or decide the scoped credit review",
    });
    expect(customerReadinessGuidance("COMPANY_PROFILE_MISSING")).toEqual({
      owner: "Accounts receivable master data",
      action: "Correct the Customer company profile",
    });
    expect(customerReadinessGuidance("ORG_ASSIGNMENT_MISSING")).toEqual({
      owner: "Business Partner data steward",
      action: "Correct the role or sales-organization assignment",
    });
  });

  it("reconciles immutable credit and designation histories without merging authorities", () => {
    const rows = customerControlHistoryRows(
      [{ id:"credit-1",businessPartnerId:"bp",customerId:"customer",operatingOrganizationId:"sales",companyCodeId:"ar",reviewTypeCode:"initial",decision:"rejected",conditions:[],effectiveFrom:"2026-09-01",rowVersion:2,createdAt:"2026-09-01T00:00:00.000Z",createdBy:"maker",updatedAt:"2026-09-02T00:00:00.000Z",updatedBy:"checker" }],
      [{ id:"designation-1",businessPartnerId:"bp",customerId:"customer",operatingOrganizationId:"sales",countryCode:"MY",channelCode:"direct",designationType:"strategic",effectiveFrom:"2026-09-01",rationale:"Regional account",status:"approved",rowVersion:2,createdAt:"2026-09-01T00:00:00.000Z",createdBy:"maker" }],
    );
    expect(rows.map(item=>item.authority)).toEqual(["credit","designation"]);
    expect(rows[0]).toMatchObject({state:"rejected",changedBy:"checker"});
    expect(rows[1]?.scope).toContain("MY · direct");
  });
});
