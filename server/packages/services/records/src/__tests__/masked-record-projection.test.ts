import { expect, it } from "vitest";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { entityAuthorizationProfileHash } from "../entity-authorization-rollout.js";
import { createRecordQueryService } from "../query-service.js";
import { projectAuthorizedRecordFields } from "../record-read-access.js";

const descriptor = {
    schema: "athyper.entity-runtime-descriptor/1.0",
  entityCode: "protected_record", planeKey: "neon",
  storage: { schema: "master", object: "protected_record", idField: "id", tenantField: "tenant_id" },
  fields: [
    { key: "id", storagePath: "id", writableOn: [], type: "uuid", required: true },
    { key: "secret", storagePath: "secret", writableOn: [], type: "string", required: false },
  ],
  operations: { read: { code: "read", permissionCode: "protected.read" }, list: { code: "list", permissionCode: "protected.read" } },
  authorization: {
    schemaVersion: 1, entityCode: "protected_record", planeKey: "neon", ownership: "tenant.record.v1",
    directory: { operation: "list", population: "tenant" }, recordReadOperation: "read",
    operations: [
      { key: "list", permissionCode: "protected.read", scope: "tenant.record.v1", target: "collection", effect: "read", requiresParentRead: false, requiresPreflight: false },
      { key: "read", permissionCode: "protected.read", scope: "tenant.record.v1", target: "existing", effect: "read", requiresParentRead: false, requiresPreflight: false },
    ],
    fieldPolicies: [
      { key: "identity", fields: ["id"], readOperation: "read", representation: "plain", writeOperations: [], queryUses: ["export"] },
      { key: "protected", fields: ["secret"], readOperation: "read", representation: "masked", writeOperations: [], queryUses: ["export"] },
    ],
    surfaces: [], relationships: [],
  },
} as unknown as EntityRuntimeDescriptor;
const id = "11111111-1111-4111-8111-111111111111";
const context = { tenantId: "tenant", principalId: "actor", planeKey: "neon",
  realmKey: "realm", authEpoch: 1, profileHash: "profile", requestId: "request",
  permissions: { principalFingerprint: "actor" } } as never;
const raw = { id, secret: "raw-value" };

it("masks generic list, detail, and list-backed export projections", async () => {
  const authorizer = {
    authorize: async () => ({ allowed: true as const }),
    enforcedEntityProfile: () => entityAuthorizationProfileHash(descriptor.authorization!),
  };
  const queries = createRecordQueryService({
    authorizer,
    metadata: { getEntityDescriptor: async () => descriptor },
    repository: {
      list: async () => ({ data: [raw], pagination: { pageSize: 1, hasMore: false, countMode: "none" } }),
      get: async () => raw,
    } as never,
    transactions: { run: async (_plane: unknown, _actor: unknown, work: (tx: object) => Promise<unknown>) => work({}) } as never,
  });
  expect((await queries.list({ context, entityCode: "protected_record" })).data[0]).toMatchObject({ id, secret: "••••" });
  expect((await queries.get({ context, entityCode: "protected_record", recordId: id })).data).toMatchObject({ id, secret: "••••" });
  expect((await queries.list({ context, entityCode: "protected_record", fields: ["id", "secret"] })).data[0]?.secret).toBe("••••");
  expect(raw.secret).toBe("raw-value");
  expect(projectAuthorizedRecordFields(descriptor, { secret: null }, true).secret).toBeNull();
});
