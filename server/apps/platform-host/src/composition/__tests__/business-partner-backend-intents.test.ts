import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
import { parseEntityAuthorizationProfile } from "@athyper/server-contract-metadata";
import type { AuthorizationRequest } from "@athyper/server-contract-auth";
import { createBusinessPartnerBackendMapping } from "../business-partner-backend-mapping.js";
const profile = parseEntityAuthorizationProfile(
  JSON.parse(
    readFileSync(
      new URL(
        "../../../../../../packages/contracts/platform/fixtures/entity-authorization/business-partner.v1.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ),
);
// Selected release uses the reviewed existing-case correction; the foundational
// fixture predates it and remains intact for its historical regression evidence.
const selectedProfile = parseEntityAuthorizationProfile({
  ...profile,
  operations: profile.operations.map((o) =>
    o.key.startsWith("case_") && !["case_create", "case_read"].includes(o.key)
      ? { ...o, target: "existing" }
      : o,
  ),
});
const mapping = createBusinessPartnerBackendMapping(selectedProfile);
const request = (
  permissionCode: string,
  resource: Record<string, unknown> = {},
): AuthorizationRequest => ({
  context: { planeKey: "neon" } as AuthorizationRequest["context"],
  permissionCode,
  resource,
});
it.each([
  ["navigate_review", "neon.relationship.entity_case.read"],
  ["request_supplier", "neon.relationship.entity_case.create"],
])(
  "preserves published BP intent %s despite its shared case permission",
  (key, permission) => {
    expect(
      mapping.target(
        request(permission, {
          entityCode: "business_partner",
          operationKey: key,
          operatingOrganizationId: "org",
        }),
      ),
    ).toMatchObject({
      operationKey: key,
      coordinates: { operatingOrganizationId: "org" },
    });
  },
);
it("rejects incorrect permissions and conflicting intent hints", () => {
  expect(
    mapping.target(
      request("neon.relationship.entity_case.materialize", {
        entityCode: "business_partner",
        operationKey: "navigate_review",
      }),
    ),
  ).toBeNull();
  expect(
    mapping.target(
      request("neon.relationship.entity_case.read", {
        entityCode: "business_partner",
        operationKey: "navigate_review",
        actionCode: "request_supplier",
      }),
    ),
  ).toBeNull();
});
it("cannot use BP intent to borrow an independently stored case identity", () => {
  expect(
    mapping.target(
      request("neon.relationship.entity_case.read", {
        entityCode: "entity_case",
        recordId: "case",
        operationKey: "navigate_review",
      }),
    ),
  ).toBeNull();
  expect(
    mapping.target(
      request("neon.relationship.entity_case.materialize", {
        entityCode: "business_partner",
        recordId: "bp",
        operationKey: "case_materialize",
      }),
    ),
  ).toBeNull();
});

it("routes legacy section amendment to the selected deferral without enabling it", () => {
  const deferred = createBusinessPartnerBackendMapping({
    ...selectedProfile,
    operations: selectedProfile.operations.filter(
      (o) => o.key !== "section_propose_change",
    ),
    deferredOperations: ["section_propose_change"],
  });
  expect(
    deferred.target(
      request("neon.relationship.business_partner_amend.create", {
        businessPartnerId: "bp",
        sectionCode: "identity",
      }),
    ),
  ).toMatchObject({ operationKey: "section_propose_change", recordId: "bp" });
  expect(
    deferred.target(
      request("neon.relationship.business_partner_amend.create", {
        businessPartnerId: "bp",
      }),
    ),
  ).toBeNull();
  expect(
    deferred.target(
      request("neon.relationship.business_partner_amend.create", {
        sectionCode: "identity",
      }),
    ),
  ).toBeNull();
});
