import { expect, it } from "vitest";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createNeonRecordCollectionScopeResolver } from "./record-collection-scope.js";

const company = "11111111-1111-4111-8111-111111111111";
const legal = "22222222-2222-4222-8222-222222222222";
const organization = "33333333-3333-4333-8333-333333333333";
const context = {
  planeKey: "neon",
  tenantId: "tenant",
  principalId: "principal",
} as VerifiedRequestContext;
const field = (key: string) => ({
  key,
  type: "uuid" as const,
  storagePath: key,
  writableOn: [],
  required: true,
});
const descriptor = (entityCode: string): EntityRuntimeDescriptor => ({
  schema: "athyper.entity-runtime-descriptor/1.0",
  entityCode,
  planeKey: "neon",
  releaseId: "release",
  releaseNo: 1,
  contractHash: "a".repeat(64),
  compiledHash: "b".repeat(64),
  storage: {
    schema: "master",
    object: entityCode,
    idField: "id",
    tenantField: "tenant_id",
  },
  fields: [field("company_owner"), field("organization_owner")],
  operations: { read: { code: "read" } },
  directoryScope: {
    schemaVersion: 1,
    mode: "organization_company",
    fieldBinding: {
      resolver: "neon.directory.fields.v1",
      companyField: "company_owner",
      organizationField: "organization_owner",
    },
  },
});
const catalog = {
  neonWorkContexts: async () => ({
    revision: "company-1",
    companies: [
      {
        companyCodeId: company,
        legalEntityId: legal,
        code: "CO",
        displayName: "Company",
        legalEntityCode: "LE",
        legalEntityName: "Legal",
      },
    ],
  }),
  neonOperatingOrganizations: async () => ({
    revision: "org-1",
    organizations: [
      {
        id: organization,
        code: "ORG",
        displayName: "Organization",
        companyAssignments: [{ companyCodeId: company }],
      },
    ],
  }),
};
const coordinate = {
  companyCodeId: company,
  legalEntityId: legal,
  operatingOrganizationId: organization,
};
const resolve = (d = descriptor("shipment"), c = coordinate) =>
  createNeonRecordCollectionScopeResolver(catalog).resolve({
    context,
    descriptor: d,
    operationCode: "read",
    coordinate: c,
  });

it.each(["shipment", "inventory_allocation"])(
  "scopes %s through exact metadata fields without entity dispatch",
  async (code) => {
    const result = await resolve(descriptor(code));
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw Error("Unexpected denial");
    expect(result.constraints).toEqual([
      {
        kind: "entity.directory.fields.v1",
        entityCode: code,
        storageSchema: "master",
        storageObject: code,
        predicates: [
          { field: "company_owner", value: company },
          { field: "organization_owner", value: organization },
        ],
      },
    ]);
    expect(result.authorizationResource).toEqual(coordinate);
    expect(result.fingerprintMaterial).toMatchObject({
      workRevision: "company-1",
      organizationRevision: "org-1",
    });
    expect(JSON.stringify(result.labels)).not.toContain(company);
  },
);
it("requires context and rejects forged, conflicting and unsupported coordinates", async () => {
  const resolver = createNeonRecordCollectionScopeResolver(catalog);
  const input = {
    context,
    descriptor: descriptor("shipment"),
    operationCode: "read" as const,
  };
  expect((await resolver.resolve(input)).status).toBe("context_required");
  for (const coordinate of [
    { companyCodeId: company },
    { ...coordinateBase(), companyCodeId: organization },
    { ...coordinateBase(), operatingOrganizationId: "invalid" },
    { ...coordinateBase(), companyCodeIds: [] },
  ])
    expect((await resolver.resolve({ ...input, coordinate })).status).toBe(
      "forbidden",
    );
});
function coordinateBase() {
  return coordinate;
}
it("rejects incompatible authorized organization/company pairs and revoked contexts", async () => {
  for (const organizations of [
    [],
    [
      {
        id: organization,
        code: "ORG",
        displayName: "Organization",
        companyAssignments: [],
      },
    ],
  ]) {
    const resolver = createNeonRecordCollectionScopeResolver({
      ...catalog,
      neonOperatingOrganizations: async () => ({
        revision: "revoked",
        organizations,
      }),
    });
    expect(
      (
        await resolver.resolve({
          context,
          descriptor: descriptor("shipment"),
          operationCode: "read",
          coordinate,
        })
      ).status,
    ).toBe("forbidden");
  }
});
it("rejects missing, writable and non-UUID scope fields", async () => {
  for (const fields of [
    [],
    [{ ...field("company_owner"), writableOn: ["patch" as const] }],
    [{ ...field("company_owner"), type: "string" as const }],
  ]) {
    expect(await resolve({ ...descriptor("shipment"), fields })).toMatchObject({
      status: "forbidden",
      code: "DIRECTORY_FIELD_BINDING_INVALID",
    });
  }
});
it("does not reinterpret missing bindings as tenant access", async () => {
  expect(
    await resolve({
      ...descriptor("shipment"),
      directoryScope: { schemaVersion: 1, mode: "company" },
    }),
  ).toMatchObject({
    status: "forbidden",
    code: "DIRECTORY_SCOPE_RESOLVER_REQUIRED",
  });
});
