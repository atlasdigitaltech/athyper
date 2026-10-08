import { isDeepStrictEqual } from "node:util";
import type { EntityFieldDescriptor } from "@athyper/server-contract-metadata";
import type { CompiledRuntimeSource } from "./compiled-runtime.js";

type Row = Record<string, unknown>;
const fail = (): never => {
  throw Error("PUBLICATION_LOWERING_REFERENCE_UNSUPPORTED");
};
function rows(value: unknown): Row[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some((row) => !row || typeof row !== "object" || Array.isArray(row))
  )
    return fail();
  return value as Row[];
}
/** The shared reader already supports single-target key references. Prove that
 * every authoring relation reaches that representation before releasing it.
 * This neither executes relations nor attests remote storage/access authority.
 */
export function assertNativeReferenceProjection(
  source: Pick<CompiledRuntimeSource, "contract" | "native">,
  descriptor: {
    readonly fields: readonly Pick<
      EntityFieldDescriptor,
      "key" | "keyReference"
    >[];
  },
): void {
  const relations = rows(source.contract.relations);
  const targets = rows(source.contract.relationTargets);
  const mappings = rows(source.contract.relationFields);
  for (const family of [
    "relations",
    "relationTargets",
    "relationFields",
  ] as const) {
    const authored = rows(source.contract[family]).map((row) => {
      if (family !== "relationTargets") return row;
      const { targetEntityCode, ...rest } = row;
      if (
        targetEntityCode !== undefined &&
        !rows(source.native[family]).some(
          (compiled) =>
            compiled.id === row.id &&
            compiled.targetEntityCode === targetEntityCode,
        )
      )
        return fail();
      return rest;
    });
    const compiled = rows(source.native[family]).map((row) => {
      if (family !== "relationTargets") return row;
      const { targetEntityCode, ...rest } = row;
      if (typeof targetEntityCode !== "string" || !targetEntityCode)
        return fail();
      return rest;
    });
    if (!isDeepStrictEqual(authored, compiled)) fail();
  }
  const fields = rows(source.native.fields);
  const usedTargets = new Set<unknown>(),
    usedMappings = new Set<unknown>();
  for (const relation of relations) {
    if (
      !["one_to_one", "many_to_one"].includes(String(relation.relationKind)) ||
      !["foreign_key", "logical"].includes(String(relation.resolutionKind)) ||
      relation.mutationMode !== "read_only" ||
      (relation.ownershipMode !== undefined &&
        relation.ownershipMode !== "reference") ||
      relation.status === "deprecated"
    )
      fail();
    const selected = targets.filter(
      (target) => target.entityRelationId === relation.id,
    );
    if (selected.length !== 1 || selected[0]!.discriminatorValue != null)
      fail();
    const target = selected[0]!;
    const compiledTarget = rows(source.native.relationTargets).find(
      (row) => row.id === target.id,
    )!;
    const mapped = mappings
      .filter((mapping) => mapping.entityRelationTargetId === target.id)
      .sort((a, b) => Number(a.position) - Number(b.position));
    if (
      !mapped.length ||
      mapped.some((mapping, i) => mapping.position !== i + 1)
    )
      fail();
    const expectedFields = mapped.map((mapping) => {
      const selectedFields = fields.filter(
        (field) => field.id === mapping.sourceFieldId,
      );
      if (selectedFields.length !== 1) return fail();
      usedMappings.add(mapping.id);
      return {
        source: selectedFields[0]!.fieldKey,
        target: mapping.targetFieldKey,
      };
    });
    const bound = fields.filter((field) => field.relationId === relation.id);
    if (!bound.length) fail();
    for (const field of bound) {
      const projected = descriptor.fields.filter(
        (row) => row.key === field.fieldKey,
      );
      const reference = projected[0]?.keyReference;
      if (
        projected.length !== 1 ||
        !reference ||
        reference.targetEntity !== compiledTarget.targetEntityCode ||
        !isDeepStrictEqual(reference.fields, expectedFields)
      )
        fail();
    }
    usedTargets.add(target.id);
  }
  if (
    usedTargets.size !== targets.length ||
    usedMappings.size !== mappings.length
  )
    fail();
}
