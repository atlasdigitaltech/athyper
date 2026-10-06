import {
  FoundationContractError,
  validateNativeAiSemantics,
  referenceUuid,
  validateFoundationNode,
  type NativeAiGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  parseEntityAiDescriptor,
  type EntityAiDescriptorV1,
  type EntityAiReferenceContext,
} from "@athyper/server-contract-metadata";
import { canonicalJson, sha256 } from "./deterministic.js";
import type { NativeConversionResource } from "./native-graph-conversion.js";

/** Independently resolved catalogue/resource evidence; never an author-supplied
 * grant. This selected component does not qualify record reads or activation. */
export interface NativeAiContext {
  readonly reference: EntityAiReferenceContext;
  readonly maximumMembers: number;
  readonly fields: readonly {
    id: string;
    key: string;
    representation: "plain" | "masked" | "omitted";
    uuid: boolean;
  }[];
  readonly operations: readonly { id: string; key: string }[];
  readonly searchProfile: { id: string; fields: readonly string[] } | null;
  readonly relationships: readonly {
    key: string;
    relationId: string;
    sourceFieldId: string;
  }[];
  readonly resources: readonly (NativeConversionResource & {
    kind: "insight_provider" | "action" | "presentation_profile";
  })[];
}
export interface NativeAiIdentities {
  readonly profile: string;
  readonly fields: Readonly<Record<string, string>>;
  readonly bindings: Readonly<Record<string, string>>;
  readonly references: Readonly<Record<string, string>>;
}
const fail = (code: string, path: string): never => {
  throw new FoundationContractError(code, path);
};
const order = <T extends { position: number }>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => a.position - b.position);
function context(c: NativeAiContext) {
  if (!Number.isSafeInteger(c.maximumMembers) || c.maximumMembers < 1)
    fail("NATIVE_AI_CONTEXT_INVALID", "/context");
  for (const roster of [c.fields, c.operations]) {
    if (
      new Set(roster.map((r) => r.id)).size !== roster.length ||
      new Set(roster.map((r) => r.key)).size !== roster.length
    )
      fail("NATIVE_AI_CONTEXT_INVALID", "/context/roster");
    for (const row of roster)
      validateFoundationNode(referenceUuid, row.id, "/context/id");
  }
  if (
    new Set(c.resources.map((r) => r.kind + ":" + r.key)).size !==
      c.resources.length ||
    new Set(c.relationships.map((r) => r.key)).size !== c.relationships.length
  )
    fail("NATIVE_AI_CONTEXT_INVALID", "/context/resources");
  for (const r of c.resources) {
    if (
      !r.owner ||
      !r.key ||
      !Number.isSafeInteger(r.version) ||
      r.version < 1 ||
      !/^[a-f0-9]{64}$/.test(r.hash)
    )
      fail("NATIVE_AI_RESOURCE_INVALID", "/context/resources");
  }
}
export function compileNativeAi(
  graph: NativeAiGraph,
  c: NativeAiContext,
): EntityAiDescriptorV1 {
  context(c);
  validateNativeAiSemantics(graph, c.maximumMembers);
  const p = graph.profile[0];
  if (!p) return fail("NATIVE_AI_PROFILE_MISSING", "/ai/profile");
  // Vocabulary needs its separately owned candidate/provenance contract. Never
  // fabricate a learned origin for authored text or discard existing terms.
  if (p.vocabularyLocale !== null || graph.term.length)
    fail("NATIVE_AI_VOCABULARY_ADAPTER_UNAVAILABLE", "/ai/term");
  const summaryFieldKeys = order(graph.field).map((r) => {
    const field = c.fields.find((f) => f.id === r.entityFieldId);
    if (!field || field.uuid || field.representation !== "plain")
      return fail("NATIVE_AI_FIELD_DENIED", "/ai/field/" + r.id);
    return field.key;
  });
  const searchFieldKeys =
    p.searchProfileId === null
      ? []
      : (() => {
          if (!c.searchProfile || p.searchProfileId !== c.searchProfile.id)
            return fail(
              "NATIVE_AI_SEARCH_PROFILE_INVALID",
              "/ai/profile/searchProfileId",
            );
          return c.searchProfile.fields.map((id) => {
            const f = c.fields.find((f) => f.id === id);
            if (!f || f.uuid || f.representation !== "plain")
              return fail("NATIVE_AI_FIELD_DENIED", "/ai/search");
            return f.key;
          });
        })();
  const relationshipKeys = order(graph.reference).map((r) => {
    if (r.referenceKind !== "entity_relation")
      return fail(
        "NATIVE_AI_COLLECTION_ADAPTER_UNAVAILABLE",
        "/ai/reference/" + r.id,
      );
    const binding = c.relationships.filter(
      (b) =>
        b.relationId === r.relationId && b.sourceFieldId === r.sourceFieldId,
    );
    const field = c.fields.find((f) => f.id === r.sourceFieldId);
    if (
      binding.length !== 1 ||
      !field ||
      field.uuid ||
      field.representation !== "plain"
    )
      return fail("NATIVE_AI_REFERENCE_INVALID", "/ai/reference/" + r.id);
    return binding[0]!.key;
  });
  const bindings = order(graph.binding);
  for (const b of bindings)
    if (
      !c.resources.some(
        (r) =>
          r.kind === b.bindingKind &&
          r.key === b.contractKey &&
          r.version === b.contractVersion,
      )
    )
      fail("NATIVE_AI_RESOURCE_UNAVAILABLE", "/ai/binding/" + b.id);
  const result = {
    schemaVersion: 1,
    enabled: p.enabled,
    aliases: [...p.aliases],
    ...(p.description === null ? {} : { description: p.description }),
    summaryFieldKeys,
    searchFieldKeys,
    relationshipKeys,
    contextKinds: [...p.contextKinds],
    insightProviders: bindings
      .filter((b) => b.bindingKind === "insight_provider")
      .map((b) => ({
        id: b.contractKey,
        version: b.contractVersion,
        ...(b.required === null ? {} : { required: b.required }),
      })),
    actions: bindings
      .filter((b) => b.bindingKind === "action")
      .map((b) => {
        const op = c.operations.find((o) => o.id === b.operationId);
        if (!op)
          return fail("NATIVE_AI_OPERATION_INVALID", "/ai/binding/" + b.id);
        return {
          id: b.contractKey,
          version: b.contractVersion,
          operationKey: op.key,
        };
      }),
    presentationProfiles: bindings
      .filter((b) => b.bindingKind === "presentation_profile")
      .map((b) => ({ id: b.contractKey, version: b.contractVersion })),
  };
  return parseEntityAiDescriptor(result, c.reference);
}
export function convertLegacyAi(
  source: unknown,
  c: NativeAiContext,
  ids: NativeAiIdentities,
  sourceHash: string,
): NativeAiGraph {
  context(c);
  if (sha256(source) !== sourceHash)
    fail("NATIVE_AI_SOURCE_HASH_MISMATCH", "/ai");
  const s = parseEntityAiDescriptor(source, c.reference);
  if (s.vocabulary)
    fail("NATIVE_AI_VOCABULARY_ADAPTER_UNAVAILABLE", "/ai/vocabulary");
  const field = (key: string) =>
    c.fields.find((f) => f.key === key) ??
    fail("NATIVE_AI_FIELD_DENIED", "/ai/" + key);
  const search = s.searchFieldKeys.map((key) => field(key).id);
  if (
    search.length &&
    (!c.searchProfile ||
      canonicalJson(search) !== canonicalJson(c.searchProfile.fields))
  )
    fail("NATIVE_AI_SEARCH_PROFILE_INVALID", "/ai/searchFieldKeys");
  const bindings = [
    ...s.insightProviders.map((b) => ({
      ...b,
      kind: "insight_provider" as const,
      operationKey: null,
    })),
    ...s.actions.map((b) => ({ ...b, kind: "action" as const })),
    ...s.presentationProfiles.map((b) => ({
      ...b,
      kind: "presentation_profile" as const,
      operationKey: null,
    })),
  ];
  const exact = (
    actual: Readonly<Record<string, string>>,
    keys: readonly string[],
  ) => {
    if (
      canonicalJson(Object.keys(actual).sort()) !==
      canonicalJson([...keys].sort())
    )
      fail("NATIVE_AI_IDENTITY_INVENTORY_INVALID", "/ai/identities");
  };
  exact(ids.fields, s.summaryFieldKeys);
  exact(ids.references, s.relationshipKeys);
  exact(
    ids.bindings,
    bindings.map((b) => b.kind + ":" + b.id),
  );
  const graph: NativeAiGraph = {
    profile: [
      {
        id: ids.profile,
        enabled: s.enabled,
        description: s.description ?? null,
        aliases: [...s.aliases],
        contextKinds: [...s.contextKinds],
        searchProfileId: search.length ? c.searchProfile!.id : null,
        vocabularyLocale: null,
      },
    ],
    field: s.summaryFieldKeys.map((key, i) => ({
      id: ids.fields[key]!,
      aiProfileId: ids.profile,
      entityFieldId: field(key).id,
      position: i + 1,
    })),
    binding: bindings.map((b) => ({
      id: ids.bindings[b.kind + ":" + b.id]!,
      aiProfileId: ids.profile,
      bindingKind: b.kind,
      contractKey: b.id,
      contractVersion: b.version,
      required: "required" in b ? (b.required ?? null) : null,
      operationId:
        b.operationKey === null
          ? null
          : (c.operations.find((o) => o.key === b.operationKey)?.id ??
            fail("NATIVE_AI_OPERATION_INVALID", "/ai/actions")),
      position:
        bindings
          .filter((p) => p.kind === b.kind)
          .findIndex((p) => p.id === b.id) + 1,
    })),
    reference: s.relationshipKeys.map((key, i) => {
      const r =
        c.relationships.find((r) => r.key === key) ??
        fail("NATIVE_AI_REFERENCE_INVALID", "/ai/relationships");
      return {
        id: ids.references[key]!,
        aiProfileId: ids.profile,
        referenceKind: "entity_relation",
        relationId: r.relationId,
        sourceFieldId: r.sourceFieldId,
        collectionContractKey: null,
        collectionContractVersion: null,
        position: i + 1,
      };
    }),
    term: [],
  };
  if (canonicalJson(compileNativeAi(graph, c)) !== canonicalJson(source))
    fail("NATIVE_AI_NOT_LOSSLESS", "/ai");
  return graph;
}
