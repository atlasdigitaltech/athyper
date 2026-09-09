import { expect, it } from "vitest";
import { parseEntityRuntimeDescriptor } from "../descriptor-parser.js";

const ai = { schemaVersion: 1, enabled: true, aliases: ["Partner"], summaryFieldKeys: ["code"], searchFieldKeys: ["code"], relationshipKeys: [], contextKinds: ["record"], insightProviders: [{ id: "bp_read_summary", version: 1 }], actions: [{ id: "open_record", version: 1, operationKey: "read" }], presentationProfiles: [{ id: "record_brief", version: 1 }] };
const descriptor = { schema: "athyper.entity-runtime-descriptor/1.0", entityCode: "business_partner", planeKey: "neon", storage: { schema: "master", object: "business_partner", idField: "id", tenantField: "tenant_id" }, fields: [{ key: "code", storagePath: "code", type: "string", required: true, writableOn: [], searchable: true }], operations: { read: { code: "read", permissionCode: "neon.relationship.business_partner.read" } } };
const row = { entity_code: "business_partner", release_id: "release-17", release_no: 17, entity_contract_hash: "a".repeat(64), compiled_hash: "b".repeat(64), plane_code: "neon", compiled_json: descriptor };
it("preserves legacy descriptors without enabling AI or inventing a version field", () => {
  const result = parseEntityRuntimeDescriptor(row);
  expect(result).not.toHaveProperty("ai");
  expect(result.storage).not.toHaveProperty("versionField");
});
it("round-trips valid AI metadata without changing permissions", () => {
  const result = parseEntityRuntimeDescriptor({ ...row, compiled_json: { ...descriptor, ai } });
  expect(result.ai).toEqual(ai);
  expect(result.operations).toEqual(descriptor.operations);
});
it("rejects invalid metadata at the runtime boundary even without Studio validation", () => {
  for (const config of [{ ...ai, schemaVersion: 2 }, { ...ai, searchFieldKeys: ["secret"] }, { ...ai, relationshipKeys: ["unknown"] }, { ...ai, actions: [{ id: "open_record", version: 1, operationKey: "missing" }] }]) {
    expect(() => parseEntityRuntimeDescriptor({ ...row, compiled_json: { ...descriptor, ai: config } })).toThrow();
  }
  expect(() => parseEntityRuntimeDescriptor({ ...row, plane_code: "mesh", compiled_json: { ...descriptor, planeKey: "mesh", ai } })).toThrow(/coordinate mismatch/);
});
