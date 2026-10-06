import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  nativeStructuralMembers,
  parseNativeStructuralGraph,
  type NativeStructuralGraph,
  type NativeStructuralFamily,
} from "@athyper/server-contract-meta-entity-authoring";
import { buildSharedReferenceGraph } from "./authoring/graph-builder.js";
import { parseSharedReferenceProduct } from "./authoring/product.js";
import { canonicalJson, sha256 } from "./deterministic.js";
import {
  decodeNativeStructuralGraph,
  encodeNativeStructuralGraph,
  importNativeStructuralGraph,
  compileNativeStructuralGraph,
  type NativeStructuralCodecContext,
} from "./native-structural-codec.js";
const id = (n: number) =>
  `00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
const context: NativeStructuralCodecContext = {
  entityId: id(100),
  tenantId: null,
  changeSetId: id(101),
  revision: 4,
  authoringSchemaHash: "a".repeat(64),
  maximumBytes: 100_000,
  sourcePositionConvention: "one-based",
  fieldIds: [id(1), id(2)],
  targets: [
    {
      entityId: id(90),
      entityCode: "country",
      keyKey: "code",
      fieldKeys: ["code"],
    },
  ],
};
const fixture = (): NativeStructuralGraph => ({
  keys: [
    {
      id: id(10),
      keyKey: "natural",
      keyKind: "natural",
      uniquenessScope: "global",
      nullSemantics: "not_allowed",
    },
  ],
  keyFields: [
    { id: id(11), entityKeyId: id(10), entityFieldId: id(1), position: 1 },
    { id: id(12), entityKeyId: id(10), entityFieldId: id(2), position: 2 },
  ],
  searchProfiles: [
    {
      id: id(20),
      searchKey: "default",
      searchKind: "keyword",
      languageCode: null,
      isDefault: true,
    },
  ],
  searchFields: [
    {
      id: id(21),
      entitySearchProfileId: id(20),
      entityFieldId: id(2),
      position: 1,
      matchMode: "contains",
      weight: "0.333",
    },
  ],
  relations: [
    {
      id: id(30),
      relationKey: "country",
      relationKind: "many_to_one",
      resolutionKind: "foreign_key",
      ownershipMode: "reference",
      mutationMode: "read_only",
    },
  ],
  relationTargets: [
    {
      id: id(31),
      entityRelationId: id(30),
      relationTargetKey: "country",
      targetEntityId: id(90),
      targetKeyKey: "code",
      discriminatorValue: null,
    },
  ],
  relationFields: [
    {
      id: id(32),
      entityRelationTargetId: id(31),
      sourceFieldId: id(1),
      targetFieldKey: "code",
      position: 1,
    },
  ],
});
const mutate = (fn: (g: any) => void) => {
  const g = structuredClone(fixture());
  fn(g);
  return g;
};
describe("native scalar relational contract, codec and compiler", () => {
  it("round-trips all seven native families without allocating IDs or inserting defaults", () => {
    const graph = fixture();
    const packet = encodeNativeStructuralGraph(graph, context);
    const decoded = decodeNativeStructuralGraph(packet, context);
    expect(decoded).toEqual(graph);
    expect(encodeNativeStructuralGraph(decoded, context)).toBe(packet);
    expect(decoded.searchFields[0]!.weight).toBe("0.333");
    expect(decoded.searchProfiles[0]).not.toHaveProperty("queryOperator");
    expect(decoded.searchProfiles[0]!.languageCode).toBeNull();
  });
  it("compiles existing runtime structural members and resolves target codes independently", () => {
    const result = compileNativeStructuralGraph(fixture(), context);
    expect(result.descriptor.searchFields[0]!.weight).toBe(0.333);
    expect(result.descriptor.relationTargets[0]!.targetEntityCode).toBe(
      "country",
    );
    expect(result.contractHash).toBe(sha256(fixture()));
    expect(result.descriptorHash).toBe(sha256(result.descriptor));
    expect(fixture().relationTargets[0]).not.toHaveProperty("targetEntityCode");
  });
  it("rejects wrong source, schema, revision, resource evidence and corrupt graph hashes", () => {
    const packet = encodeNativeStructuralGraph(fixture(), context);
    for (const edit of [
      (p: any) => (p.source.entityId = id(88)),
      (p: any) => (p.source.tenantId = id(88)),
      (p: any) => p.source.revision++,
      (p: any) => (p.authoringSchemaHash = "b".repeat(64)),
      (p: any) => (p.schema = "unknown"),
      (p: any) => (p.contextHash = "b".repeat(64)),
      (p: any) => (p.graph.searchFields[0].weight = "0.444"),
    ]) {
      const p = JSON.parse(packet);
      edit(p);
      expect(() =>
        decodeNativeStructuralGraph(JSON.stringify(p), context),
      ).toThrow();
    }
    expect(() =>
      decodeNativeStructuralGraph(packet, { ...context, targets: [] }),
    ).toThrow("NATIVE_STRUCTURAL_TARGET_EVIDENCE_MISMATCH");
  });
  it("decodes declared zero-based input once into one-based storage and rejects false provenance", () => {
    const p = JSON.parse(encodeNativeStructuralGraph(fixture(), context));
    p.positionConvention = "zero-based";
    for (const family of ["keyFields", "searchFields", "relationFields"])
      for (const row of p.graph[family]) row.position--;
    p.graphHash = sha256(p.graph);
    const packet = canonicalJson(p);
    const normalized = decodeNativeStructuralGraph(packet, {
      ...context,
      sourcePositionConvention: "zero-based",
    });
    expect(normalized).toEqual(fixture());
    expect(
      decodeNativeStructuralGraph(
        encodeNativeStructuralGraph(normalized, context),
        context,
      ),
    ).toEqual(fixture());
    expect(() => decodeNativeStructuralGraph(packet, context)).toThrow(
      "NATIVE_STRUCTURAL_POSITION_PROVENANCE_MISMATCH",
    );
    expect(() =>
      decodeNativeStructuralGraph(
        encodeNativeStructuralGraph(normalized, context),
        { ...context, sourcePositionConvention: "zero-based" },
      ),
    ).toThrow();
  });
  it("rejects unsupported fields and invalid enums in every member family", () => {
    for (const family of Object.keys(
      nativeStructuralMembers,
    ) as NativeStructuralFamily[])
      expect(() =>
        parseNativeStructuralGraph(
          mutate((g) => (g[family][0].unregistered = true)),
          context,
        ),
      ).toThrow("FOUNDATION_UNSUPPORTED_PROPERTY");
    expect(() =>
      parseNativeStructuralGraph(
        mutate((g) => (g.searchProfiles[0].searchKind = "contains")),
        context,
      ),
    ).toThrow();
    expect(() =>
      parseNativeStructuralGraph(
        mutate((g) => (g.keys[0].keyKind = "guess")),
        context,
      ),
    ).toThrow();
  });
  it("rejects reused IDs, foreign references, holes, duplicates and wrong target key shapes", () => {
    for (const edit of [
      (g: any) => (g.keys[0].id = id(1)),
      (g: any) => (g.keyFields[0].entityKeyId = id(88)),
      (g: any) => (g.searchFields[0].entityFieldId = id(88)),
      (g: any) => (g.keyFields[1].position = 3),
      (g: any) => (g.keyFields[1].position = 1),
      (g: any) => (g.relationFields[0].targetFieldKey = "name"),
      (g: any) => (g.relationTargets[0].targetEntityId = id(88)),
      (g: any) => (g.relationFields[0].entityRelationTargetId = id(88)),
    ])
      expect(() => parseNativeStructuralGraph(mutate(edit), context)).toThrow();
  });
  it("checks scalar constraints and numeric precision without rounding invalid legacy numbers", () => {
    for (const weight of ["0", "0.000", "100.001", "1e1", "1.2345", "NaN", 1])
      expect(() =>
        parseNativeStructuralGraph(
          mutate((g) => (g.searchFields[0].weight = weight)),
          context,
        ),
      ).toThrow();
    expect(() =>
      parseNativeStructuralGraph(
        mutate((g) => {
          g.keys[0].status = "active";
          g.keys[0].deprecatedSinceReleaseNo = 2;
        }),
        context,
      ),
    ).toThrow("NATIVE_STRUCTURAL_LIFECYCLE_INVALID");
    expect(() =>
      parseNativeStructuralGraph(
        mutate((g) => {
          g.relations[0].relationKind = "many_to_many";
          g.relations[0].onDelete = "set_null";
        }),
        context,
      ),
    ).toThrow();
    expect(() =>
      parseNativeStructuralGraph(
        mutate(
          (g) => (g.relationTargets[0].discriminatorValue = "unqualified"),
        ),
        context,
      ),
    ).toThrow("NATIVE_STRUCTURAL_DISCRIMINATOR_INVALID");
  });
  it.each(["country", "state_region"])(
    "round-trips %s source structure through the same implementation",
    (entityCode) => {
      const raw = JSON.parse(
        readFileSync(
          new URL(
            `../../../../../../metadata/entities/common/reference/${entityCode}/definition.json`,
            import.meta.url,
          ),
          "utf8",
        ),
      );
      const graph = buildSharedReferenceGraph(
        parseSharedReferenceProduct(raw).definition,
        "studio",
      );
      // Explicit synthetic saved-row identity fixture. This is not historical F9 reconstruction.
      const saved = {
        ...graph,
        keyFields: graph.keyFields!.map((row, i) => ({
          ...row,
          id: id(200 + i),
        })),
        searchFields: graph.searchFields!.map((row, i) => ({
          ...row,
          id: id(300 + i),
        })),
      };
      const c = {
        ...context,
        fieldIds: graph.fields.map((f) => f.id!),
        targets: [],
      };
      const native = importNativeStructuralGraph(saved, c);
      const packet = encodeNativeStructuralGraph(native, c);
      expect(decodeNativeStructuralGraph(packet, c)).toEqual(native);
      expect(
        compileNativeStructuralGraph(native, c).descriptor.keyFields,
      ).toEqual(saved.keyFields);
      if (entityCode === "state_region")
        expect(
          native.keyFields
            .filter((f) => f.entityKeyId === graph.keys![1]!.id)
            .map((f) => f.position),
        ).toEqual([1, 2]);
    },
  );
  it("admits legacy numeric weights only through an explicit validated adapter", () => {
    const native = fixture();
    const legacy = {
      contractSchema: "athyper.meta-entity-contract/2.1",
      entity: { entityCode: "synthetic" },
      fields: [],
      operations: [],
      ...native,
      searchFields: native.searchFields.map((r) => ({ ...r, weight: 0.333 })),
      relationTargets: native.relationTargets.map((r) => ({
        ...r,
        targetEntityCode: "country",
      })),
    } as any;
    expect(importNativeStructuralGraph(legacy, context)).toEqual(native);
    for (const weight of [NaN, Infinity, 0, 100.001, 1.2345])
      expect(() =>
        importNativeStructuralGraph(
          { ...legacy, searchFields: [{ ...legacy.searchFields[0], weight }] },
          context,
        ),
      ).toThrow();
    expect(() =>
      importNativeStructuralGraph(
        {
          ...legacy,
          relationTargets: [
            { ...legacy.relationTargets[0], targetEntityCode: "forged" },
          ],
        },
        context,
      ),
    ).toThrow();
  });
  it("requires host supplied resource bounds and rejects oversized packets", () => {
    expect(() =>
      encodeNativeStructuralGraph(fixture(), { ...context, maximumBytes: 10 }),
    ).toThrow("NATIVE_STRUCTURAL_PACKAGE_LIMIT");
    expect(() =>
      decodeNativeStructuralGraph("{}", { ...context, maximumBytes: 0 }),
    ).toThrow("NATIVE_STRUCTURAL_CONTEXT_INVALID");
  });
});
