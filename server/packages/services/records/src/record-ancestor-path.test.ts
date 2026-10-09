import { describe, expect, it } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { createEntityListService } from "./entity-list-service.js";
import { createInMemoryRecordPersistence } from "./in-memory-record-repository.js";
import { createRecordListExecutor, createRecordQueryService } from "./query-service.js";

// The ancestor path on the record detail read (Entity list Tree blueprint B5, section 5.7).
const id = (n: number) => `7f3c2e1d-4b5a-4c6d-8e9f-${String(n).padStart(12, "0")}`;
const descriptor = {
  schema: "athyper.entity-runtime-descriptor/1.0", entityCode: "gl_account", planeKey: "neon",
  releaseId: "r", releaseNo: 1, contractHash: "a".repeat(64), compiledHash: "b".repeat(64),
  detailRouteTemplate: "/app/entity/gl_account/:recordId",
  storage: { schema: "app", object: "gl_account", idField: "id", tenantField: "tenant_id", softDeleteField: "deleted_at" },
  fields: [
    { key: "code", storagePath: "code", type: "string", required: true, writableOn: [], filterable: true },
    { key: "name", storagePath: "name", type: "string", required: true, writableOn: [], list: { semanticRole: "title" } },
    { key: "parent", storagePath: "parent_id", type: "reference", required: false, writableOn: [], filterable: true, referenceTargetEntity: "gl_account" },
  ],
  operations: { read: { code: "read", permissionCode: "gl_account.read" } },
  listPresentation: { identityField: "code" },
  hierarchy: { parentField: "parent", maxDepth: 6 },
} as unknown as EntityRuntimeDescriptor;
const tenantId = "11111111-1111-4111-8111-111111111111";
const context = {
  planeKey: "neon", realmKey: "athyper", tenantId, principalId: "actor", authEpoch: 1, profileHash: "p", requestId: "r",
  permissions: { planeKey: "neon", tenantId, principalId: "actor", principalFingerprint: "a", profileHash: "p", schemaHash: "s", resolvedAt: 1, allowed: [], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [] },
} as unknown as VerifiedRequestContext;

function lists(described = descriptor) {
  const persistence = createInMemoryRecordPersistence();
  persistence.seed(described, tenantId, [
    { id: id(1), tenant_id: tenantId, code: "1000", name: "Assets", parent_id: null },
    { id: id(2), tenant_id: tenantId, code: "1100", name: "Current assets", parent_id: id(1) },
    { id: id(3), tenant_id: tenantId, code: "1110", name: "Cash and bank", parent_id: id(2) },
    { id: id(4), tenant_id: tenantId, code: "2100", name: "Hidden parent", parent_id: null, deleted_at: "2026-10-01T00:00:00Z" },
    { id: id(5), tenant_id: tenantId, code: "2110", name: "Orphan", parent_id: id(4) },
  ]);
  const options = { ...persistence, metadata: { getEntityDescriptor: async () => described }, authorizer: { authorize: async () => ({ allowed: true as const }) } };
  const listExecutor = createRecordListExecutor(options);
  return createEntityListService({ ...options, listExecutor, queries: createRecordQueryService(options, listExecutor) });
}

describe("record ancestor path", () => {
  it("lists the visible ancestors root first, with readable labels and record links", async () => {
    const read = await lists().detailRead(context, "gl_account", id(3));
    expect(read.ancestorPath).toEqual({
      items: [
        { id: id(1), label: "1000 Assets", href: `/app/entity/gl_account/${id(1)}` },
        { id: id(2), label: "1100 Current assets", href: `/app/entity/gl_account/${id(2)}` },
      ],
    });
  });

  it("marks a parent the viewer cannot read without naming it, and omits the path for a root", async () => {
    const orphan = await lists().detailRead(context, "gl_account", id(5));
    expect(orphan.ancestorPath).toEqual({ items: [], parentOutsideView: true });
    expect(JSON.stringify(orphan.ancestorPath)).not.toContain("Hidden parent");
    expect((await lists().detailRead(context, "gl_account", id(1))).ancestorPath).toBeUndefined();
  });

  it("is absent for an Entity without a hierarchy", async () => {
    const flat = { ...descriptor, hierarchy: undefined } as unknown as EntityRuntimeDescriptor;
    expect((await lists(flat).detailRead(context, "gl_account", id(3))).ancestorPath).toBeUndefined();
  });
});
