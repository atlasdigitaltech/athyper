import { expect, it } from "vitest";
import { parseEntityRuntimeDescriptor } from "./descriptor-parser.js";

const field = (list: Record<string, unknown>) => ({
  key: "code",
  storagePath: "code",
  type: "string",
  required: true,
  writableOn: [],
  list,
});
const row = (list: Record<string, unknown>) => ({
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
    fields: [field(list)],
    operations: { read: { code: "read", permissionCode: "country.read" } },
  },
});

it("keeps a declared record-card priority", () => {
  expect(
    parseEntityRuntimeDescriptor(row({ cardPriority: "primary" })).fields[0]
      ?.list,
  ).toEqual({ cardPriority: "primary" });
});

it("rejects an unknown record-card priority instead of ignoring it", () => {
  expect(() =>
    parseEntityRuntimeDescriptor(row({ cardPriority: "top" })),
  ).toThrow("field.list.cardPriority is invalid");
});

it("retains a published UUID reference and rejects an implicit string-key join", () => {
  const value = row({});
  const reference = {
    ...value.compiled_json.fields[0]!,
    type: "uuid",
    referenceTargetEntity: "nation",
  };
  expect(
    parseEntityRuntimeDescriptor({
      ...value,
      compiled_json: { ...value.compiled_json, fields: [reference] },
    }).fields[0]?.referenceTargetEntity,
  ).toBe("nation");
  expect(() =>
    parseEntityRuntimeDescriptor({
      ...value,
      compiled_json: {
        ...value.compiled_json,
        fields: [{ ...reference, type: "string" }],
      },
    }),
  ).toThrow("Entity references require a UUID field");
});
