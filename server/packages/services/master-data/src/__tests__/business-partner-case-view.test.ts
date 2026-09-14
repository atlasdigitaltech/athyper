import type { BusinessPartnerRequest } from "@athyper/server-contract-master-data";
import { describe, expect, it } from "vitest";
import { toGovernedBusinessPartnerCaseView } from "../business-partner-case-view.js";

const allPermissions = [
  "neon.relationship.entity_case.update",
  "neon.relationship.entity_case.validate",
  "neon.relationship.entity_case.submit",
  "neon.relationship.entity_case.decide",
  "neon.relationship.entity_case.materialize",
];

function request(
  overrides: Partial<BusinessPartnerRequest> = {},
): BusinessPartnerRequest {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    tenantId: "22222222-2222-4222-8222-222222222222",
    requestNo: "BPR-001",
    kind: "new_partner",
    source: { kind: "manual" },
    registrationMode: "direct",
    requestedRole: "supplier",
    operatingOrganizationId: "33333333-3333-4333-8333-333333333333",
    schema: {
      code: "neon.business_partner_request",
      version: 3,
      hash: "a".repeat(64),
      releaseId: "44444444-4444-4444-8444-444444444444",
    },
    proposedPayload: { legalName: "Acme Sdn Bhd" },
    extensionSummary: {
      mode: "typed_v1",
      counts: {
        addresses: 0,
        contactPersons: 0,
        contactChannels: 0,
        identifiers: 0,
        taxRegistrations: 0,
        classifications: 0,
        certifications: 0,
      },
    },
    validationSummary: {
      outcome: "passed",
      evidenceSummary: { active: 1, scanning: 0, quarantined: 0, missing: 0 },
    },
    duplicateSummary: {},
    changeImpact: {},
    idempotencyKey: "bp-ui-create-fixture",
    status: "draft",
    rowVersion: 2,
    createdAt: "2026-09-04T00:00:00.000Z",
    createdBy: "55555555-5555-4555-8555-555555555555",
    ...overrides,
  };
}

describe("GovernedCaseViewV1 Business Partner producer", () => {
  it("retains release, ownership, lifecycle progress, actions, and evidence summary", () => {
    const value = toGovernedBusinessPartnerCaseView(request(), {
      permissionCodes: allPermissions,
    });
    expect(value).toMatchObject({
      schema: "athyper.governed-case-view/1",
      definition: {
        id: "44444444-4444-4444-8444-444444444444",
        version: 3,
        contentHash: "a".repeat(64),
      },
      ownership: { requesterId: "55555555-5555-4555-8555-555555555555" },
      progress: { completed: 2, required: 4, blockers: 0 },
      evidenceSummary: { active: 1, scanning: 0, quarantined: 0, missing: 0 },
    });
    expect(value.allowedActions.map(({ id }) => id)).toEqual([
      "edit",
      "validate",
      "submit",
    ]);
    expect(Object.isFrozen(value)).toBe(true);
  });

  it("uses separate company permissions for lifecycle action projection", () => {
    expect(
      toGovernedBusinessPartnerCaseView(request(), {
        companyPilot: true,
        permissionCodes: allPermissions,
      }).allowedActions,
    ).toEqual([]);
    const independent = allPermissions.map((code) =>
      code.replace(".entity_case.", ".bp_company_setup_request."),
    );
    expect(
      toGovernedBusinessPartnerCaseView(request(), {
        companyPilot: true,
        permissionCodes: independent,
      }).allowedActions.map((action) => action.id),
    ).toEqual(["edit", "validate", "submit"]);
    expect(
      toGovernedBusinessPartnerCaseView(request(), {
        permissionCodes: independent,
      }).allowedActions,
    ).toEqual([]);
  });

  it("projects validation and terminal failures without inventing evidence", () => {
    const value = toGovernedBusinessPartnerCaseView(
      request({
        status: "validation_failed",
        validationSummary: { outcome: "failed" },
      }),
      {
        permissionCodes: allPermissions,
        validationFindings: [
          {
            ruleCode: "identity.required",
            severity: "error",
            fieldPath: "/legalName",
            outcome: "failed",
            messageCode: "LEGAL_NAME_REQUIRED",
            evidenceReference: {},
          },
        ],
      },
    );
    expect(value.progress.blockers).toBe(1);
    expect(value.sections.find(({ id }) => id === "validation")).toMatchObject({
      state: "blocked",
      errors: 1,
    });
    expect(value.evidenceSummary).toEqual({
      active: 0,
      scanning: 0,
      quarantined: 0,
      missing: 0,
    });
  });

  it("requires exact open-task coordinates before advertising decision actions", () => {
    const pending = request({ status: "pending_approval" });
    expect(
      toGovernedBusinessPartnerCaseView(pending, {
        permissionCodes: allPermissions,
      }).allowedActions,
    ).toEqual([]);
    const value = toGovernedBusinessPartnerCaseView(pending, {
      permissionCodes: allPermissions,
      principalId: "99999999-9999-4999-8999-999999999999",
      workflow: {
        requestId: "66666666-6666-4666-8666-666666666666",
        stageId: "77777777-7777-4777-8777-777777777777",
        workItemId: "88888888-8888-4888-8888-888888888888",
        workItemVersion: 4,
        workItemStatus: "open",
        ownerPrincipalId: "99999999-9999-4999-8999-999999999999",
        definition: {
          code: "neon.business_partner.onboarding",
          version: 1,
          hash: "b".repeat(64),
        },
      },
    });
    expect(value.allowedActions.map(({ id }) => id)).toEqual([
      "return",
      "reject",
      "approve",
    ]);
    expect(value.ownership.assigneeId).toBe(
      "99999999-9999-4999-8999-999999999999",
    );
    expect(
      toGovernedBusinessPartnerCaseView(pending, {
        permissionCodes: allPermissions,
        principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        workflow: valueForWrongOwner(),
      }).allowedActions,
    ).toEqual([]);
  });

  it("fails closed when the producer lacks an immutable release or emits an invalid state", () => {
    expect(() =>
      toGovernedBusinessPartnerCaseView(
        request({
          schema: { code: "legacy", version: 1, hash: "a".repeat(64) },
        }),
        { permissionCodes: [] },
      ),
    ).toThrow(/not pinned/);
    expect(() =>
      toGovernedBusinessPartnerCaseView(
        request({ status: "future_state" as BusinessPartnerRequest["status"] }),
        { permissionCodes: [] },
      ),
    ).toThrow(/Unsupported governed case status/);
  });
});

function valueForWrongOwner() {
  return {
    requestId: "66666666-6666-4666-8666-666666666666",
    stageId: "77777777-7777-4777-8777-777777777777",
    workItemId: "88888888-8888-4888-8888-888888888888",
    workItemVersion: 4,
    workItemStatus: "open",
    ownerPrincipalId: "99999999-9999-4999-8999-999999999999",
    definition: {
      code: "neon.business_partner.onboarding",
      version: 1,
      hash: "b".repeat(64),
    },
  } as const;
}
