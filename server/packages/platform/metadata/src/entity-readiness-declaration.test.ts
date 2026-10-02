import { expect, it } from "vitest";
import { parseEntityRuntimeDescriptor } from "./descriptor-parser.js";

function row(required?: boolean) {
  return {
    entity_code: "country",
    release_id: "release-1",
    release_no: 1,
    entity_contract_hash: "a".repeat(64),
    compiled_hash: "b".repeat(64),
    plane_code: "neon",
    compiled_json: {
      schema: "athyper.entity-runtime-descriptor/1.0",
      entityCode: "country",
      planeKey: "neon",
      storage: {
        schema: "master",
        object: "country",
        idField: "id",
        tenantField: "tenant_id",
      },
      fields: [
        {
          key: "name",
          storagePath: "name",
          type: "string",
          required: true,
          writableOn: [],
          searchable: true,
        },
      ],
      operations: { read: { code: "read", permissionCode: "country.read" } },
      ai: {
        schemaVersion: 1,
        enabled: true,
        aliases: [],
        summaryFieldKeys: ["name"],
        searchFieldKeys: ["name"],
        relationshipKeys: [],
        contextKinds: ["record"],
        insightProviders: [
          {
            id: "entity_read_record",
            version: 1,
            ...(required === undefined ? {} : { required }),
          },
        ],
        actions: [],
        presentationProfiles: [],
      },
    },
  };
}
it.each([true, false])(
  "cannot bypass readiness by omitting compiler pins for required=%s",
  (required) => {
    expect(() => parseEntityRuntimeDescriptor(row(required))).toThrow(
      "ENTITY_AI_MANIFEST_BINDINGS_REQUIRED",
    );
  },
);
it("preserves historical declarations that predate availability flags", () => {
  expect(parseEntityRuntimeDescriptor(row()).ai?.insightProviders).toEqual([
    { id: "entity_read_record", version: 1 },
  ]);
});
it("accepts a required declaration only with matching immutable compiler bindings", () => {
  const value = row(true);
  const descriptor = parseEntityRuntimeDescriptor({
    ...value,
    compiled_json: {
      ...value.compiled_json,
      aiManifestBindings: {
        schema: "entity-ai-manifest-bindings/1",
        plane: "neon",
        tools: [
          {
            id: "entity_read_record",
            version: "1",
            required: true,
            manifestHash: "c".repeat(64),
            inputSchemaHash: "d".repeat(64),
            resultSchemaHash: "e".repeat(64),
          },
        ],
      },
    },
  });
  expect(descriptor.aiManifestBindings?.tools[0]?.required).toBe(true);
});
