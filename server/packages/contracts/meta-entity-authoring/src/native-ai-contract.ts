import {
  FoundationContractError,
  validateFoundationNode,
  contractJsonSchema,
  type ContractNode,
  type ContractValue,
} from "./foundation-contract.js";
import { referenceUuid } from "./reference-member-contract.js";
const nil = { type: "null" } as const;
const maybe = <const N extends ContractNode>(node: N) =>
  ({ anyOf: [node, nil] }) as const;
const choice = <const V extends readonly string[]>(...values: V) =>
  ({
    anyOf: values.map((value) => ({ const: value })),
  }) as { readonly anyOf: readonly { readonly const: V[number] }[] };
const text = { type: "string", minLength: 1, maxLength: 127 } as const;
const integer = { type: "integer", minimum: 1, maximum: 2147483647 } as const;
const c = <const N extends ContractNode>(
  column: string,
  node: N,
  sqlType: string,
  nullable = false,
  reference?: string,
  serviceOwned = false,
) => ({
  column,
  node,
  sqlType,
  nullable,
  ...(reference ? { reference } : {}),
  serviceOwned,
});
const ref = (name: string, table: string) =>
  c(name, referenceUuid, "uuid", false, table);
const optionalRef = (name: string, table: string) =>
  c(name, maybe(referenceUuid), "uuid", true, table);
const define = <
  const C extends Readonly<
    Record<
      string,
      {
        column: string;
        node: ContractNode;
        sqlType: string;
        nullable: boolean;
      }
    >
  >,
>(
  table: string,
  columns: C,
  unique: readonly (readonly string[])[],
  checks: readonly string[] = [],
) => ({ table, columns, unique, checks });
/** DDL-led entity-facing declarations. Runtime execution policy, credentials,
 * candidate approval and provider manifests remain independently owned. */
export const nativeAiMembers = {
  profile: define(
    "entity_ai_profile",
    {
      enabled: c("enabled", { type: "boolean" }, "boolean"),
      description: c(
        "description",
        maybe({ type: "string", maxLength: 1024 }),
        "text",
        true,
      ),
      aliases: c(
        "aliases",
        {
          type: "array",
          items: { type: "string", minLength: 1, maxLength: 80 },
        },
        "text[]",
      ),
      contextKinds: c(
        "context_kinds",
        { type: "array", items: choice("manage", "record") },
        "text[]",
      ),
      searchProfileId: optionalRef(
        "search_profile_id",
        "entity_search_profile",
      ),
      vocabularyLocale: c(
        "vocabulary_locale",
        maybe({ const: "en" }),
        "text",
        true,
      ),
    },
    [[]],
    [
      "cardinality(aliases)<=20 AND metadata.fn_native_ai_text_array_valid(aliases,80)",
      "cardinality(context_kinds)<=2 AND metadata.fn_native_ai_text_array_valid(context_kinds,80) AND (NOT enabled OR cardinality(context_kinds)>0)",
    ],
  ),
  field: define(
    "entity_ai_field",
    {
      aiProfileId: ref("ai_profile_id", "entity_ai_profile"),
      entityFieldId: ref("entity_field_id", "entity_field"),
      position: c("position", integer, "integer"),
    },
    [
      ["ai_profile_id", "entity_field_id"],
      ["ai_profile_id", "position"],
    ],
  ),
  binding: define(
    "entity_ai_binding",
    {
      aiProfileId: ref("ai_profile_id", "entity_ai_profile"),
      bindingKind: c(
        "binding_kind",
        choice("insight_provider", "action", "presentation_profile"),
        "text",
      ),
      contractKey: c("contract_key", text, "text"),
      contractVersion: c("contract_version", integer, "integer"),
      required: c("required", maybe({ type: "boolean" }), "boolean", true),
      operationId: optionalRef("operation_id", "entity_operation"),
      position: c("position", integer, "integer"),
    },
    [
      ["ai_profile_id", "binding_kind", "contract_key"],
      ["ai_profile_id", "binding_kind", "position"],
    ],
    [
      "(binding_kind='action')=(operation_id IS NOT NULL)",
      "binding_kind='insight_provider' OR required IS NULL",
    ],
  ),
  reference: define(
    "entity_ai_reference",
    {
      aiProfileId: ref("ai_profile_id", "entity_ai_profile"),
      referenceKind: c(
        "reference_kind",
        choice("entity_relation", "registered_collection"),
        "text",
      ),
      relationId: optionalRef("relation_id", "entity_relation"),
      sourceFieldId: optionalRef("source_field_id", "entity_field"),
      collectionContractKey: c(
        "collection_contract_key",
        maybe(text),
        "text",
        true,
      ),
      collectionContractVersion: c(
        "collection_contract_version",
        maybe(integer),
        "integer",
        true,
      ),
      position: c("position", integer, "integer"),
    },
    [["ai_profile_id", "position"]],
    [
      "(reference_kind='entity_relation' AND relation_id IS NOT NULL AND source_field_id IS NOT NULL AND collection_contract_key IS NULL AND collection_contract_version IS NULL) OR (reference_kind='registered_collection' AND relation_id IS NULL AND source_field_id IS NULL AND collection_contract_key IS NOT NULL AND collection_contract_version IS NOT NULL)",
    ],
  ),
  term: define(
    "entity_ai_term",
    {
      aiProfileId: ref("ai_profile_id", "entity_ai_profile"),
      providerBindingId: ref("provider_binding_id", "entity_ai_binding"),
      phrase: c(
        "phrase",
        { type: "string", minLength: 1, maxLength: 80 },
        "text",
      ),
      originKind: c(
        "origin_kind",
        choice("authored", "learning_candidate"),
        "text",
        false,
        undefined,
        true,
      ),
      originPlane: c(
        "origin_plane",
        maybe(choice("studio", "neon", "mesh")),
        "text",
        true,
        undefined,
        true,
      ),
      originSourceKind: c(
        "origin_source_kind",
        maybe(choice("platform", "tenant")),
        "text",
        true,
        undefined,
        true,
      ),
      originTenantId: c(
        "origin_tenant_id",
        maybe(referenceUuid),
        "uuid",
        true,
        undefined,
        true,
      ),
      originCandidateId: c(
        "origin_candidate_id",
        maybe(referenceUuid),
        "uuid",
        true,
        undefined,
        true,
      ),
      originProposalHash: c(
        "origin_proposal_hash",
        maybe({ type: "string", pattern: "^[a-f0-9]{64}$" }),
        "text",
        true,
        undefined,
        true,
      ),
    },
    [["ai_profile_id", "phrase", "provider_binding_id"]],
    [
      "(origin_kind='authored' AND num_nonnulls(origin_plane,origin_source_kind,origin_tenant_id,origin_candidate_id,origin_proposal_hash)=0) OR (origin_kind='learning_candidate' AND origin_plane IS NOT NULL AND origin_candidate_id IS NOT NULL AND origin_proposal_hash IS NOT NULL AND ((origin_source_kind='platform' AND origin_tenant_id IS NULL) OR (origin_source_kind='tenant' AND origin_tenant_id IS NOT NULL)))",
    ],
  ),
} as const;
export type NativeAiKind = keyof typeof nativeAiMembers;
export type NativeAiRow<K extends NativeAiKind> = { readonly id: string } & {
  readonly [P in keyof (typeof nativeAiMembers)[K]["columns"]]: ContractValue<
    (typeof nativeAiMembers)[K]["columns"][P] extends {
      node: infer N extends ContractNode;
    }
      ? N
      : never
  >;
};
export type NativeAiGraph = {
  readonly [K in NativeAiKind]: readonly NativeAiRow<K>[];
};
export function nativeAiRowNode(kind: NativeAiKind): ContractNode {
  return {
    type: "object",
    properties: {
      id: referenceUuid,
      ...Object.fromEntries(
        Object.entries(nativeAiMembers[kind].columns).map(([p, c]) => [
          p,
          c.node,
        ]),
      ),
    },
  };
}
export function nativeAiSchema(): object {
  return contractJsonSchema({
    type: "object",
    properties: Object.fromEntries(
      Object.keys(nativeAiMembers).map((k) => [
        k,
        { type: "array", items: nativeAiRowNode(k as NativeAiKind) },
      ]),
    ),
  });
}
export function validateNativeAiGraph(
  value: unknown,
  maximumMembers: number,
): asserts value is NativeAiGraph {
  if (!Number.isSafeInteger(maximumMembers) || maximumMembers < 1)
    throw new FoundationContractError("NATIVE_AI_LIMIT", "/ai");
  validateFoundationNode(
    {
      type: "object",
      properties: Object.fromEntries(
        Object.keys(nativeAiMembers).map((k) => [
          k,
          { type: "array", items: nativeAiRowNode(k as NativeAiKind) },
        ]),
      ),
    },
    value,
    "/ai",
  );
  const graph = value as NativeAiGraph;
  const rows = Object.values(graph).flat();
  if (
    rows.length > maximumMembers ||
    graph.profile.length > 1 ||
    new Set(rows.map((row) => row.id)).size !== rows.length
  )
    throw new FoundationContractError("NATIVE_AI_INVENTORY_INVALID", "/ai");
  for (const kind of ["field", "binding", "reference", "term"] as const)
    if (graph[kind].some((row) => row.aiProfileId !== graph.profile[0]?.id))
      throw new FoundationContractError(
        "NATIVE_AI_PROFILE_SCOPE_INVALID",
        "/ai/" + kind,
      );
  for (const kind of Object.keys(nativeAiMembers) as NativeAiKind[]) {
    for (const keys of nativeAiMembers[kind].unique) {
      const properties = keys.map(
        (column) =>
          Object.entries(nativeAiMembers[kind].columns).find(
            ([, c]) => c.column === column,
          )![0],
      );
      const identities = graph[kind].map((row) =>
        JSON.stringify(
          properties.map((p) => (row as Record<string, unknown>)[p]),
        ),
      );
      if (new Set(identities).size !== identities.length)
        throw new FoundationContractError(
          "NATIVE_AI_DUPLICATE_MEMBER",
          "/ai/" + kind,
        );
    }
  }
}

/** Cross-row and union constraints also apply before compilation. SQL presence
 * checks alone are insufficient (CHECK accepts NULL). */
export function validateNativeAiSemantics(
  graph: NativeAiGraph,
  maximumMembers: number,
): void {
  validateNativeAiGraph(graph, maximumMembers);
  const fail = (path: string): never => {
    throw new FoundationContractError("NATIVE_AI_SEMANTICS_INVALID", path);
  };
  const dense = (rows: readonly { position: number }[], path: string) => {
    if (
      rows
        .map((r) => r.position)
        .sort((a, b) => a - b)
        .some((p, i) => p !== i + 1)
    )
      fail(path);
  };
  dense(graph.field, "/ai/field");
  dense(graph.reference, "/ai/reference");
  const profile = graph.profile[0];
  if (
    profile &&
    (profile.aliases.length > 20 ||
      profile.contextKinds.length > 2 ||
      new Set(profile.aliases).size !== profile.aliases.length ||
      new Set(profile.contextKinds).size !== profile.contextKinds.length ||
      (profile.enabled && profile.contextKinds.length === 0))
  )
    fail("/ai/profile");
  for (const kind of [
    "insight_provider",
    "action",
    "presentation_profile",
  ] as const)
    dense(
      graph.binding.filter((b) => b.bindingKind === kind),
      "/ai/binding/" + kind,
    );
  for (const b of graph.binding)
    if (
      (b.bindingKind === "action") !== (b.operationId !== null) ||
      (b.bindingKind !== "insight_provider" && b.required !== null)
    )
      fail("/ai/binding/" + b.id);
  for (const r of graph.reference) {
    const relation =
      r.relationId !== null &&
      r.sourceFieldId !== null &&
      r.collectionContractKey === null &&
      r.collectionContractVersion === null;
    const collection =
      r.relationId === null &&
      r.sourceFieldId === null &&
      r.collectionContractKey !== null &&
      r.collectionContractVersion !== null;
    if (!(r.referenceKind === "entity_relation" ? relation : collection))
      fail("/ai/reference/" + r.id);
  }
  for (const t of graph.term) {
    const provider = graph.binding.find((b) => b.id === t.providerBindingId);
    if (
      !provider ||
      provider.bindingKind !== "insight_provider" ||
      !profile?.vocabularyLocale
    )
      fail("/ai/term/" + t.id);
    const provenance = [
      t.originPlane,
      t.originSourceKind,
      t.originTenantId,
      t.originCandidateId,
      t.originProposalHash,
    ];
    if (
      t.originKind === "authored"
        ? provenance.some((p) => p !== null)
        : t.originPlane === null ||
          t.originCandidateId === null ||
          t.originProposalHash === null ||
          !(t.originSourceKind === "platform"
            ? t.originTenantId === null
            : t.originSourceKind === "tenant" && t.originTenantId !== null)
    )
      fail("/ai/term/" + t.id);
  }
}
