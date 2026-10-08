import { describe, expect, it } from "vitest";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { createInMemoryRecordPersistence } from "./in-memory-record-repository.js";
import { parseRecordListParameters } from "./records-routes.js";

// Tree blueprint section 5.1: the groupsOnly request flag.
describe("groupsOnly", () => {
  it("is accepted only with group, exact counts and no cursor", () => {
    expect(parseRecordListParameters({ group: "status", countMode: "exact", groupsOnly: "true" })).toMatchObject({ group: "status", groupsOnly: true });
    for (const query of [
      { countMode: "exact", groupsOnly: "true" },
      { group: "status", groupsOnly: "true" },
      { group: "status", countMode: "none", groupsOnly: "true" },
      { group: "status", countMode: "exact", groupsOnly: "true", cursor: "abc" },
    ])
      expect(() => parseRecordListParameters(query)).toThrow(/groupsOnly requires group/);
    expect(() => parseRecordListParameters({ group: "status", countMode: "exact", groupsOnly: "false" })).toThrow();
  });

  it("returns exact groups and no rows from the repository", async () => {
    const descriptor = {
      entityCode: "work_item",
      planeKey: "neon",
      storage: { schema: "app", object: "work_item", idField: "id", tenantField: "tenant_id" },
      fields: [{ key: "status", storagePath: "status", type: "enum", required: true, writableOn: [], filterable: true }],
    } as unknown as EntityRuntimeDescriptor;
    const persistence = createInMemoryRecordPersistence();
    const tenantId = "11111111-1111-4111-8111-111111111111";
    persistence.seed(descriptor, tenantId, [
      { id: "7f3c2e1d-4b5a-4c6d-8e9f-000000000001", tenant_id: tenantId, status: "open" },
      { id: "7f3c2e1d-4b5a-4c6d-8e9f-000000000002", tenant_id: tenantId, status: "open" },
      { id: "7f3c2e1d-4b5a-4c6d-8e9f-000000000003", tenant_id: tenantId, status: "done" },
    ]);
    const result = await persistence.repository.list({
      descriptor, tenantId, limit: 10, filters: [], sort: [], group: "status", groupsOnly: true,
      countMode: "exact", projection: ["status"], cursorScope: "test", collectionScope: [],
    });
    expect(result.data).toEqual([]);
    expect(result.groups).toEqual([{ value: "done", count: 1 }, { value: "open", count: 2 }]);
    expect(result.pagination).toMatchObject({ pageSize: 0, hasMore: false, total: 3, countMode: "exact" });
  });
});
