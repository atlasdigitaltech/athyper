import { expect, it } from "vitest";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { compareLegacyFieldLineage } from "./legacy-field-lineage.js";
const field = {
  id: "00000000-0000-4000-8000-000000000001",
  fieldKey: "code",
  dataType: "string",
};
const graph = (fields: unknown[]) =>
  ({
    contractSchema: "athyper.meta-entity-contract/2.1",
    fields,
  }) as MetaEntityGraph;
it("records exact-member continuity without assigning a stable identity", () => {
  const r = compareLegacyFieldLineage(graph([field]), graph([field]));
  expect(r.fields[0]).toMatchObject({
    status: "exact-member-candidate",
    stableIdentityId: null,
  });
  expect(r.qualification).toBe("not-established");
});
it("does not infer continuity from equal names or reassign removed identities", () => {
  const r = compareLegacyFieldLineage(
    graph([{ ...field, id: "00000000-0000-4000-8000-000000000002" }]),
    graph([field]),
  );
  expect(r.fields[0]?.status).toBe("rebind-required");
  expect(r.removedFieldIds).toEqual([field.id]);
});
it("requires review for changed semantics or renamed keys", () => {
  for (const patch of [
    { dataType: "uuid" },
    { fieldKey: "other" },
    { label: "New" },
  ])
    expect(
      compareLegacyFieldLineage(graph([{ ...field, ...patch }]), graph([field]))
        .fields[0]?.status,
    ).toBe("changed-member-review-required");
});
it("rejects ambiguous or absent historical member IDs", () => {
  for (const fields of [[field, field], [{ fieldKey: "code" }]])
    expect(() =>
      compareLegacyFieldLineage(graph([field]), graph(fields)),
    ).toThrow("F9_SOURCE_MEMBER_ID_AMBIGUOUS");
});
import { validateLegacyFieldCorrespondence } from "./legacy-field-lineage.js";
import { sha256 } from "./deterministic.js";
it("validates explicit hash-bound correspondence without granting identity authority", () => {
  const previous = graph([field]),
    current = graph([{ ...field, id: "00000000-0000-4000-8000-000000000002" }]);
  const input = {
    currentSourceHash: sha256(current),
    previousSourceHash: sha256(previous),
    mappings: [
      { currentFieldId: current.fields[0]!.id!, previousFieldId: field.id },
    ],
  };
  expect(
    validateLegacyFieldCorrespondence(current, previous, input),
  ).toMatchObject({
    mappedCount: 1,
    unmappedCurrentFieldIds: [],
    unmappedPreviousFieldIds: [],
    authority: "not-established",
  });
  expect(() =>
    validateLegacyFieldCorrespondence(current, previous, {
      ...input,
      currentSourceHash: "0".repeat(64),
    }),
  ).toThrow("F9_SOURCE_HASH_MISMATCH");
  expect(() =>
    validateLegacyFieldCorrespondence(current, previous, {
      ...input,
      mappings: [...input.mappings, ...input.mappings],
    }),
  ).toThrow("F9_MAPPING_AMBIGUOUS");
  const changed = graph([{ ...current.fields[0], dataType: "uuid" }]);
  expect(() =>
    validateLegacyFieldCorrespondence(changed, previous, {
      ...input,
      currentSourceHash: sha256(changed),
    }),
  ).toThrow("F9_MAPPING_SEMANTICS_CHANGED");
  expect(
    validateLegacyFieldCorrespondence(current, previous, {
      ...input,
      mappings: [],
    }),
  ).toMatchObject({
    mappedCount: 0,
    unmappedCurrentFieldIds: [current.fields[0]!.id],
  });
});
