import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import type {
  MetaEntityGraph,
  NativeMetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  compileSharedReferenceProduct,
  parseSharedReferenceProduct,
} from "./authoring/product.js";
import {
  createHistoricalNativeReferenceRelationsAdapter,
  validateNativeRelationDerivations,
  type NativeRelationDerivation,
} from "./native-reference-relations.js";
import { sha256 } from "./deterministic.js";
const id = (n: number) =>
  "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const resource = {
  owner: "synthetic-tests",
  key: "target-key-catalogue",
  version: 1,
  hash: "a".repeat(64),
};
function fixture(name = "state_region") {
  const product = parseSharedReferenceProduct(
    JSON.parse(
      readFileSync(
        new URL(
          "../../../../../../metadata/entities/common/reference/" +
            name +
            "/definition.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
  const source = compileSharedReferenceProduct(product, "studio").graph;
  const derivations: NativeRelationDerivation[] = source.fields
    .filter((f) => f.typeConfig.keyReference !== undefined)
    .map((f, i) => {
      const r = f.typeConfig.keyReference as {
        targetEntity: string;
        labelField: string;
        fields: { source: string; target: string }[];
      };
      return {
        sourceFieldId: f.id!,
        sourceHash: sha256(r),
        labelFieldKey: r.labelField,
        resource,
        targetKey: {
          entityId: id(100 + i),
          entityCode: r.targetEntity,
          keyKey: "business_code",
          fieldKeys: r.fields.map((m) => m.target),
        },
        relation: {
          id: id(200 + i),
          relationKey: f.fieldKey,
          relationKind: "many_to_one",
          resolutionKind: "logical",
          ownershipMode: "reference",
          mutationMode: "read_only",
          onDelete: "restrict",
          onUpdate: "restrict",
          status: "active",
        },
        target: {
          id: id(300 + i),
          entityRelationId: id(200 + i),
          relationTargetKey: "default",
          targetEntityId: id(100 + i),
          targetEntityCode: r.targetEntity,
          targetKeyKey: "business_code",
          isDefault: true,
        },
        fields: r.fields.map((m, j) => ({
          id: id(400 + i * 10 + j),
          entityRelationTargetId: id(300 + i),
          sourceFieldId: source.fields.find((f) => f.fieldKey === m.source)!
            .id!,
          targetFieldKey: m.target,
          position: j + 1,
        })),
      };
    });
  const input = {
    source,
    sourceHash: sha256(source),
    resource: { ...resource, key: "relation-conversion" },
    derivations,
  };
  return { source, derivations, input };
}
it.each(["country", "state_region"])(
  "maps %s key references into exact canonical read-only relations",
  (name) => {
    const f = fixture(name),
      adapter = createHistoricalNativeReferenceRelationsAdapter(f.input),
      prepared = adapter.forward(f.source);
    expect(prepared.relations ?? []).toHaveLength(f.derivations.length);
    expect(prepared.fields).toEqual(f.source.fields);
    expect(
      adapter.reverse(prepared, prepared as unknown as NativeMetaEntityGraph),
    ).toEqual(f.source);
    if (f.derivations.length) {
      expect(prepared.relations!.map((r) => r.relationKey)).toEqual([
        "country_code",
        "parent_code",
      ]);
      Reflect.set(
        f.input.derivations[0]!.fields[0]!,
        "targetFieldKey",
        "caller_mutation",
      );
      expect(adapter.forward(f.source)).toEqual(prepared);
    }
  },
);
it("rejects missing, stale, duplicate, foreign and mutating relation evidence", () => {
  const f = fixture();
  const reject = (derivations: readonly NativeRelationDerivation[]) =>
    expect(() =>
      createHistoricalNativeReferenceRelationsAdapter({
        ...f.input,
        derivations,
      }),
    ).toThrow();
  reject([]);
  reject([...f.derivations, f.derivations[0]!]);
  reject(f.derivations.map((d) => ({ ...d, sourceHash: "b".repeat(64) })));
  reject(
    f.derivations.map((d) => ({
      ...d,
      targetKey: { ...d.targetKey, entityCode: "foreign_target" },
    })),
  );
  reject(
    f.derivations.map((d) => ({
      ...d,
      relation: { ...d.relation, mutationMode: "source_owned" },
    })),
  );
  reject(
    f.derivations.map((d) => ({
      ...d,
      fields: d.fields.map((r) => ({ ...r, targetFieldKey: "wrong" })),
    })),
  );
  reject(
    f.derivations.map((d) => ({
      ...d,
      target: { ...d.target, isDefault: false },
    })),
  );
});
it("rejects extra target rows, existing-member changes and non-lossless inverse", () => {
  const f = fixture(),
    adapter = createHistoricalNativeReferenceRelationsAdapter(f.input),
    prepared = adapter.forward(f.source);
  expect(() =>
    validateNativeRelationDerivations(
      f.source,
      {
        ...prepared,
        relations: [
          ...prepared.relations!,
          { ...prepared.relations![0]!, id: id(999) },
        ],
      },
      f.derivations,
    ),
  ).toThrow("NATIVE_RELATION_DERIVATION_INVALID");
  expect(() =>
    adapter.forward({
      ...f.source,
      entity: { ...f.source.entity, entityCode: "changed" },
    }),
  ).toThrow("NATIVE_CONVERSION_SOURCE_HASH_MISMATCH");
  expect(() =>
    adapter.reverse(prepared, {
      ...prepared,
      relationFields: prepared.relationFields!.map((r) => ({
        ...r,
        targetFieldKey: "wrong",
      })),
    } as unknown as NativeMetaEntityGraph),
  ).toThrow("NATIVE_RELATION_DERIVATION_INVALID");
});
