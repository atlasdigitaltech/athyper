import { expect, it } from "vitest";
import { assertNativeReferenceProjection } from "./native-reference-projection.js";
function fixture() {
  const contract = {
    relations: [
      {
        id: "relation",
        relationKey: "parent",
        relationKind: "many_to_one",
        resolutionKind: "logical",
        ownershipMode: "reference",
        mutationMode: "read_only",
      },
    ],
    relationTargets: [
      {
        id: "target",
        entityRelationId: "relation",
        targetEntityId: "entity",
        targetKeyKey: "code",
      },
    ],
    relationFields: [
      {
        id: "mapping",
        entityRelationTargetId: "target",
        sourceFieldId: "field",
        targetFieldKey: "code",
        position: 1,
      },
    ],
  };
  const native = {
    ...structuredClone(contract),
    relationTargets: contract.relationTargets.map((row) => ({
      ...row,
      targetEntityCode: "parent_entity",
    })),
    fields: [{ id: "field", fieldKey: "parent_code", relationId: "relation" }],
  };
  const projected = {
    fields: [
      {
        key: "parent_code",
        keyReference: {
          targetEntity: "parent_entity",
          labelField: "name",
          fields: [{ source: "parent_code", target: "code" }],
        },
      },
    ],
  };
  return {
    contract,
    native,
    projected,
    run: () => assertNativeReferenceProjection({ contract, native }, projected),
  };
}
it("retains independently resolved target keys for supported single-target read-only references", () => {
  const f = fixture();
  expect(f.run).not.toThrow();
  f.contract.relations[0]!.resolutionKind = "foreign_key";
  f.native.relations[0]!.resolutionKind = "foreign_key";
  expect(f.run).not.toThrow();
});
it.each([
  "source",
  "target",
  "dropped",
  "unrepresented",
  "orphan",
  "ordering",
  "mutation",
  "polymorphic",
  "many",
  "mapping",
])("rejects incomplete or unsupported reference lowering: %s", (kind) => {
  const f = fixture();
  if (kind === "source") f.contract.relations[0]!.relationKey = "changed";
  if (kind === "target")
    f.projected.fields[0]!.keyReference.targetEntity = "different";
  if (kind === "dropped") f.native.relations = [];
  if (kind === "unrepresented") f.native.fields[0]!.relationId = "missing";
  if (kind === "orphan") {
    f.contract.relations = [];
    f.native.relations = [];
  }
  if (kind === "ordering") {
    f.contract.relationFields[0]!.position = 2;
    f.native.relationFields[0]!.position = 2;
  }
  if (kind === "mutation") {
    f.contract.relations[0]!.mutationMode = "coordinated";
    f.native.relations[0]!.mutationMode = "coordinated";
  }
  if (kind === "polymorphic") {
    f.contract.relations[0]!.resolutionKind = "polymorphic";
    f.native.relations[0]!.resolutionKind = "polymorphic";
  }
  if (kind === "many") {
    f.contract.relations[0]!.relationKind = "one_to_many";
    f.native.relations[0]!.relationKind = "one_to_many";
  }
  if (kind === "mapping")
    f.projected.fields[0]!.keyReference.fields[0]!.target = "different";
  expect(f.run).toThrow("PUBLICATION_LOWERING_REFERENCE_UNSUPPORTED");
});
