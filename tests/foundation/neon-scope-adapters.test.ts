import assert from "node:assert/strict";
import test from "node:test";
import {
  businessPartnerRoleFromDirectoryQuery,
  businessPartnerScopeCoordinate,
  supportsNeonWorkContextResolver,
} from "../../packages/planes/neon/list-view/src/scope-adapters";

test("Business Partner scope adapter preserves role URL and authorized eligibility coordinates", () => {
  assert.equal(
    businessPartnerRoleFromDirectoryQuery("role=supplier&density=compact"),
    "supplier",
  );
  assert.equal(businessPartnerRoleFromDirectoryQuery("role=unknown"), undefined);
  const companies = [{ companyCodeId: "company-de", legalEntityId: "legal-de" }];
  assert.deepEqual(
    businessPartnerScopeCoordinate({
      organizationIds: ["organization-eu"],
      companyIds: ["company-de"],
      partnerRole: "supplier",
      eligibleOperation: "order",
      companies,
    }),
    {
      operatingOrganizationId: "organization-eu",
      companyCodeId: "company-de",
      legalEntityId: "legal-de",
      partnerRole: "supplier",
      eligibleOperation: "order",
    },
  );
  assert.deepEqual(
    businessPartnerScopeCoordinate({
      organizationIds: ["organization-eu", "organization-us"],
      companyIds: ["company-de"],
      partnerRole: "supplier",
      eligibleOperation: "order",
      companies,
    }),
    {
      operatingOrganizationIds: ["organization-eu", "organization-us"],
      companyCodeIds: ["company-de"],
      partnerRole: "supplier",
    },
  );
});

test("unknown work-context resolvers remain unavailable", () => {
  assert.equal(supportsNeonWorkContextResolver("neon.business_partner.operating_organization.v1"), true);
  assert.equal(supportsNeonWorkContextResolver("unknown.untrusted.v1"), false);
});
