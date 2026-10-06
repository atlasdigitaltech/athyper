import {
  FoundationContractError,
  validateFoundationNode,
  contractJsonSchema,
  type ContractNode,
  type ContractValue,
} from "./foundation-contract.js";
import { referenceUuid } from "./reference-member-contract.js";
import type { MetaEntityGraph } from "./model.js";

const key = { type: "string", pattern: "^[a-z][a-z0-9_]{0,62}$" } as const;
const nullable = <const N extends ContractNode>(node: N) =>
  ({ anyOf: [node, { type: "null" }] }) as const;
const enumeration = <const V extends readonly string[]>(...values: V) =>
  ({ anyOf: values.map((value) => ({ const: value })) }) as {
    readonly anyOf: readonly { readonly const: V[number] }[];
  };
const integer = (maximum: number) =>
  ({ type: "integer", minimum: 1, maximum }) as const;
const column = <const N extends ContractNode>(name: string, node: N) => ({
  column: name,
  node,
});
const lifecycle = {
  status: column("status", enumeration("active", "deprecated")),
  deprecatedSinceReleaseNo: column(
    "deprecated_since_release_no",
    nullable(integer(Number.MAX_SAFE_INTEGER)),
  ),
  plannedRemovalReleaseNo: column(
    "planned_removal_release_no",
    nullable(integer(Number.MAX_SAFE_INTEGER)),
  ),
};
const define = <
  const C extends Readonly<
    Record<string, { column: string; node: ContractNode }>
  >,
  const R extends readonly (keyof C & string)[],
>(
  table: string,
  columns: C,
  required: R,
  unique: readonly (readonly (keyof C & string)[])[],
  order?: { parent: keyof C & string; maximum: number },
) => ({ table, columns, required, unique, ...(order ? { order } : {}) });

/** Existing scalar relational families. These descriptors do not qualify the
 * field/runtime/surface blobs, permission declarations or protected state. */
export const nativeStructuralMembers = {
  keys: define(
    "entity_key",
    {
      keyKey: column("key_key", key),
      keyKind: column(
        "key_kind",
        enumeration("primary", "natural", "alternate", "idempotency"),
      ),
      uniquenessScope: column(
        "uniqueness_scope",
        enumeration("global", "tenant"),
      ),
      nullSemantics: column(
        "null_semantics",
        enumeration("not_allowed", "nulls_distinct", "nulls_not_distinct"),
      ),
      ...lifecycle,
      replacementKeyKey: column("replacement_key_key", nullable(key)),
    },
    ["keyKey", "keyKind", "uniquenessScope"],
    [["keyKey"]],
  ),
  keyFields: define(
    "entity_key_field",
    {
      entityKeyId: column("entity_key_id", referenceUuid),
      entityFieldId: column("entity_field_id", referenceUuid),
      position: column("position", integer(64)),
    },
    ["entityKeyId", "entityFieldId", "position"],
    [
      ["entityKeyId", "entityFieldId"],
      ["entityKeyId", "position"],
    ],
    { parent: "entityKeyId", maximum: 64 },
  ),
  searchProfiles: define(
    "entity_search_profile",
    {
      searchKey: column("search_key", key),
      searchKind: column(
        "search_kind",
        enumeration("keyword", "full_text", "hybrid"),
      ),
      queryOperator: column("query_operator", enumeration("and", "or")),
      minimumQueryLength: column("minimum_query_length", integer(64)),
      languageCode: column(
        "language_code",
        nullable({
          type: "string",
          pattern: "^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$",
        }),
      ),
      normalizationMode: column(
        "normalization_mode",
        enumeration("none", "casefold", "casefold_unaccent"),
      ),
      isDefault: column("is_default", { type: "boolean" }),
      ...lifecycle,
      replacementSearchKey: column("replacement_search_key", nullable(key)),
    },
    ["searchKey", "searchKind"],
    [["searchKey"]],
  ),
  searchFields: define(
    "entity_search_field",
    {
      entitySearchProfileId: column("entity_search_profile_id", referenceUuid),
      entityFieldId: column("entity_field_id", referenceUuid),
      position: column("position", integer(256)),
      matchMode: column(
        "match_mode",
        enumeration("exact", "prefix", "contains", "full_text"),
      ),
      // Exact numeric(6,3) representation. Legacy numbers require the explicit codec adapter.
      weight: column("weight", {
        type: "string",
        pattern:
          "^(?:0\\.[0-9]{1,3}|[1-9][0-9]?(?:\\.[0-9]{1,3})?|100(?:\\.0{1,3})?)$",
      }),
    },
    ["entitySearchProfileId", "entityFieldId", "position", "matchMode"],
    [
      ["entitySearchProfileId", "entityFieldId"],
      ["entitySearchProfileId", "position"],
    ],
    { parent: "entitySearchProfileId", maximum: 256 },
  ),
  relations: define(
    "entity_relation",
    {
      relationKey: column("relation_key", key),
      relationKind: column(
        "relation_kind",
        enumeration("one_to_one", "many_to_one", "one_to_many", "many_to_many"),
      ),
      resolutionKind: column(
        "resolution_kind",
        enumeration("foreign_key", "logical", "polymorphic"),
      ),
      ownershipMode: column(
        "ownership_mode",
        enumeration("reference", "aggregate_child", "shared"),
      ),
      mutationMode: column(
        "mutation_mode",
        enumeration("read_only", "source_owned", "target_owned", "coordinated"),
      ),
      onDelete: column(
        "on_delete",
        enumeration("restrict", "cascade", "set_null", "no_action"),
      ),
      onUpdate: column(
        "on_update",
        enumeration("restrict", "cascade", "no_action"),
      ),
      inverseRelationKey: column("inverse_relation_key", nullable(key)),
      ...lifecycle,
      replacementRelationKey: column("replacement_relation_key", nullable(key)),
    },
    ["relationKey", "relationKind", "resolutionKind"],
    [["relationKey"]],
  ),
  relationTargets: define(
    "entity_relation_target",
    {
      entityRelationId: column("entity_relation_id", referenceUuid),
      relationTargetKey: column("relation_target_key", key),
      targetEntityId: column("target_entity_id", referenceUuid),
      targetKeyKey: column("target_key_key", key),
      discriminatorValue: column(
        "discriminator_value",
        nullable({
          type: "string",
          minLength: 1,
          maxLength: 128,
          pattern: "\\S",
        }),
      ),
      isDefault: column("is_default", { type: "boolean" }),
    },
    ["entityRelationId", "relationTargetKey", "targetEntityId", "targetKeyKey"],
    [
      ["entityRelationId", "relationTargetKey"],
      ["entityRelationId", "discriminatorValue"],
    ],
  ),
  relationFields: define(
    "entity_relation_field",
    {
      entityRelationTargetId: column(
        "entity_relation_target_id",
        referenceUuid,
      ),
      sourceFieldId: column("source_field_id", referenceUuid),
      targetFieldKey: column("target_field_key", key),
      position: column("position", integer(64)),
    },
    ["entityRelationTargetId", "sourceFieldId", "targetFieldKey", "position"],
    [
      ["entityRelationTargetId", "sourceFieldId"],
      ["entityRelationTargetId", "targetFieldKey"],
      ["entityRelationTargetId", "position"],
    ],
    { parent: "entityRelationTargetId", maximum: 64 },
  ),
} as const;
export type NativeStructuralFamily = keyof typeof nativeStructuralMembers;
type NativeColumns<K extends NativeStructuralFamily> =
  (typeof nativeStructuralMembers)[K]["columns"];
type NativeRequired<K extends NativeStructuralFamily> =
  (typeof nativeStructuralMembers)[K]["required"][number];
export type NativeStructuralRow<K extends NativeStructuralFamily> = {
  readonly id: string;
} & {
  readonly [
    P in keyof NativeColumns<K> as P extends NativeRequired<K> ? P : never
  ]: ContractValue<
    NativeColumns<K>[P] extends { node: infer N extends ContractNode }
      ? N
      : never
  >;
} & {
  readonly [
    P in keyof NativeColumns<K> as P extends NativeRequired<K> ? never : P
  ]?: ContractValue<
    NativeColumns<K>[P] extends { node: infer N extends ContractNode }
      ? N
      : never
  >;
};
export type NativeStructuralGraph = {
  readonly [K in NativeStructuralFamily]: readonly NativeStructuralRow<K>[];
};
export interface NativeStructuralContext {
  readonly fieldIds: readonly string[];
  /** Exact governed remote key shape, supplied independently. Neither an import
   * nor its targetEntityCode declaration can establish target authority. */
  readonly targets: readonly {
    readonly entityId: string;
    readonly entityCode: string;
    readonly keyKey: string;
    readonly fieldKeys: readonly string[];
  }[];
}
const fail = (code: string, path: string): never => {
  throw new FoundationContractError(code, path);
};
export function nativeStructuralRowNode(
  family: NativeStructuralFamily,
  patch = false,
): ContractNode {
  const descriptor = nativeStructuralMembers[family];
  return {
    type: "object",
    properties: {
      id: referenceUuid,
      ...Object.fromEntries(
        Object.entries(descriptor.columns).map(([property, c]) => [
          property,
          c.node,
        ]),
      ),
    },
    required: patch ? [] : ["id", ...descriptor.required],
  };
}
export function nativeStructuralSchema(): object {
  return contractJsonSchema({
    type: "object",
    properties: Object.fromEntries(
      (Object.keys(nativeStructuralMembers) as NativeStructuralFamily[]).map(
        (family) => [
          family,
          { type: "array", items: nativeStructuralRowNode(family) },
        ],
      ),
    ),
  });
}
/** Closed saved graph validation; omissions are preserved, never defaulted here. */
export function parseNativeStructuralGraph(
  input: unknown,
  context: NativeStructuralContext,
): NativeStructuralGraph {
  validateFoundationNode(
    {
      type: "object",
      properties: Object.fromEntries(
        (Object.keys(nativeStructuralMembers) as NativeStructuralFamily[]).map(
          (family) => [
            family,
            { type: "array", items: nativeStructuralRowNode(family) },
          ],
        ),
      ),
    },
    input,
    "",
  );
  const graph = input as Record<
    NativeStructuralFamily,
    readonly (Readonly<Record<string, string | number | boolean | null>> & {
      readonly id: string;
    })[]
  >;
  const ids = new Set<string>();
  for (const field of context.fieldIds) {
    validateFoundationNode(referenceUuid, field, "/context/fieldIds");
    if (ids.has(field))
      fail("NATIVE_STRUCTURAL_CONTEXT_INVALID", "/context/fieldIds");
    ids.add(field);
  }
  const targetKeys = new Set<string>();
  for (const target of context.targets) {
    validateFoundationNode(
      referenceUuid,
      target.entityId,
      "/context/targets/entityId",
    );
    validateFoundationNode(
      {
        type: "string",
        pattern: "^[a-z][a-z0-9_]{0,62}(?:[.][a-z][a-z0-9_]{0,62})*$",
      },
      target.entityCode,
      "/context/targets/entityCode",
    );
    validateFoundationNode(key, target.keyKey, "/context/targets/keyKey");
    const coordinate = `${target.entityId}:${target.keyKey}`;
    if (
      targetKeys.has(coordinate) ||
      !target.fieldKeys.length ||
      new Set(target.fieldKeys).size !== target.fieldKeys.length
    )
      fail("NATIVE_STRUCTURAL_CONTEXT_INVALID", "/context/targets");
    targetKeys.add(coordinate);
    for (const fieldKey of target.fieldKeys)
      validateFoundationNode(key, fieldKey, "/context/targets/fieldKeys");
  }
  const fieldIds = new Set(context.fieldIds);
  const memberIds = new Map<NativeStructuralFamily, Set<string>>();
  for (const family of Object.keys(
    nativeStructuralMembers,
  ) as NativeStructuralFamily[]) {
    const d = nativeStructuralMembers[family];
    const local = new Set<string>();
    memberIds.set(family, local);
    for (const [index, row] of graph[family].entries()) {
      const path = `/${family}/${index}`;
      if (ids.has(row.id))
        fail("NATIVE_STRUCTURAL_IDENTITY_CONFLICT", path + "/id");
      ids.add(row.id);
      local.add(row.id);
      for (const unique of d.unique)
        if (
          graph[family].filter((candidate) =>
            unique.every(
              (property) =>
                (candidate[property] ?? null) === (row[property] ?? null),
            ),
          ).length !== 1
        )
          fail("NATIVE_STRUCTURAL_COORDINATE_CONFLICT", path);
      if (row.weight !== undefined && Number(row.weight) <= 0)
        fail("NATIVE_STRUCTURAL_WEIGHT_INVALID", path + "/weight");
      if (
        family === "keys" &&
        row.keyKind === "primary" &&
        row.nullSemantics !== undefined &&
        row.nullSemantics !== "not_allowed"
      )
        fail("NATIVE_STRUCTURAL_PRIMARY_NULL_INVALID", path);
      if (family === "relations") {
        if (
          row.inverseRelationKey === row.relationKey ||
          (row.onDelete === "set_null" &&
            !["one_to_one", "many_to_one"].includes(
              String(row.relationKind),
            )) ||
          (row.ownershipMode === "aggregate_child" &&
            (row.relationKind === "many_to_many" ||
              !["source_owned", "target_owned", "coordinated"].includes(
                String(row.mutationMode),
              )))
        )
          fail("NATIVE_STRUCTURAL_RELATION_INVALID", path);
      }
      const replacement =
        family === "keys"
          ? "replacementKeyKey"
          : family === "searchProfiles"
            ? "replacementSearchKey"
            : family === "relations"
              ? "replacementRelationKey"
              : undefined;
      if (replacement) {
        const logical =
          family === "keys"
            ? "keyKey"
            : family === "searchProfiles"
              ? "searchKey"
              : "relationKey";
        if (
          row[replacement] === row[logical] ||
          ((row.status ?? "active") === "active" &&
            [
              row[replacement],
              row.deprecatedSinceReleaseNo,
              row.plannedRemovalReleaseNo,
            ].some((v) => v != null)) ||
          (row.status === "deprecated" &&
            (typeof row.deprecatedSinceReleaseNo !== "number" ||
              (row.plannedRemovalReleaseNo != null &&
                Number(row.plannedRemovalReleaseNo) <=
                  row.deprecatedSinceReleaseNo) ||
              (family === "searchProfiles" && row.isDefault !== false)))
        )
          fail("NATIVE_STRUCTURAL_LIFECYCLE_INVALID", path);
      }
    }
    if (d.order) {
      const parents = new Set(graph[family].map((row) => row[d.order!.parent]));
      for (const parent of parents) {
        const positions = graph[family]
          .filter((row) => row[d.order!.parent] === parent)
          .map((row) => Number(row.position))
          .sort((a, b) => a - b);
        if (positions.some((position, index) => position !== index + 1))
          fail("NATIVE_STRUCTURAL_ORDER_INVALID", `/${family}`);
      }
    }
  }
  if (
    graph.keys.filter(
      (row) => row.keyKind === "primary" && row.status !== "deprecated",
    ).length > 1 ||
    graph.searchProfiles.filter(
      (row) => row.isDefault === true && row.status !== "deprecated",
    ).length > 1
  )
    fail("NATIVE_STRUCTURAL_DEFAULT_CONFLICT", "");
  const requireId = (
    family: NativeStructuralFamily,
    id: unknown,
    path: string,
  ) => {
    if (!memberIds.get(family)?.has(String(id)))
      fail("NATIVE_STRUCTURAL_FOREIGN_REFERENCE", path);
  };
  for (const row of graph.keyFields) {
    requireId("keys", row.entityKeyId, "/keyFields");
    if (!fieldIds.has(String(row.entityFieldId)))
      fail("NATIVE_STRUCTURAL_FOREIGN_REFERENCE", "/keyFields");
  }
  for (const row of graph.searchFields) {
    requireId("searchProfiles", row.entitySearchProfileId, "/searchFields");
    if (!fieldIds.has(String(row.entityFieldId)))
      fail("NATIVE_STRUCTURAL_FOREIGN_REFERENCE", "/searchFields");
  }
  for (const row of graph.relationTargets) {
    requireId("relations", row.entityRelationId, "/relationTargets");
    const targets = context.targets.filter(
      (t) => t.entityId === row.targetEntityId && t.keyKey === row.targetKeyKey,
    );
    if (
      targets.length !== 1 ||
      !targets[0]!.fieldKeys.length ||
      new Set(targets[0]!.fieldKeys).size !== targets[0]!.fieldKeys.length
    )
      fail("NATIVE_STRUCTURAL_TARGET_EVIDENCE_REQUIRED", "/relationTargets");
    const relation = graph.relations.find(
      (r) => r.id === row.entityRelationId,
    )!;
    if (
      (relation.resolutionKind === "polymorphic") !==
      (row.discriminatorValue != null)
    )
      fail("NATIVE_STRUCTURAL_DISCRIMINATOR_INVALID", "/relationTargets");
    const mappings = graph.relationFields
      .filter((f) => f.entityRelationTargetId === row.id)
      .sort((a, b) => Number(a.position) - Number(b.position));
    if (
      mappings.length !== targets[0]!.fieldKeys.length ||
      mappings.some((m, i) => m.targetFieldKey !== targets[0]!.fieldKeys[i])
    )
      fail("NATIVE_STRUCTURAL_TARGET_KEY_SHAPE_INVALID", "/relationFields");
  }
  for (const row of graph.relationFields) {
    requireId("relationTargets", row.entityRelationTargetId, "/relationFields");
    if (!fieldIds.has(String(row.sourceFieldId)))
      fail("NATIVE_STRUCTURAL_FOREIGN_REFERENCE", "/relationFields");
  }
  return structuredClone(graph) as unknown as NativeStructuralGraph;
}
/** Exact projection; no field/runtime/surface/protected-state properties escape
 * through this sub-contract. Those native families retain their own gates. */
export function selectNativeStructuralGraph(
  graph: MetaEntityGraph,
): Readonly<Record<NativeStructuralFamily, readonly object[]>> {
  return Object.fromEntries(
    Object.keys(nativeStructuralMembers).map((family) => [
      family,
      Reflect.get(graph, family) ?? [],
    ]),
  ) as Readonly<Record<NativeStructuralFamily, readonly object[]>>;
}
