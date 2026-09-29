import { expect, it } from "vitest";
import { equivalentSnapshotRecordContract } from "../shared/entity-runtime/activity-snapshot-compatibility.js";

const artifact = {
  artifactType: "runtime_contract", entityCode: "example", plane: "neon",
  content: { descriptor: { schema: "record/1", source: { entity_id: "stable-id", release_hash: "old" },
    storage: { schema: "shared", object: "example", idField: "id" },
    fields: [{ key: "amount", type: "decimal", storagePath: "amount" }] } },
};
it("permits a publication coordinate change without reinterpreting captured data", () => {
  const next = structuredClone(artifact);
  next.content.descriptor.source.release_hash = "new";
  expect(equivalentSnapshotRecordContract(artifact, next)).toBe(true);
});
it.each(["entity", "plane", "storage", "identity", "type", "binding", "missing"])(
  "rejects incompatible %s metadata", (kind) => {
    const next = structuredClone(artifact);
    if (kind === "entity") next.entityCode = "other";
    if (kind === "plane") next.plane = "mesh";
    if (kind === "storage") next.content.descriptor.storage.object = "other";
    if (kind === "identity") next.content.descriptor.source.entity_id = "other";
    if (kind === "type") next.content.descriptor.fields[0]!.type = "string";
    if (kind === "binding") next.content.descriptor.fields[0]!.storagePath = "other_amount";
    expect(equivalentSnapshotRecordContract(kind === "missing" ? undefined : next, artifact)).toBe(false);
  },
);
