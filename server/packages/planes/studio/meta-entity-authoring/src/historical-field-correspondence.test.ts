import { expect, it } from "vitest";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { compareHistoricalFieldCorrespondence } from "./historical-field-correspondence.js";
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
  const r = compareHistoricalFieldCorrespondence(
    graph([field]),
    graph([field]),
  );
  expect(r.fields[0]).toMatchObject({
    status: "exact-member-candidate",
    stableIdentityId: null,
  });
  expect(r.qualification).toBe("not-established");
});
it("does not infer continuity from equal names or reassign removed identities", () => {
  const r = compareHistoricalFieldCorrespondence(
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
      compareHistoricalFieldCorrespondence(
        graph([{ ...field, ...patch }]),
        graph([field]),
      ).fields[0]?.status,
    ).toBe("changed-member-review-required");
});
it("rejects ambiguous or absent historical member IDs", () => {
  for (const fields of [[field, field], [{ fieldKey: "code" }]])
    expect(() =>
      compareHistoricalFieldCorrespondence(graph([field]), graph(fields)),
    ).toThrow("F9_SOURCE_MEMBER_ID_AMBIGUOUS");
});
import { validateHistoricalFieldCorrespondence } from "./historical-field-correspondence.js";
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
    validateHistoricalFieldCorrespondence(current, previous, input),
  ).toMatchObject({
    mappedCount: 1,
    unmappedCurrentFieldIds: [],
    unmappedPreviousFieldIds: [],
    authority: "not-established",
  });
  expect(() =>
    validateHistoricalFieldCorrespondence(current, previous, {
      ...input,
      currentSourceHash: "0".repeat(64),
    }),
  ).toThrow("F9_SOURCE_HASH_MISMATCH");
  expect(() =>
    validateHistoricalFieldCorrespondence(current, previous, {
      ...input,
      mappings: [...input.mappings, ...input.mappings],
    }),
  ).toThrow("F9_MAPPING_AMBIGUOUS");
  const changed = graph([{ ...current.fields[0], dataType: "uuid" }]);
  expect(() =>
    validateHistoricalFieldCorrespondence(changed, previous, {
      ...input,
      currentSourceHash: sha256(changed),
    }),
  ).toThrow("F9_MAPPING_SEMANTICS_CHANGED");
  expect(
    validateHistoricalFieldCorrespondence(current, previous, {
      ...input,
      mappings: [],
    }),
  ).toMatchObject({
    mappedCount: 0,
    unmappedCurrentFieldIds: [current.fields[0]!.id],
  });
});

import { proposeHistoricalFieldCorrespondence } from "./historical-field-correspondence.js";
it("prepares exact declarations for review across recreated IDs without granting identity authority", () => {
  const current = graph([
    { ...field, id: "00000000-0000-4000-8000-000000000002" },
  ]);
  const result = proposeHistoricalFieldCorrespondence(current, graph([field]));
  expect(result.mappings).toEqual([
    { currentFieldId: current.fields[0]!.id, previousFieldId: field.id },
  ]);
  expect(result.unresolved).toEqual([]);
  expect(result.reviewRequired).toBe(true);
  expect(result.authority).toBe("not-established");
  expect(result.mappingHash).toMatch(/^[a-f0-9]{64}$/);
});
it("never turns changed declarations, absent properties or duplicate candidates into continuity", () => {
  for (const patch of [
    { dataType: "uuid" },
    { label: null },
    { fieldKey: "renamed" },
  ]) {
    const result = proposeHistoricalFieldCorrespondence(
      graph([{ ...field, ...patch }]),
      graph([field]),
    );
    expect(result.mappings).toEqual([]);
    expect(result.unresolved[0]?.reason).toBe("changed-or-unavailable");
  }
  const duplicate = { ...field, id: "00000000-0000-4000-8000-000000000002" };
  for (const [current, previous] of [
    [graph([field]), graph([field, duplicate])],
    [graph([field, duplicate]), graph([field])],
  ]) {
    const result = proposeHistoricalFieldCorrespondence(current!, previous!);
    expect(result.mappings).toEqual([]);
    expect(result.unresolved.every((x) => x.reason === "ambiguous")).toBe(true);
  }
});

import { validateHistoricalFieldIdentityPlan } from "./historical-field-correspondence.js";

it("requires complete release and previous-field dispositions and binds them to one immutable plan", () => {
  const current = graph([{ ...field, dataType: "uuid" }]);
  const previous = graph([field]);
  const releases = [{ releaseId: "release-a", graph: previous }];
  const input = {
    currentSourceHash: sha256(current),
    releases: [
      {
        releaseId: "release-a",
        previousSourceHash: sha256(previous),
        mappings: [],
        rebindRequiredPreviousFieldIds: [field.id],
      },
    ],
  };
  const result = validateHistoricalFieldIdentityPlan(current, releases, input);
  expect(result.rebindOccurrences).toBe(1);
  expect(result.mappedOccurrences).toBe(0);
  expect(result.authority).toBe("not-established");
  for (const decisions of [
    [],
    [...input.releases, ...input.releases],
    [{ ...input.releases[0]!, releaseId: "unknown" }],
  ])
    expect(() =>
      validateHistoricalFieldIdentityPlan(current, releases, {
        ...input,
        releases: decisions,
      }),
    ).toThrow("F9_RELEASE_COVERAGE_INVALID");
  for (const ids of [[], [field.id, field.id], ["other"]])
    expect(() =>
      validateHistoricalFieldIdentityPlan(current, releases, {
        ...input,
        releases: [
          { ...input.releases[0]!, rebindRequiredPreviousFieldIds: ids },
        ],
      }),
    ).toThrow("F9_LEGACY_DISPOSITION_INCOMPLETE");
  expect(() =>
    validateHistoricalFieldIdentityPlan(current, releases, {
      ...input,
      currentSourceHash: "0".repeat(64),
    }),
  ).toThrow("F9_SOURCE_HASH_MISMATCH");
  expect(() =>
    validateHistoricalFieldIdentityPlan(current, releases, {
      ...input,
      releases: [
        {
          ...input.releases[0]!,
          mappings: [{ currentFieldId: field.id, previousFieldId: field.id }],
          rebindRequiredPreviousFieldIds: [],
        },
      ],
    }),
  ).toThrow("F9_MAPPING_SEMANTICS_CHANGED");
});

import { historicalFieldDependentFindings } from "./historical-field-correspondence.js";
it("classifies type/reference breaks and surfaces source-bound findings to dependents", () => {
  for (const [old, current, kind] of [
    [field, { ...field, dataType: "uuid" }, "semantic-type-change"],
    [
      {
        ...field,
        typeConfig: {
          kind: "string",
          keyReference: { targetEntity: "target" },
        },
      },
      { ...field, typeConfig: { kind: "string" } },
      "reference-binding-change",
    ],
    [field, { ...field, label: "New" }, "unclassified"],
  ] as const) {
    const previous = graph([old]),
      next = graph([current]);
    const plan = validateHistoricalFieldIdentityPlan(
      next,
      [{ releaseId: "release-a", graph: previous }],
      {
        currentSourceHash: sha256(next),
        releases: [
          {
            releaseId: "release-a",
            previousSourceHash: sha256(previous),
            mappings: [],
            rebindRequiredPreviousFieldIds: [field.id],
          },
        ],
      },
    );
    expect(plan.findings[0]).toMatchObject({
      changeKind: kind,
      compatibility: kind === "unclassified" ? "unknown" : "breaking",
      blocking: true,
    });
    const dependency = {
      dependentKey: "dependent",
      releaseId: "release-a",
      sourceHash: sha256(previous),
      fieldId: field.id,
    };
    expect(
      historicalFieldDependentFindings(plan, [dependency])[0],
    ).toMatchObject({
      ...dependency,
      code: "F9_REBIND_REQUIRED",
    });
    expect(
      historicalFieldDependentFindings(plan, [
        { ...dependency, sourceHash: "0".repeat(64) },
      ])[0]?.code,
    ).toBe("F9_DEPENDENCY_SOURCE_UNAVAILABLE");
    expect(
      historicalFieldDependentFindings(plan, [
        { ...dependency, fieldId: "missing" },
      ])[0]?.code,
    ).toBe("F9_DEPENDENCY_FIELD_UNAVAILABLE");
  }
});
