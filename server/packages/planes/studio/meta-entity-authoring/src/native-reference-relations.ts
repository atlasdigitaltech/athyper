import {
  FoundationContractError,
  parseNativeStructuralGraph,
  selectNativeStructuralGraph,
  validateFoundationNode,
  referenceUuid,
  type MetaEntityGraph,
  type MetaEntityRelation,
  type MetaEntityRelationTarget,
  type MetaEntityRelationField,
  type NativeStructuralContext,
} from "@athyper/server-contract-meta-entity-authoring";
import { parseEntityKeyReference } from "@athyper/server-contract-metadata";
import { canonicalJson, sha256 } from "./deterministic.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";
import type {
  NativeConversionResource,
  NativeNestedConversionAdapter,
} from "./native-graph-conversion.js";

/** Independently resolved migration identity and remote key evidence. This is
 * installed owner input, never a draft's claim of target/storage authorization. */
export interface NativeRelationDerivation {
  readonly sourceFieldId: string;
  readonly sourceHash: string;
  readonly labelFieldKey: string;
  readonly resource: NativeConversionResource;
  readonly targetKey: NativeStructuralContext["targets"][number];
  readonly relation: MetaEntityRelation & { readonly id: string };
  readonly target: MetaEntityRelationTarget & { readonly id: string };
  readonly fields: readonly (MetaEntityRelationField & {
    readonly id: string;
  })[];
}
const branches = ["relations", "relationTargets", "relationFields"] as const;
const fail = (path: string): never => {
  throw new FoundationContractError("NATIVE_RELATION_DERIVATION_INVALID", path);
};

/** Checks exact source semantics and all derived rows without accepting extra
 * changes to existing relations. Used by the adapter and outer graph proof. */
export function validateNativeRelationDerivations(
  source: MetaEntityGraph,
  prepared: MetaEntityGraph,
  derivations: readonly NativeRelationDerivation[],
): void {
  validateConversionJsonData(derivations, "/nested/relationDerivations");
  if (
    !Array.isArray(derivations) ||
    derivations.some(
      (d) =>
        !d ||
        typeof d !== "object" ||
        Array.isArray(d) ||
        !d.relation ||
        !d.target ||
        !d.targetKey ||
        !Array.isArray(d.fields),
    ) ||
    new Set(derivations.map((d) => d.sourceFieldId)).size !== derivations.length
  )
    fail("/nested/relationDerivations");
  const additions = {
    relations: derivations.map((d) => d.relation),
    relationTargets: derivations.map((d) => d.target),
    relationFields: derivations.flatMap((d) => d.fields),
  };
  for (const branch of branches) {
    const before = source[branch] ?? [],
      after = prepared[branch] ?? [];
    if (
      canonicalJson(after) !== canonicalJson([...before, ...additions[branch]])
    )
      fail("/prepared/" + branch);
  }
  const remoteKeys = new Map<string, NativeRelationDerivation["targetKey"]>();
  for (const d of derivations) {
    if (
      Object.keys(d).sort().join() !==
      "fields,labelFieldKey,relation,resource,sourceFieldId,sourceHash,target,targetKey"
    )
      fail("/nested/relationDerivations");
    validateFoundationNode(
      referenceUuid,
      d.sourceFieldId,
      "/nested/relationDerivations/sourceFieldId",
    );
    validateFoundationNode(
      { type: "string", pattern: "^[a-f0-9]{64}$" },
      d.sourceHash,
      "/nested/relationDerivations/sourceHash",
    );
    validateFoundationNode(
      {
        type: "object",
        properties: {
          owner: { type: "string", minLength: 1, maxLength: 200 },
          key: { type: "string", minLength: 1, maxLength: 200 },
          version: { type: "integer", minimum: 1, maximum: 2147483647 },
          hash: { type: "string", pattern: "^[a-f0-9]{64}$" },
        },
      },
      d.resource,
      "/nested/relationDerivations/resource",
    );
    if (
      Object.keys(d.targetKey).sort().join() !==
      "entityCode,entityId,fieldKeys,keyKey"
    )
      fail("/nested/relationDerivations/targetKey");
    const field = source.fields.filter((f) => f.id === d.sourceFieldId);
    if (
      field.length !== 1 ||
      field[0]!.status === "deprecated" ||
      field[0]!.valueOrigin !== "stored" ||
      field[0]!.typeConfig?.keyReference === undefined ||
      sha256(field[0]!.typeConfig.keyReference) !== d.sourceHash
    )
      fail("/nested/relationDerivations/source");
    const reference = parseEntityKeyReference(
      field[0]!.typeConfig.keyReference,
    );
    if (
      !reference ||
      reference.targetEntity !== d.targetKey.entityCode ||
      reference.labelField !== d.labelFieldKey ||
      d.target.targetEntityCode !== d.targetKey.entityCode ||
      d.target.targetEntityId !== d.targetKey.entityId ||
      d.target.targetKeyKey !== d.targetKey.keyKey ||
      d.target.entityRelationId !== d.relation.id ||
      d.target.discriminatorValue !== undefined ||
      d.target.isDefault !== true ||
      d.relation.relationKind !== "many_to_one" ||
      !["logical", "foreign_key"].includes(d.relation.resolutionKind) ||
      d.relation.mutationMode !== "read_only" ||
      d.relation.ownershipMode !== "reference" ||
      d.relation.status !== "active" ||
      d.relation.onDelete !== "restrict" ||
      d.relation.onUpdate !== "restrict" ||
      d.relation.inverseRelationKey != null ||
      d.relation.replacementRelationKey != null
    )
      fail("/nested/relationDerivations/target");
    const mappings = d.fields.map((row, i) => {
      const sourceFields = source.fields.filter(
        (f) =>
          f.id === row.sourceFieldId &&
          f.valueOrigin === "stored" &&
          f.status !== "deprecated",
      );
      if (
        sourceFields.length !== 1 ||
        row.entityRelationTargetId !== d.target.id ||
        row.position !== i + 1
      )
        fail("/nested/relationDerivations/fields");
      return { source: sourceFields[0]!.fieldKey, target: row.targetFieldKey };
    });
    if (
      !mappings.some((m) => m.source === field[0]!.fieldKey) ||
      canonicalJson(mappings) !== canonicalJson(reference.fields) ||
      canonicalJson(mappings.map((m) => m.target)) !==
        canonicalJson(d.targetKey.fieldKeys)
    )
      fail("/nested/relationDerivations/fields");
    const key = canonicalJson([d.targetKey.entityId, d.targetKey.keyKey]);
    if (
      remoteKeys.has(key) &&
      canonicalJson(remoteKeys.get(key)) !== canonicalJson(d.targetKey)
    )
      fail("/nested/relationDerivations/targetKey");
    remoteKeys.set(key, d.targetKey);
  }
  // Existing retained relations are checked by the retained validator. Here the
  // selected added subgraph is checked with the same canonical structural schema.
  const structural = selectNativeStructuralGraph({
    ...source,
    keys: [],
    keyFields: [],
    searchProfiles: [],
    searchFields: [],
    ...additions,
    relationTargets: additions.relationTargets.map(
      ({ targetEntityCode: _code, ...row }) => row,
    ),
  });
  // targetEntityCode is an independently resolved compatibility projection, not
  // a second canonical target coordinate or writable DB column.
  parseNativeStructuralGraph(structural, {
    fieldIds: source.fields.map((f) => f.id!),
    targets: [...remoteKeys.values()],
  });
  const all = [
    ...prepared.fields,
    ...(prepared.relations ?? []),
    ...(prepared.relationTargets ?? []),
    ...(prepared.relationFields ?? []),
  ];
  if (
    all.some((row) => !row.id) ||
    new Set(all.map((row) => row.id)).size !== all.length
  )
    fail("/prepared/relations");
  if (
    new Set((prepared.relations ?? []).map((r) => r.relationKey)).size !==
    (prepared.relations ?? []).length
  )
    fail("/prepared/relations");
}

export function createLegacyNativeReferenceRelationsAdapter(input: {
  readonly source: MetaEntityGraph;
  readonly sourceHash: string;
  readonly resource: NativeConversionResource;
  readonly derivations: readonly NativeRelationDerivation[];
}): NativeNestedConversionAdapter {
  input = structuredClone(input);
  validateConversionJsonData(input.source, "/source");
  if (sha256(input.source) !== input.sourceHash)
    throw new FoundationContractError(
      "NATIVE_CONVERSION_SOURCE_HASH_MISMATCH",
      "/source",
    );
  const source = input.source;
  const enrolled = source.fields
    .filter((f) => f.typeConfig?.keyReference !== undefined)
    .map((f) => f.id!)
    .sort();
  if (
    canonicalJson(enrolled) !==
    canonicalJson(input.derivations.map((d) => d.sourceFieldId).sort())
  )
    fail("/mappings");
  const prepared: MetaEntityGraph = input.derivations.length
    ? {
        ...source,
        relations: [
          ...(source.relations ?? []),
          ...input.derivations.map((d) => d.relation),
        ],
        relationTargets: [
          ...(source.relationTargets ?? []),
          ...input.derivations.map((d) => d.target),
        ],
        relationFields: [
          ...(source.relationFields ?? []),
          ...input.derivations.flatMap((d) => d.fields),
        ],
      }
    : structuredClone(source);
  validateNativeRelationDerivations(source, prepared, input.derivations);
  const selected = new Map(input.derivations.map((d) => [d.sourceFieldId, d]));
  return {
    resource: structuredClone(input.resource),
    dependencies: structuredClone([
      ...new Map(
        input.derivations.map((d) => [canonicalJson(d.resource), d.resource]),
      ).values(),
    ]),
    relationDerivations: structuredClone(input.derivations),
    forward(graph) {
      if (sha256(graph) !== input.sourceHash)
        throw new FoundationContractError(
          "NATIVE_CONVERSION_SOURCE_HASH_MISMATCH",
          "/source",
        );
      return structuredClone(prepared);
    },
    reverse(graph, target) {
      validateNativeRelationDerivations(
        source,
        {
          ...source,
          relations: target.relations,
          relationTargets: target.relationTargets,
          relationFields: target.relationFields,
        },
        input.derivations,
      );
      const result = structuredClone(graph);
      // Inverse uses current relation rows, not a captured keyReference value.
      for (const field of result.fields) {
        const d = selected.get(field.id!);
        if (!d) continue;
        const relation = target.relations?.find((r) => r.id === d.relation.id);
        const remote = target.relationTargets?.filter(
          (r) => r.entityRelationId === d.relation.id,
        );
        const mappings = target.relationFields
          ?.filter((r) => r.entityRelationTargetId === d.target.id)
          .sort((a, b) => a.position - b.position);
        if (
          !relation ||
          remote?.length !== 1 ||
          !mappings ||
          remote[0]!.targetEntityId !== d.targetKey.entityId ||
          remote[0]!.targetKeyKey !== d.targetKey.keyKey ||
          mappings.some((r, i) => r.position !== i + 1)
        )
          fail("/inverse/relations");
        const fields = mappings!.map((r) => {
          const matches = result.fields.filter((f) => f.id === r.sourceFieldId);
          if (matches.length !== 1) fail("/inverse/relations");
          return { source: matches[0]!.fieldKey, target: r.targetFieldKey };
        });
        // The label field is independently admitted from the selected reference
        // target-key projection; it has no structural DB value and grants no target access.
        (field as { typeConfig: Record<string, unknown> }).typeConfig = {
          ...field.typeConfig,
          keyReference: {
            targetEntity: d.targetKey.entityCode,
            labelField: d.labelFieldKey,
            fields,
          },
        };
      }
      for (const branch of branches) {
        const ids = new Set(
          branch === "relations"
            ? input.derivations.map((d) => d.relation.id)
            : branch === "relationTargets"
              ? input.derivations.map((d) => d.target.id)
              : input.derivations.flatMap((d) => d.fields.map((f) => f.id)),
        );
        Reflect.set(
          result,
          branch,
          (result[branch] ?? []).filter((r) => !ids.has(r.id!)),
        );
        if (!Object.hasOwn(source, branch))
          Reflect.deleteProperty(result, branch);
      }
      if (sha256(result) !== input.sourceHash)
        throw new FoundationContractError(
          "NATIVE_CONVERSION_NOT_LOSSLESS",
          "/inverse",
        );
      return result;
    },
  };
}
