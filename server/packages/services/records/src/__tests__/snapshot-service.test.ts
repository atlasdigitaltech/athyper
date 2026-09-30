import type { RecordSnapshot } from "@athyper/server-contract-records";
import { describe, expect, it, vi } from "vitest";
import { createRecordSnapshotService } from "../snapshots/snapshot-service.js";

const context = { tenantId: "tenant", principalId: "principal", planeKey: "neon" } as never;
const snapshot = {
  id: "snapshot", entityCode: "partner", entityType: "master.partner", entityId: "record",
  entityContractHash: "current", payloadSchemaVersion: 1,
  payload: { name: "old", secret: "hidden", obsolete: "removed", id: "record" },
} as unknown as RecordSnapshot;
function setup() {
  const descriptor = { entityCode: "partner", contractHash: "current", storage: { schema: "master", object: "partner", versionField: "row_version" }, operations: { read: { permissionCode: "partner.read" } }, fields: [
    { key: "name", writableOn: ["patch"] }, { key: "secret", writableOn: ["patch"], readPermissionCode: "secret.read" }, { key: "id", writableOn: [] },
  ] };
  const authorize = vi.fn(async ({ permissionCode }: { permissionCode: string }) => ({ allowed: permissionCode !== "secret.read" }));
  const get = vi.fn(async () => snapshot as RecordSnapshot | null);
  const capture = vi.fn(async () => ({ kind: "created", snapshot }));
  const query = vi.fn(async () => ({ data: { name: "current", row_version: 2 } as Record<string, unknown> | null }));
  const patch = vi.fn(async () => ({ kind: "VersionConflict", expectedVersion: 2, currentVersion: 3 }));
  const metadata = { getEntityDescriptor: vi.fn(async () => descriptor) };
  const service = createRecordSnapshotService({ authorizer: { authorize } as never, metadata: metadata as never, queries: { get: query } as never, mutations: { patch } as never, repository: { get, capture } as never });
  return { service, get, capture, query, patch, authorize, metadata, descriptor };
}
describe("snapshot service", () => {
  it("scopes reads and filters fields using current permissions", async () => {
    const h = setup();
    expect((await h.service.query(context, "snapshot")).payload).toEqual({ name: "old", id: "record" });
    expect(h.get).toHaveBeenCalledWith(context, "snapshot");
    expect(h.authorize).toHaveBeenCalledWith(expect.objectContaining({ permissionCode: "partner.read", resource: expect.objectContaining({ tenantId: "tenant", recordId: "record" }) }));
  });
  it("rejects denied entity reads", async () => {
    const h = setup(); h.authorize.mockResolvedValue({ allowed: false });
    await expect(h.service.query(context, "snapshot")).rejects.toMatchObject({ statusCode: 403 });
  });
  it.each(["query", "restore"] as const)("returns 404 for missing %s targets", async method => {
    const h = setup(); h.get.mockResolvedValue(null);
    await expect(h.service[method](context, "missing", 2, "idempotency-key-1")).rejects.toMatchObject({ code: "SNAPSHOT_NOT_FOUND" });
    expect(h.patch).not.toHaveBeenCalled();
  });
  it.each([
    { entityCode: undefined }, { entityType: "master.other" },
    { entityContractHash: "old-contract" }, { payloadSchemaVersion: 2 },
  ])("rejects incompatible restore metadata %j", async change => {
    const h = setup(); h.get.mockResolvedValue({ ...snapshot, ...change } as RecordSnapshot);
    await expect(h.service.restore(context, "snapshot", 2, "idempotency-key-1")).rejects.toMatchObject({ statusCode: 409 });
    expect(h.patch).not.toHaveBeenCalled();
  });
  it("restores only patchable fields through the mutation boundary and preserves conflicts", async () => {
    const h = setup();
    await expect(h.service.restore(context, "snapshot", 2, "idempotency-key-1")).resolves.toMatchObject({ kind: "VersionConflict" });
    expect(h.patch).toHaveBeenCalledWith({ context, entityCode: "partner", recordId: "record", input: { name: "old", secret: "hidden" }, expectedVersion: 2, idempotencyKey: "idempotency-key-1", origin: "operation", validationMode: "strict" });
  });
  it("compares nested JSON independently of key order and excludes hidden changes", async () => {
    const h = setup();
    h.get.mockResolvedValueOnce({ ...snapshot, payload: { name: { a: 1, b: [2] }, secret: "before" } }).mockResolvedValueOnce({ ...snapshot, payload: { name: { b: [2], a: 1 }, secret: "after" } });
    expect((await h.service.compare(context, "a", "b")).changedFields).toEqual([]);
  });
  it("reports added, removed and changed fields", async () => {
    const h = setup();
    h.get.mockResolvedValueOnce({ ...snapshot, payload: { name: "before" } }).mockResolvedValueOnce({ ...snapshot, payload: { id: "record" } });
    expect((await h.service.compare(context, "a", "b")).changedFields).toEqual([{ field: "name", before: "before", after: undefined }, { field: "id", before: undefined, after: "record" }]);
  });
  it("rejects comparisons across records", async () => {
    const h = setup(); h.get.mockResolvedValueOnce(snapshot).mockResolvedValueOnce({ ...snapshot, entityId: "other" });
    await expect(h.service.compare(context, "a", "b")).rejects.toMatchObject({ code: "SNAPSHOT_COORDINATE_MISMATCH" });
  });
  it("captures the authorized projection with its source version", async () => {
    const h = setup(); await h.service.capture(context, "partner", "record");
    expect(h.capture).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant", planeKey: "neon", sourceRecordVersion: 2, payload: { name: "current", row_version: 2 }, captureKind: "manual", retentionClass: "standard" }));
  });
  it("does not capture a missing record", async () => {
    const h = setup(); h.query.mockResolvedValue({ data: null });
    await expect(h.service.capture(context, "partner", "record")).rejects.toMatchObject({ statusCode: 404 });
    expect(h.capture).not.toHaveBeenCalled();
  });
  it("rejects a non-UUID correlation ID before persistence", async () => {
    const h = setup();
    await expect(h.service.capture({ ...(context as object), correlationId: "trace-123" } as never, "partner", "record")).rejects.toMatchObject({ statusCode: 400, code: "INVALID_CORRELATION_ID" });
    expect(h.capture).not.toHaveBeenCalled();
  });
});
