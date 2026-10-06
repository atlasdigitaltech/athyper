import { expect, it } from "vitest";
import {
  parseStructuredProjection,
  type EntityRuntimeDescriptor,
} from "@athyper/server-contract-metadata";
import { entityAuthorizationProfileHash } from "./entity-authorization-rollout.js";
import { createRecordQueryService } from "./query-service.js";
const declaration = parseStructuredProjection({
  kind: "object_array",
  maxItems: 2,
  fields: [
    { key: "name", type: "string", nullable: true },
    { key: "state", type: "string", nullable: false },
  ],
});
function fixture(entityCode: string, value: unknown, declared = true) {
  const descriptor = {
    schema: "athyper.entity-runtime-descriptor/1.0",
    entityCode,
    planeKey: "neon",
    storage: {
      schema: "master",
      object: "sample",
      idField: "id",
      tenantField: "tenant_id",
    },
    fields: [
      {
        key: "id",
        storagePath: "id",
        type: "uuid",
        required: true,
        writableOn: [],
      },
      {
        key: "details",
        storagePath: "details",
        type: "json",
        required: false,
        writableOn: [],
        ...(declared ? { structuredProjection: declaration } : {}),
      },
    ],
    operations: {
      read: { code: "read", permissionCode: "sample.read" },
      list: { code: "list", permissionCode: "sample.read" },
    },
    authorization: {
      schemaVersion: 1,
      entityCode,
      planeKey: "neon",
      ownership: "tenant.record.v1",
      directory: { operation: "list", population: "tenant" },
      recordReadOperation: "read",
      operations: [
        {
          key: "read",
          permissionCode: "sample.read",
          scope: "tenant.record.v1",
          target: "existing",
          effect: "read",
          requiresParentRead: false,
          requiresPreflight: false,
        },
        {
          key: "list",
          permissionCode: "sample.read",
          scope: "tenant.record.v1",
          target: "collection",
          effect: "read",
          requiresParentRead: false,
          requiresPreflight: false,
        },
      ],
      fieldPolicies: [
        {
          key: "facts",
          fields: ["id", "details"],
          readOperation: "read",
          representation: "plain",
          writeOperations: [],
          queryUses: [],
        },
      ],
      surfaces: [],
      relationships: [],
    },
  } as unknown as EntityRuntimeDescriptor;
  const row = { id: "11111111-1111-4111-8111-111111111111", details: value };
  const queries = createRecordQueryService({
    metadata: { getEntityDescriptor: async () => descriptor },
    authorizer: {
      authorize: async () => ({ allowed: true as const }),
      enforcedEntityProfile: () =>
        entityAuthorizationProfileHash(descriptor.authorization!),
    },
    repository: {
      list: async () => ({
        data: [row],
        pagination: { pageSize: 1, hasMore: false, countMode: "none" },
      }),
      get: async () => row,
    } as never,
    transactions: {
      run: async (
        _p: unknown,
        _c: unknown,
        work: (tx: object) => Promise<unknown>,
      ) => work({}),
    } as never,
  });
  const context = {
    tenantId: "tenant",
    principalId: "actor",
    planeKey: "neon",
    realmKey: "realm",
    authEpoch: 1,
    profileHash: "profile",
    requestId: "request",
    permissions: { principalFingerprint: "actor" },
  } as never;
  return {
    list: () => queries.list({ context, entityCode }),
    get: () => queries.get({ context, entityCode, recordId: row.id }),
  };
}
it.each(["qualification_projection", "shipment_projection"])(
  "admits explicitly profiled nested facts through shared list/detail for %s",
  async (entity) => {
    const facts = [{ name: null, state: "unavailable" }];
    const f = fixture(entity, facts);
    expect((await f.list()).data[0]?.details).toEqual(facts);
    expect((await f.get()).data?.details).toEqual(facts);
  },
);
it.each([
  [{ name: null, state: "unavailable", secret: "must not escape" }],
  [{ name: { secret: "nested" }, state: "unavailable" }],
  [{ name: null }],
  [
    { name: null, state: "unavailable" },
    { name: null, state: "unavailable" },
    { name: null, state: "unavailable" },
  ],
  { name: null, state: "unavailable" },
])(
  "denies malformed or unprofiled members before returning list/detail",
  async (value) => {
    const f = fixture("sample", value);
    await expect(f.list()).rejects.toMatchObject({
      code: "ENTITY_STRUCTURED_PROJECTION_INVALID",
    });
    await expect(f.get()).rejects.toMatchObject({
      code: "ENTITY_STRUCTURED_PROJECTION_INVALID",
    });
  },
);
it("retains the denial for undeclared nested data", async () => {
  const f = fixture("sample", [{ name: null, state: "unavailable" }], false);
  await expect(f.list()).rejects.toMatchObject({
    code: "ENTITY_NESTED_PROVIDER_REQUIRED",
  });
  await expect(f.get()).rejects.toMatchObject({
    code: "ENTITY_NESTED_PROVIDER_REQUIRED",
  });
});
