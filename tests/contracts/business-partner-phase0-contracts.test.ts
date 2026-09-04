import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseEvidenceItemView,
  parseExperienceContextCoordinate,
  parseGovernedCaseView,
  parseNotificationEvent,
} from "../../packages/contracts/platform/entity-runtime/src/index";

const uuid = "11111111-1111-4111-8111-111111111111";
const secondUuid = "22222222-2222-4222-8222-222222222222";
const hash = "a".repeat(64);
const definition = { id: uuid, version: 3, contentHash: hash };

describe("Business Partner Phase 0 experience contracts", () => {
  it("parses a server-verifiable context coordinate and strips undeclared claims", () => {
    const parsed = parseExperienceContextCoordinate({
      schema: "athyper.experience-context-coordinate/1",
      plane: "neon",
      tenantId: uuid,
      principalId: secondUuid,
      operatingOrganizationId: "33333333-3333-4333-8333-333333333333",
      recordId: "bp-001",
      section: "qualifications-certificates",
      roleLens: "supplier",
      asOf: "2026-09-04T00:00:00.000Z",
      definition,
      permissionsHash: "b".repeat(64),
      authorizationEpoch: 4,
      assertedPermission: "admin",
    });
    assert.equal(parsed.roleLens, "supplier");
    assert.equal("assertedPermission" in parsed, false);
    assert.equal(Object.isFrozen(parsed.definition), true);
  });

  it("parses a bounded governed case projection and rejects impossible progress", () => {
    const input = {
      schema: "athyper.governed-case-view/1",
      id: uuid,
      kind: "new_partner",
      status: "draft",
      rowVersion: 2,
      definition,
      subject: { type: "business_partner", displayName: "Acme Sdn Bhd" },
      ownership: { requesterId: secondUuid, queue: "data_stewards" },
      progress: { completed: 1, required: 2, blockers: 0 },
      sections: [
        {
          id: "organization",
          label: "Organization",
          state: "complete",
          errors: 0,
        },
      ],
      allowedActions: [
        { id: "submit", label: "Submit", requiresElevation: false },
      ],
      evidenceSummary: { active: 1, scanning: 0, quarantined: 0, missing: 0 },
      timestamps: {
        createdAt: "2026-09-04T00:00:00.000Z",
        updatedAt: "2026-09-04T01:00:00.000Z",
      },
    };
    assert.equal(parseGovernedCaseView(input).allowedActions[0]?.id, "submit");
    assert.throws(
      () =>
        parseGovernedCaseView({
          ...input,
          progress: { completed: 3, required: 2, blockers: 0 },
        }),
      /completed cannot exceed/,
    );
  });

  it("publishes evidence metadata without leaking storage coordinates", () => {
    const parsed = parseEvidenceItemView({
      schema: "athyper.evidence-item-view/1",
      id: uuid,
      requirementId: "registration_certificate",
      fileName: "registration.pdf",
      mediaType: "application/pdf",
      sizeBytes: 2048,
      version: 1,
      status: "active",
      classification: "confidential",
      extractedFields: [
        {
          path: "/legalName",
          value: "Acme",
          confidence: 0.98,
          evidenceSpan: "Page 1",
        },
      ],
      legalHold: false,
      canDownload: true,
      canReplace: true,
      bucket: "must-not-leak",
      objectKey: "must-not-leak",
      signedUrl: "must-not-leak",
    });
    assert.equal(parsed.extractedFields?.[0]?.confidence, 0.98);
    for (const prohibited of ["bucket", "objectKey", "signedUrl"])
      assert.equal(prohibited in parsed, false);
    assert.throws(
      () =>
        parseEvidenceItemView({
          ...parsed,
          extractedFields: [{ path: "/x", value: "x", confidence: 2 }],
        }),
      /confidence/,
    );
    assert.throws(
      () =>
        parseEvidenceItemView({
          ...parsed,
          extractedFields: [
            { path: "/x", value: { nested: "payload" }, confidence: 1 },
          ],
        }),
      /value/,
    );
  });

  it("accepts reference-only notification data and rejects nested payloads", () => {
    const input = {
      schema: "athyper.notification-event/1",
      eventId: uuid,
      eventType: "business_partner.case.returned",
      occurredAt: "2026-09-04T02:00:00.000Z",
      tenantId: secondUuid,
      plane: "neon",
      subject: {
        type: "business_partner_case",
        id: uuid,
        displayLabel: "BPR-001",
      },
      caseId: uuid,
      recipientHints: ["requester", "partner_admin"],
      templateData: { caseReference: "BPR-001", blockingSectionCount: 1 },
      deliveryClass: "mandatory_transactional",
      templateKey: "business_partner.case.returned.v1",
      deepLinkKey: "business_partner.case.correction",
      deduplicationKey: "business-partner:BPR-001:returned:v2",
    } as const;
    assert.equal(parseNotificationEvent(input).templateKey, input.templateKey);
    assert.throws(
      () =>
        parseNotificationEvent({
          ...input,
          templateData: { bank: { accountNumber: "1" } },
        }),
      /templateData.bank/,
    );
    assert.throws(
      () =>
        parseNotificationEvent({
          ...input,
          recipientHints: ["requester", "requester"],
        }),
      /recipientHints/,
    );
  });
});
