import { expect, it, vi } from "vitest";
import { createAtlasRecordDataGateway } from "./record-data-gateway.js";

it("uses authorized record selection without requiring an exposed primary-key filter", async () => {
  const id = "cca94907-7519-5871-8e3c-6b11aa545c93";
  const context = {
    tenantId: "44444444-4444-4444-8444-444444444444", principalId: id,
    planeKey: "neon", profileHash: "profile", authEpoch: 1, realmKey: "athyper", requestId: "request",
    permissions: { tenantId: "44444444-4444-4444-8444-444444444444", principalId: id,
      planeKey: "neon", profileHash: "profile", allowed: [], denied: [], planLocked: [], planeExcluded: [] },
  } as never;
  const scopeCoordinate = {
    parentEntityCode: "principal", parentRecordId: id, relationshipKey: "notifications",
    parentDescriptorHash: "a".repeat(64),
  };
  const list = vi.fn(async () => ({ data: [{ id, name: "Saved name" }] }));
  const gateway = createAtlasRecordDataGateway({
    metadata: { getEntityDescriptor: async () => ({
      entityCode: "principal", planeKey: "neon", compiledHash: "descriptor",
      storage: { idField: "id" }, fields: [{ key: "name" }, { key: "id", filterable: false }],
    }) } as never,
    records: { list } as never,
    fieldSecurity: { project: async ({ rows }) => rows },
    allowProjectedContentRevision: true, maxRows: 3, maxResponseBytes: 8192,
  });
  const status = { field: "status", operator: "eq" as const, value: "active" };
  const request = {
    entityCode: "principal", fields: ["name"], limit: 1, scopeCoordinate,
    filters: [{ field: "id", operator: "eq" as const, value: id }, status],
  };
  const result = await gateway.query({ context, request });
  expect(list).toHaveBeenCalledWith(expect.objectContaining({ recordIds: [id], filters: [status], scopeCoordinate }));
  expect(result.sources[0]).toMatchObject({ entityCode: "principal", recordId: id });
  list.mockClear();
  await expect(gateway.query({ context, request: { ...request, filters: [...request.filters,
    { field: "id", operator: "eq", value: "d04198ac-53cf-5e94-969f-b6f75f176fa2" },
  ] } })).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
  expect(list).not.toHaveBeenCalled();
});
