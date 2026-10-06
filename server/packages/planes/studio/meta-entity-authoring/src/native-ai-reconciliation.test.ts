import { expect, it } from "vitest";
import {
  nativeAiMembers,
  type NativeAiGraph,
  type NativeAiKind,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  changed,
  planNativeAiGraph,
  type StoredRow,
} from "./graph-reconciliation.js";
const id = (n: number) =>
  "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
function fixture(): NativeAiGraph {
  return {
    profile: [
      {
        id: id(1),
        enabled: true,
        description: "Reference",
        aliases: [],
        contextKinds: ["record"],
        searchProfileId: null,
        vocabularyLocale: "en",
      },
    ],
    field: [
      { id: id(2), aiProfileId: id(1), entityFieldId: id(10), position: 1 },
    ],
    binding: [
      {
        id: id(3),
        aiProfileId: id(1),
        bindingKind: "insight_provider",
        contractKey: "reference-insight",
        contractVersion: 1,
        required: true,
        operationId: null,
        position: 1,
      },
    ],
    reference: [
      {
        id: id(4),
        aiProfileId: id(1),
        referenceKind: "entity_relation",
        relationId: id(20),
        sourceFieldId: id(10),
        collectionContractKey: null,
        collectionContractVersion: null,
        position: 1,
      },
    ],
    term: [
      {
        id: id(5),
        aiProfileId: id(1),
        providerBindingId: id(3),
        phrase: "reference",
        originKind: "authored",
        originPlane: null,
        originSourceKind: null,
        originTenantId: null,
        originCandidateId: null,
        originProposalHash: null,
      },
    ],
  };
}
function stored(
  graph: NativeAiGraph,
): Record<NativeAiKind, readonly StoredRow[]> {
  return Object.fromEntries(
    Object.entries(nativeAiMembers).map(([kind, d]) => [
      kind,
      graph[kind as NativeAiKind].map((r) => ({
        id: r.id,
        created_by: id(90),
        created_at: "2026-10-07T00:00:00.123456Z",
        ...Object.fromEntries(
          Object.entries(d.columns).map(([p, c]) => [
            c.column,
            Reflect.get(r, p),
          ]),
        ),
      })),
    ]),
  ) as unknown as Record<NativeAiKind, readonly StoredRow[]>;
}
it("reconciles all five typed AI families through the shared scoped plan, preserving unchanged attribution", () => {
  const graph = fixture(),
    before = stored(graph);
  expect(planNativeAiGraph(graph, before, 100).some(changed)).toBe(false);
  const changedGraph = {
    ...graph,
    profile: graph.profile.map((r) => ({ ...r, description: "Edited" })),
  };
  const plans = planNativeAiGraph(changedGraph, before, 100);
  expect(plans.map((p) => p.table)).toEqual(
    Object.values(nativeAiMembers).map((d) => d.table),
  );
  expect(plans[0]!.update).toEqual([
    { id: id(1), before: before.profile[0], values: { description: "Edited" } },
  ]);
  expect(plans.slice(1).some(changed)).toBe(false);
  const inserts = planNativeAiGraph(
    graph,
    stored({ profile: [], field: [], binding: [], reference: [], term: [] }),
    100,
  );
  expect(
    inserts.every(
      (p) => p.insert.length === 1 && !p.update.length && !p.remove.length,
    ),
  ).toBe(true);
  expect(inserts[1]!.insert[0]!.values).toEqual({
    ai_profile_id: id(1),
    entity_field_id: id(10),
    position: 1,
  });
});
it("preserves learning provenance on echo, rejects changes and unauthoritative new candidate origins", () => {
  const f = fixture();
  const learned: NativeAiGraph = {
    ...f,
    term: f.term.map((r) => ({
      ...r,
      originKind: "learning_candidate",
      originPlane: "studio",
      originSourceKind: "platform",
      originCandidateId: id(70),
      originProposalHash: "a".repeat(64),
    })),
  };
  expect(planNativeAiGraph(learned, stored(learned), 100).some(changed)).toBe(
    false,
  );
  expect(() => planNativeAiGraph(learned, stored(f), 100)).toThrowError(
    expect.objectContaining({ code: "AUTHORING_SERVICE_PROPERTY_IMMUTABLE" }),
  );
  expect(() =>
    planNativeAiGraph(learned, { ...stored(learned), term: [] }, 100),
  ).toThrowError(
    expect.objectContaining({
      code: "AUTHORING_SERVICE_PROPERTY_SOURCE_REQUIRED",
    }),
  );
});
it("rejects dependent identity remaps and malformed graphs before producing any write plan", () => {
  const f = fixture();
  expect(() =>
    planNativeAiGraph(
      { ...f, field: f.field.map((r) => ({ ...r, entityFieldId: id(11) })) },
      stored(f),
      100,
    ),
  ).toThrowError(
    expect.objectContaining({ code: "AUTHORING_MEMBER_REMAP_REQUIRED" }),
  );
  expect(() =>
    planNativeAiGraph(
      { ...f, field: f.field.map((r) => ({ ...r, position: 2 })) },
      stored(f),
      100,
    ),
  ).toThrow("NATIVE_AI_SEMANTICS_INVALID");
  expect(() => planNativeAiGraph(f, stored(f), 1)).toThrow();
  expect(() =>
    planNativeAiGraph(
      {
        ...f,
        profile: [{ ...f.profile[0]!, layoutConfig: {} }],
      } as unknown as NativeAiGraph,
      stored(f),
      100,
    ),
  ).toThrow();
});
