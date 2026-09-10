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
const mapping = createBusinessPartnerBackendMapping(profile);
const request = (
  permissionCode: string,
  resource: Record<string, unknown> = {},
): AuthorizationRequest => ({
  context: { planeKey: "neon" } as AuthorizationRequest["context"],
  permissionCode,
  resource,
});
it.each([
  ["identity_read", "neon.relationship.business_partner_identity.read"],
  ["contacts_read", "neon.relationship.business_partner_contact.read"],
  ["bank_reveal", "neon.relationship.business_partner_bank.reveal"],
  ["requests_read", "neon.relationship.entity_case.read"],
])("maps provider %s using owning service coordinates", (key, permission) => {
  expect(
    mapping.target(
      request(permission, { businessPartnerId: "bp", sectionCode: "requests" }),
    ),
  ).toMatchObject({ operationKey: key, recordId: "bp" });
});
it("requires explicit record coordinates despite advisory annotation", () => {
  expect(
    mapping.target({
      ...request("neon.relationship.business_partner_identity.read"),
      observation: { entityCode: "business_partner", recordId: "bp" },
    }),
  ).not.toHaveProperty("recordId");
});
it("keeps global read separate from company-owned provider access", () => {
  expect(
    mapping.target(
      request("neon.relationship.business_partner.read", {
        businessPartnerId: "bp",
        operatingOrganizationId: "org",
        companyCodeId: "company",
      }),
    ),
  ).toMatchObject({ operationKey: "read", coordinates: {} });
  expect(
    mapping.target(
      request("neon.relationship.business_partner.read", {
        businessPartnerId: "bp",
        operatingOrganizationId: "org",
        companyCodeId: "company",
        roleLens: "supplier",
      }),
    ),
  ).toMatchObject({
    operationKey: "supplier_company_read",
    coordinates: { operatingOrganizationId: "org", companyCodeId: "company" },
  });
});
it("maps existing request/command coordinates and rejects unknown operations", () => {
  expect(
    mapping.target(
      request("neon.relationship.entity_case.materialize", {
        operatingOrganizationId: "org",
      }),
    ),
  ).toMatchObject({ operationKey: "case_materialize", phase: "execute" });
  expect(
    mapping.target(request("neon.relationship.business_partner.unknown")),
  ).toBeNull();
});
it("retains write and query field use; malformed annotations cannot bypass validation", () => {
  expect(
    mapping.target(
      request("neon.relationship.business_partner.update", {
        entityCode: "business_partner",
        recordId: "bp",
        operationKey: "patch",
        authorizationWriteFields: ["name"],
      }),
    ),
  ).toMatchObject({ operationKey: "update", writeFields: ["name"] });
  expect(
    mapping.target(
      request("neon.relationship.business_partner.read", {
        authorizationFieldUses: [{ field: "secret", use: "unknown" }],
      }),
    ),
  ).toBeNull();
});

it("owns dedicated capabilities and preserves deferred operations before field remapping", () => {
  const selected = createBusinessPartnerBackendMapping({ ...profile, deferredOperations: ["deferred_action"] });
  expect(selected.owns(request("neon.relationship.bp_target.read"))).toBe(true);
  expect(selected.target(request("neon.relationship.business_partner.read", {
    operationKey: "deferred_action", businessPartnerId: "bp", field: "name",
  }))).toMatchObject({ operationKey: "deferred_action", recordId: "bp" });
});

it("maps dedicated provider transitions without changing scopes or accepting arbitrary replacements", () => {
  const selectedProfile = {...profile, operations: profile.operations.map(o =>
    ["identity_read", "contacts_read", "bank_read"].includes(o.key)
      ? {...o, permissionCode: `neon.relationship.bp_target.${o.key}`} : o)};
  const selected = createBusinessPartnerBackendMapping(selectedProfile);
  for (const [key, permission] of [
    ["identity_read", "neon.relationship.business_partner_identity.read"],
    ["contacts_read", "neon.relationship.business_partner_contact.read"],
    ["bank_read", "neon.relationship.business_partner_bank.read_masked"],
  ]) {
    expect(selected.target(request(permission!, {businessPartnerId: "bp"}))).toMatchObject({operationKey: key, recordId: "bp"});
  }
  expect(selected.permissionTransitions).toHaveLength(3);
  const unreviewed = createBusinessPartnerBackendMapping({...selectedProfile,
    operations: selectedProfile.operations.map(o => o.key === "identity_read" ? {...o, permissionCode: "arbitrary.permission"} : o)});
  expect(unreviewed.target(request("neon.relationship.business_partner_identity.read", {businessPartnerId: "bp"}))).toBeNull();
});
it("never redirects an existing qualification decision to proposed-resource creation", () => {
  const input = request("neon.supplier.qualification.admin", {businessPartnerId: "bp", qualificationId: "child", operationKey: "qualification_decide", operatingOrganizationId: "org"});
  expect(mapping.owns(input)).toBe(true);
  expect(mapping.target(input)).toBeNull();
  expect(mapping.target(request(input.permissionCode, {...input.resource, operationKey: "qualification"}))).toMatchObject({operationKey: "qualification"});
});
