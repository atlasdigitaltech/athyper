import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  compileNativeAi,
  convertLegacyAi,
  type NativeAiContext,
  type NativeAiIdentities,
} from "./native-ai.js";
import { sha256 } from "./deterministic.js";
import type { EntityAiDescriptorV1 } from "@athyper/server-contract-metadata";
const id = (n: number) =>
  "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
function fixture(name = "country") {
  const document = JSON.parse(
    readFileSync(
      new URL(
        "../../../../../../metadata/entities/common/reference/" +
          name +
          "/definition.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const s: EntityAiDescriptorV1 = document.definition.ai;
  const keys = [
    ...new Set([
      ...s.summaryFieldKeys,
      ...s.searchFieldKeys,
      ...s.relationshipKeys,
    ]),
  ];
  const fields = keys.map((key, i) => ({
    id: id(i + 1),
    key,
    representation: "plain" as const,
    uuid: false,
  }));
  const allBindings = [
    ...s.insightProviders.map((b) => ({
      ...b,
      kind: "insight_provider" as const,
    })),
    ...s.actions.map((b) => ({ ...b, kind: "action" as const })),
    ...s.presentationProfiles.map((b) => ({
      ...b,
      kind: "presentation_profile" as const,
    })),
  ];
  const c: NativeAiContext = {
    reference: {
      entityCode: document.definition.entityCode,
      planeKey: "studio",
      fields: fields.map((f) => ({
        key: f.key,
        searchable: s.searchFieldKeys.includes(f.key),
        reference: s.relationshipKeys.includes(f.key),
      })),
      operationKeys: ["read"],
    },
    maximumMembers: 100,
    fields,
    operations: [{ id: id(100), key: "read" }],
    searchProfile: {
      id: id(101),
      fields: s.searchFieldKeys.map((k) => fields.find((f) => f.key === k)!.id),
    },
    relationships: s.relationshipKeys.map((key, i) => ({
      key,
      relationId: id(200 + i),
      sourceFieldId: fields.find((f) => f.key === key)!.id,
    })),
    resources: allBindings.map((b) => ({
      owner: "synthetic-tests",
      key: b.id,
      kind: b.kind,
      version: b.version,
      hash: "a".repeat(64),
    })),
  };
  const ids: NativeAiIdentities = {
    profile: id(300),
    fields: Object.fromEntries(
      s.summaryFieldKeys.map((key, i) => [key, id(400 + i)]),
    ),
    references: Object.fromEntries(
      s.relationshipKeys.map((key, i) => [key, id(500 + i)]),
    ),
    bindings: Object.fromEntries(
      allBindings.map((b, i) => [b.kind + ":" + b.id, id(600 + i)]),
    ),
  };
  return { s, c, ids };
}
it.each(["country", "state_region"])(
  "round-trips %s's actual AI declaration through typed rows",
  (name) => {
    const { s, c, ids } = fixture(name),
      graph = convertLegacyAi(s, c, ids, sha256(s));
    expect(compileNativeAi(graph, c)).toEqual(s);
    expect(graph.profile[0]!.id).toBe(ids.profile);
    expect(
      graph.binding
        .filter((b) => b.bindingKind === "insight_provider")
        .every((b) => b.required === null),
    ).toBe(true);
  },
);
it("compiles edited typed values and preserves optional false/absence", () => {
  const { s, c, ids } = fixture();
  const source = {
    ...s,
    insightProviders: s.insightProviders.map((b, i) =>
      i ? b : { ...b, required: false },
    ),
  };
  const graph = convertLegacyAi(source, c, ids, sha256(source));
  expect(compileNativeAi(graph, c)).toEqual(source);
  const edited = {
    ...graph,
    profile: graph.profile.map((p) => ({
      ...p,
      description: null,
      aliases: ["reference catalogue"],
    })),
    field: graph.field.slice(0, 1),
  };
  const output = compileNativeAi(edited, c);
  expect(output.description).toBeUndefined();
  expect(output.aliases).toEqual(["reference catalogue"]);
  expect(output.summaryFieldKeys).toEqual(["code"]);
});
it("rejects source mismatch, extra identity mappings and unsafe fields", () => {
  const { s, c, ids } = fixture();
  expect(() => convertLegacyAi(s, c, ids, "b".repeat(64))).toThrow(
    "NATIVE_AI_SOURCE_HASH_MISMATCH",
  );
  expect(() =>
    convertLegacyAi(
      s,
      c,
      { ...ids, fields: { ...ids.fields, foreign: id(900) } },
      sha256(s),
    ),
  ).toThrow("NATIVE_AI_IDENTITY_INVENTORY_INVALID");
  for (const change of [
    { representation: "masked" as const },
    { representation: "omitted" as const },
    { uuid: true },
  ])
    expect(() =>
      convertLegacyAi(
        s,
        { ...c, fields: c.fields.map((f, i) => (i ? f : { ...f, ...change })) },
        ids,
        sha256(s),
      ),
    ).toThrow("NATIVE_AI_FIELD_DENIED");
});
it("rejects foreign relations, resource versions and search order", () => {
  const { s, c, ids } = fixture("state_region"),
    graph = convertLegacyAi(s, c, ids, sha256(s));
  expect(() =>
    compileNativeAi(
      {
        ...graph,
        reference: graph.reference.map((r, i) =>
          i ? r : { ...r, relationId: id(999) },
        ),
      },
      c,
    ),
  ).toThrow("NATIVE_AI_REFERENCE_INVALID");
  expect(() =>
    compileNativeAi(graph, {
      ...c,
      resources: c.resources.map((r, i) => (i ? r : { ...r, version: 2 })),
    }),
  ).toThrow("NATIVE_AI_RESOURCE_UNAVAILABLE");
  expect(() =>
    convertLegacyAi(
      s,
      {
        ...c,
        searchProfile: {
          ...c.searchProfile!,
          fields: [...c.searchProfile!.fields].reverse(),
        },
      },
      ids,
      sha256(s),
    ),
  ).toThrow("NATIVE_AI_SEARCH_PROFILE_INVALID");
});
it("rejects incomplete unions, foreign children, gapped positions and duplicate bindings", () => {
  const { s, c, ids } = fixture(),
    g = convertLegacyAi(s, c, ids, sha256(s));
  expect(() =>
    compileNativeAi(
      {
        ...g,
        field: g.field.map((f, i) => (i ? f : { ...f, aiProfileId: id(999) })),
      },
      c,
    ),
  ).toThrow("NATIVE_AI_PROFILE_SCOPE_INVALID");
  expect(() =>
    compileNativeAi(
      { ...g, field: g.field.map((f, i) => (i ? f : { ...f, position: 100 })) },
      c,
    ),
  ).toThrow("NATIVE_AI_SEMANTICS_INVALID");
  expect(() =>
    compileNativeAi(
      {
        ...g,
        binding: g.binding.map((b) =>
          b.bindingKind === "action" ? { ...b, operationId: null } : b,
        ),
      },
      c,
    ),
  ).toThrow("NATIVE_AI_SEMANTICS_INVALID");
  expect(() =>
    compileNativeAi(
      {
        ...g,
        binding: [
          ...g.binding,
          { ...g.binding[0]!, id: id(999), position: 99 },
        ],
      },
      c,
    ),
  ).toThrow("NATIVE_AI_DUPLICATE_MEMBER");
});
it("does not silently discard learned vocabulary or unregistered collection references", () => {
  const { s, c, ids } = fixture();
  const source = {
    ...s,
    vocabulary: {
      schemaVersion: 1,
      locale: "en",
      terms: [
        {
          phrase: "find countries",
          capabilityId: "entity_lookup",
          origin: {
            plane: "studio",
            candidateId: id(999),
            proposalHash: "a".repeat(64),
          },
        },
      ],
    },
  };
  expect(() => convertLegacyAi(source, c, ids, sha256(source))).toThrow(
    "NATIVE_AI_VOCABULARY_ADAPTER_UNAVAILABLE",
  );
  const g = convertLegacyAi(s, c, ids, sha256(s));
  expect(() =>
    compileNativeAi(
      {
        ...g,
        reference: [
          {
            id: id(999),
            aiProfileId: ids.profile,
            position: 1,
            referenceKind: "registered_collection",
            relationId: null,
            sourceFieldId: null,
            collectionContractKey: "registered.items",
            collectionContractVersion: 1,
          },
        ],
      },
      c,
    ),
  ).toThrow("NATIVE_AI_COLLECTION_ADAPTER_UNAVAILABLE");
});
