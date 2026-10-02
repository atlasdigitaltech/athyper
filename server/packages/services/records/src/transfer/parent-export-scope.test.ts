import { expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { RecordServiceError } from "../errors.js";
import { createParentCollectionScopeResolver } from "../parent-collection-scope.js";
import { createRecordExportHandler, EXECUTE_RECORD_EXPORT_JOB, RECORD_TRANSFER_QUEUE } from "./transfer-jobs.js";
import type { KyselyRecordTransferStore } from "./kysely-transfer-store.js";
const id = "10000000-0000-4000-8000-000000000001";
const context = { planeKey: "neon", realmKey: "neon", tenantId: id, principalId: id, authEpoch: 1, profileHash: "profile", requestId: "parent-export", permissions: { planeKey: "neon", tenantId: id, principalId: id, principalFingerprint: "actor", profileHash: "profile", schemaHash: "schema", resolvedAt: 1, allowed: [], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [] } } satisfies VerifiedRequestContext;
function fixture() {
  const field = (key: string) => ({ key, storagePath: key, type: key.endsWith("id") ? "uuid" : "string", writableOn: [], classification: "internal" });
  const parent = { entityCode: "parent_record", planeKey: "neon", releaseId: id, compiledHash: "a".repeat(64), storage: { schema: "master", object: "parent_record", idField: "id", tenantField: "tenant_id" }, fields: [field("id"), field("tenant_id")], recordPresentation: { entityRelationships: [{ key: "children", targetEntity: "child_record", readOperation: "list", fields: [{ source: "id", target: "parent_id" }], tenant: { source: "tenant_id", target: "tenant_id" } }] } } as unknown as EntityRuntimeDescriptor;
  const child = { entityCode: "child_record", planeKey: "neon", releaseId: id, compiledHash: "b".repeat(64), storage: { schema: "master", object: "child_record", idField: "id", tenantField: "tenant_id" }, fields: [field("parent_id"), field("tenant_id"), field("name")], operations: { list: { code: "list", permissionCode: "child.read" }, export: { code: "export", permissionCode: "child.export" } }, listPresentation: { dataOperations: { exportFormats: ["csv"] } } } as unknown as EntityRuntimeDescriptor;
  const coordinate = { parentEntityCode: parent.entityCode, parentRecordId: id, relationshipKey: "children", parentDescriptorHash: parent.compiledHash };
  let allowed = true;
  const metadata = { getEntityDescriptor: async (_: VerifiedRequestContext, code: string) => code === parent.entityCode ? parent : child };
  const scopes = createParentCollectionScopeResolver({ metadata, readParent: async () => {
    if (!allowed) throw new RecordServiceError(403, "ENTITY_PARENT_ACCESS_DENIED", "Parent unavailable");
    return { data: { id, tenant_id: context.tenantId } };
  } });
  const list = vi.fn(async (query: { scopeCoordinate?: unknown }) => {
    expect(query.scopeCoordinate).toEqual(coordinate);
    return { data: [{ name: "Authorized saved row" }], pagination: { pageSize: 1, hasMore: false, countMode: "none" as const } };
  });
  const writeExport = vi.fn(async ({ content }: { content: AsyncIterable<Uint8Array> }) => { for await (const _ of content) { /* consume through the real worker */ } return "private.csv"; });
  const store = { claimExport: async () => ({ entityCode: child.entityCode, actorPrincipalId: id, exactFilter: { scopeCoordinate: coordinate, _transfer: { format: "csv", fields: ["name"] } } }), completeExport: vi.fn(), failExport: vi.fn(), releaseExport: vi.fn() } as unknown as KyselyRecordTransferStore;
  const handler = createRecordExportHandler({ store, metadata, authorizer: { authorize: async () => ({ allowed: true }) }, collectionScopes: scopes,
    queries: { list, get: async () => ({ data: null }) }, transactions: { run: async (_plane, _actor, work) => work({} as never) },
    artifacts: { write: async () => "unused", createDownloadUrl: async () => "unused", writeExport },
    audit: { record: async input => ({ ...input, id, occurredAt: "2026-10-02T00:00:00Z", severity: input.severity ?? "info" }) }, outbox: { append: async () => undefined },
  });
  const run = () => handler.handle({ id: "job", name: EXECUTE_RECORD_EXPORT_JOB, queue: RECORD_TRANSFER_QUEUE, data: { planeKey: "neon", tenantId: id, entityCode: child.entityCode, exportRequestId: id, actorPrincipalId: id, exactFilter: {}, context }, attempt: 1, maxAttempts: 3, enqueuedAt: "2026-10-02T00:00:00Z" }, { signal: new AbortController().signal, attempt: 1, reportProgress: async () => undefined });
  return { run, list, writeExport, parent, revoke: () => { allowed = false; } };
}
it("retains the publication-bound parent in background owner queries", async () => {
  const f = fixture();
  await f.run();
  expect(f.list).toHaveBeenCalled();
  expect(f.writeExport).toHaveBeenCalledOnce();
});
it.each(["revoked", "stale"])("denies a %s parent before writing an export artifact", async mode => {
  const f = fixture();
  if (mode === "revoked") f.revoke(); else Object.assign(f.parent, { compiledHash: "c".repeat(64) });
  await expect(f.run()).rejects.toThrow();
  expect(f.list).not.toHaveBeenCalled();
  expect(f.writeExport).not.toHaveBeenCalled();
});
