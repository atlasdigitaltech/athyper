import type { BusinessPartnerRequest } from "@athyper/server-contract-master-data";
import { describe, expect, it } from "vitest";
import { projectBusinessPartnerNotification } from "../business-partner-notifications.js";

const request = {
  id: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  requestNo: "BPR-001",
  kind: "new_partner",
  source: { kind: "manual" },
  registrationMode: "direct",
  requestedRole: "supplier",
  operatingOrganizationId: "33333333-3333-4333-8333-333333333333",
  schema: { code: "bp", version: 1, hash: "a".repeat(64) },
  proposedPayload: { legalName: "SECRET LEGAL NAME", taxId: "SECRET-TAX" },
  extensionSummary: { mode: "typed_v1", counts: { addresses: 0, contactPersons: 0, contactChannels: 0, identifiers: 0, taxRegistrations: 0, classifications: 0, certifications: 0 } },
  validationSummary: {}, duplicateSummary: {}, changeImpact: {},
  idempotencyKey: "create-1", status: "applied", rowVersion: 9,
  createdAt: "2026-09-04T00:00:00.000Z", updatedAt: "2026-09-04T01:00:00.000Z",
  createdBy: "44444444-4444-4444-8444-444444444444",
  applicantPrincipalId: "55555555-5555-4555-8555-555555555555",
} as const satisfies BusinessPartnerRequest;

describe("Business Partner lifecycle notification projection", () => {
  it.each([
    ["business_partner.case.submitted", "policy_controlled", "business_partner.case.submitted.v1", ["current_approver", "approval_queue"]],
    ["business_partner.workflow.stage.activated", "policy_controlled", "business_partner.workflow.stage.activated.v1", ["current_approver", "approval_queue"]],
    ["business_partner.case.returned", "mandatory_transactional", "business_partner.case.returned.v1", ["requester", "applicant"]],
    ["business_partner.case.approved", "preference_aware", "business_partner.case.approved.v1", ["requester", "relationship_owner"]],
    ["business_partner.case.rejected", "mandatory_transactional", "business_partner.case.rejected.v1", ["requester", "applicant"]],
    ["business_partner.case.materialized", "preference_aware", "business_partner.case.materialized.v1", ["requester", "relationship_owner"]],
  ] as const)("routes %s through the accepted matrix", (eventType, deliveryClass, templateKey, recipientHints) => {
    expect(projectBusinessPartnerNotification(eventType, request, request.createdBy)?.event).toMatchObject({
      schema: "athyper.notification-event/1", eventType, deliveryClass, templateKey, recipientHints,
      subject: { type: "business_partner_case", id: request.id }, caseId: request.id,
    });
  });

  it("is deterministic per committed version and keeps template data primitive and restricted-field free", () => {
    const metadata = { resultKind: "partner_role_created", partnerRole: "supplier", currentApproverPrincipalIds: ["66666666-6666-4666-8666-666666666666"], rawError: { secret: true } };
    const first = projectBusinessPartnerNotification("business_partner.case.submitted", request, request.createdBy, metadata)!;
    const second = projectBusinessPartnerNotification("business_partner.case.submitted", request, request.createdBy, metadata)!;
    expect(second.event.eventId).toBe(first.event.eventId);
    expect(second.event.deduplicationKey).toBe("business_partner.case.submitted:11111111-1111-4111-8111-111111111111:v9");
    expect(first.recipientPrincipalIds).toEqual(["66666666-6666-4666-8666-666666666666"]);
    expect(Object.values(first.event.templateData).every(value => value === null || ["string", "number", "boolean"].includes(typeof value))).toBe(true);
    expect(JSON.stringify(first.event)).not.toContain("SECRET");
    expect(first.event.templateData).not.toHaveProperty("rawError");
  });

  it("deduplicates stage activation independently for every stage", () => {
    const first = projectBusinessPartnerNotification(
      "business_partner.workflow.stage.activated",
      request,
      request.createdBy,
      { stageId: "stewardship" },
    )!;
    const second = projectBusinessPartnerNotification(
      "business_partner.workflow.stage.activated",
      request,
      request.createdBy,
      { stageId: "compliance_tax" },
    )!;
    expect(first.event.deduplicationKey).toBe(
      "business_partner.workflow.stage.activated:11111111-1111-4111-8111-111111111111:stewardship:v9",
    );
    expect(second.event.deduplicationKey).toBe(
      "business_partner.workflow.stage.activated:11111111-1111-4111-8111-111111111111:compliance_tax:v9",
    );
    expect(second.event.eventId).not.toBe(first.event.eventId);
  });

  it("does not route events outside the approved lifecycle matrix", () => {
    expect(projectBusinessPartnerNotification("business_partner.case.updated", request, request.createdBy)).toBeUndefined();
  });
});
