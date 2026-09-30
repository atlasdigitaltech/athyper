import assert from "node:assert/strict";
import { test } from "node:test";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { compiledReference } from "../../tooling/scripts/verification/localized-reference-fixture";
import { createInMemoryRecordPersistence } from "../../server/packages/services/records/src/in-memory-record-repository";
import { createRecordListExecutor, createRecordQueryService } from "../../server/packages/services/records/src/query-service";
import { createEntityListService } from "../../server/packages/services/records/src/entity-list-service";
import { parseEntityDetailRead } from "../../packages/contracts/platform/entity-runtime/src/index";

for (const plane of ["neon", "mesh", "studio"] as const) test(`${plane}: compiled Country opens with one read and one field-permission pass`, async () => {
  const descriptor = compiledReference(undefined, plane);
  const context: VerifiedRequestContext = { planeKey: plane, realmKey: "athyper", tenantId: "tenant", principalId: "actor", authEpoch: 1, profileHash: "profile", requestId: "test",
    permissions: { planeKey: plane, tenantId: "tenant", principalId: "actor", principalFingerprint: "actor", profileHash: "profile", schemaHash: "schema", resolvedAt: 1, allowed: [], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [] } };
  let fieldDecisions = 0;
  let reads = 0;
  const memory = createInMemoryRecordPersistence();
  memory.seed(descriptor, context.tenantId, [{ id: "00000000-0000-4000-8000-000000000001", code: "MY", name: "Malaysia" }]);
  const options = { ...memory,
    metadata: { getEntityDescriptor: async () => descriptor },
    repository: { ...memory.repository, get: async (...args: Parameters<typeof memory.repository.get>) => { reads++; return memory.repository.get(...args); } },
    authorizer: { entityDescriptorSupported: () => true, authorize: async (input: { observation?: { surface?: string } }) => {
      if (input.observation?.surface === "field") fieldDecisions++;
      return { allowed: true as const };
    } },
  };
  const listExecutor = createRecordListExecutor(options);
  const queries = createRecordQueryService(options, listExecutor);
  const lists = createEntityListService({ ...options, listExecutor, queries });
  const result = await lists.detailRead(context, "country", "00000000-0000-4000-8000-000000000001");
  assert.equal(result.record.values.name, "Malaysia");
  assert.equal(reads, 1);
  assert.equal(fieldDecisions, descriptor.fields.length);
  assert.equal(fieldDecisions, 22);
  assert.equal(result.descriptor.entity.code, "country");
  assert.equal(parseEntityDetailRead(JSON.parse(JSON.stringify(result))).record.id, result.record.id);
  assert.throws(() => parseEntityDetailRead({ ...result, record: { ...result.record, values: { ...result.record.values, unpublished_secret: "hidden" } } }));
});
