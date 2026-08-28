import { describe, expect, it } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { createNeonRecordCollectionScopeResolver } from "./record-collection-scope.js";

const companyCodeId = "11111111-1111-4111-8111-111111111111";
const legalEntityId = "22222222-2222-4222-8222-222222222222";
const organizationId = "33333333-3333-4333-8333-333333333333";
const descriptor = {
  schema: "athyper.entity-runtime-descriptor/1.0", entityCode: "business_partner", planeKey: "neon", releaseId: "release-1", releaseNo: 1, contractHash: "a".repeat(64), compiledHash: "b".repeat(64),
  storage: { schema: "master", object: "business_partner", idField: "id", tenantField: "tenant_id" }, fields: [], operations: { read: { code: "read", permissionCode: "neon.relationship.business_partner.read" } },
} satisfies EntityRuntimeDescriptor;
const context = { planeKey: "neon", realmKey: "athyper", tenantId: "tenant-1", principalId: "principal-1", authEpoch: 1, profileHash: "profile", requestId: "request", permissions: { planeKey: "neon", tenantId: "tenant-1", principalId: "principal-1", principalFingerprint: "fingerprint", profileHash: "profile", schemaHash: "schema", resolvedAt: 1, allowed: [], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [] } } satisfies VerifiedRequestContext;

describe("Neon record collection scope resolver", () => {
  const catalog = {
    neonWorkContexts: async () => ({ revision: "work-r1", companies: [{ companyCodeId, legalEntityId, code: "1000", displayName: "Malaysia Company", legalEntityCode: "MY01", legalEntityName: "Malaysia Legal Entity" }] }),
    neonOperatingOrganizations: async () => ({ revision: "org-r1", organizations: [{ id: organizationId, code: "PROC-MY", displayName: "Malaysia Procurement", companyAssignments: [{ companyCodeId }] }] }),
  };

  it("requires an explicit operating organization without consulting a client-side remembered value", async () => {
    const result = await createNeonRecordCollectionScopeResolver(catalog).resolve({ context, descriptor, operationCode: "read" });
    expect(result).toMatchObject({ status: "context_required", labels: [{ key: "operating_organization" }] });
  });

  it("validates the company pairing and emits the closed business-partner constraint", async () => {
    const result = await createNeonRecordCollectionScopeResolver(catalog).resolve({ context, descriptor, operationCode: "read", coordinate: { companyCodeId, legalEntityId, operatingOrganizationId: organizationId } });
    expect(result).toMatchObject({ status: "ready", authorizationResource: { companyCodeId, legalEntityId, operatingOrganizationId: organizationId }, constraints: [{ kind: "neon.business_partner.operating_organization.v1", operatingOrganizationId: organizationId }] });
    expect(result.labels.map((label) => label.value)).toEqual(["1000 · Malaysia Company", "PROC-MY · Malaysia Procurement"]);
  });

  it("fails closed for a company coordinate that is absent or incompatible", async () => {
    const resolver = createNeonRecordCollectionScopeResolver(catalog);
    await expect(resolver.resolve({ context, descriptor, operationCode: "read", coordinate: { companyCodeId: "44444444-4444-4444-8444-444444444444", legalEntityId, operatingOrganizationId: organizationId } })).resolves.toMatchObject({ status: "forbidden", code: "NEON_WORK_CONTEXT_NOT_PERMITTED" });
    const incompatible = createNeonRecordCollectionScopeResolver({ ...catalog, neonOperatingOrganizations: async () => ({ revision: "org-r2", organizations: [{ id: organizationId, code: "PROC-MY", displayName: "Malaysia Procurement", companyAssignments: [] }] }) });
    await expect(incompatible.resolve({ context, descriptor, operationCode: "read", coordinate: { companyCodeId, legalEntityId, operatingOrganizationId: organizationId } })).resolves.toMatchObject({ status: "forbidden", code: "NEON_WORK_CONTEXT_INCOMPATIBLE" });
  });
});
