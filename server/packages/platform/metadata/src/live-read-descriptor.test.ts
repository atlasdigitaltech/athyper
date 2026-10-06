import { expect, it } from "vitest";
import { parseEntityRuntimeDescriptor } from "./descriptor-parser.js";
const pin = {
  owner: "platform",
  namespace: "entity",
  key: "reference-security",
  version: 1,
  hash: "c".repeat(64),
};
const source = {
  entityId: "00000000-0000-4000-8000-000000000001",
  releaseId: "00000000-0000-4000-8000-000000000002",
  contractHash: "a".repeat(64),
  tenantId: null,
};
const liveReadContract = {
  schema: "entity.live-read/1",
  source,
  security: pin,
  storageAuthority: { ...pin, key: "reference-storage" },
};
const row = {
  entity_code: "fixture_reference",
  release_id: source.releaseId,
  release_no: 1,
  entity_contract_hash: source.contractHash,
  compiled_hash: "b".repeat(64),
  plane_code: "studio",
  compiled_json: {
    schema: "athyper.entity-runtime-descriptor/1.1",
    entityCode: "fixture_reference",
    planeKey: "studio",
    liveReadContract,
    storage: { schema: "shared", object: "fixture_reference", idField: "id" },
    fields: [
      {
        key: "code",
        storagePath: "code",
        type: "string",
        required: true,
        writableOn: [],
      },
    ],
    operations: { read: { code: "read" } },
  },
};
it("retains the exact compiled live-read pins at the shared metadata boundary", () => {
  expect(parseEntityRuntimeDescriptor(row)).toMatchObject({
    schema: "athyper.entity-runtime-descriptor/1.1",
    liveReadContract,
  });
});
it("does not allow missing, unknown or mismatched live authority to fall into legacy absence semantics", () => {
  for (const compiled_json of [
    { ...row.compiled_json, liveReadContract: undefined },
    {
      ...row.compiled_json,
      liveReadContract: { ...liveReadContract, schema: "unknown" },
    },
    {
      ...row.compiled_json,
      liveReadContract: {
        ...liveReadContract,
        source: { ...source, contractHash: "d".repeat(64) },
      },
    },
    { ...row.compiled_json, schema: "athyper.entity-runtime-descriptor/1.0" },
    { ...row.compiled_json, schema: "athyper.entity-runtime-descriptor/1.2" },
  ]) {
    expect(() =>
      parseEntityRuntimeDescriptor({ ...row, compiled_json }),
    ).toThrow();
  }
});
it("continues to decode historical metadata without inventing live authority", () => {
  const { liveReadContract: _pin, ...compiled } = row.compiled_json;
  expect(
    parseEntityRuntimeDescriptor({
      ...row,
      compiled_json: {
        ...compiled,
        schema: "athyper.entity-runtime-descriptor/1.0",
      },
    }),
  ).not.toHaveProperty("liveReadContract");
});
