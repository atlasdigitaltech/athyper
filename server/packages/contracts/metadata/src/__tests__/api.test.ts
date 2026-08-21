import { describe, expect, expectTypeOf, it } from "vitest";
import type { EntityRuntimeDescriptor, MetadataReader } from "../index.js";

describe("metadata contract API", () => {
  it("represents an activated plane-local descriptor", () => {
    const descriptor = { schema: "athyper.entity-runtime-descriptor/1.0", entityCode: "business_partner", planeKey: "neon", releaseId: "release-1", releaseNo: 1, contractHash: "a".repeat(64), compiledHash: "b".repeat(64), storage: { schema: "master", object: "business_partner", idField: "id", tenantField: "tenant_id", versionField: "row_version", statusField: "status" }, fields: [], operations: {} } as const satisfies EntityRuntimeDescriptor;
    expect(descriptor.storage.schema).toBe("master");
    expectTypeOf<MetadataReader>().toHaveProperty("getEntityDescriptor");
  });
});
