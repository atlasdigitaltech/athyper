import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  parseSharedReferenceProduct,
  compileSharedReferenceProduct,
} from "./authoring/product.js";
import {
  createLegacyNativeCoreAdapters,
  type LegacyNativeCoreAdapterInput,
} from "./legacy-native-core-adapters.js";
import {
  coreFixtureContext,
  coreFixtureId,
} from "../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js";
import { sha256 } from "./deterministic.js";
function fixture(name: string) {
  const product = parseSharedReferenceProduct(
    JSON.parse(
      readFileSync(
        new URL(
          `../../../../../../metadata/entities/common/reference/${name}/definition.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
  const source = compileSharedReferenceProduct(product, "studio").graph;
  const c = coreFixtureContext("draft");
  const identities = source.fields.map((f, i) => ({
    id: coreFixtureId(500 + i),
    entityId: c.entityId,
    tenantId: c.tenantId,
    fieldKey: f.fieldKey,
    parentIdentityId: null,
  }));
  const relationData = new Map<string, unknown>();
  const fields = Object.fromEntries(
    source.fields.map((f, i) => {
      const relationId = coreFixtureId(1000 + i);
      if (f.typeConfig.keyReference)
        relationData.set(
          relationId,
          structuredClone(f.typeConfig.keyReference),
        );
      return [
        f.id!,
        {
          sourceHash: sha256(f),
          fieldIdentityId: identities[i]!.id,
          labelId: null,
          storageType: (
            {
              string: "text",
              uuid: "uuid",
              boolean: "boolean",
              datetime: "timestamptz",
              integer: "integer",
              enum: "text",
            } as Record<string, string>
          )[f.dataType]!,
          requiredInput: false,
          keyGeneration:
            f.fieldKey === "id" ? ("provided" as const) : ("none" as const),
          ...(f.typeConfig.keyReference
            ? {
                relation: {
                  id: relationId,
                  sourceConfigHash: sha256(f.typeConfig.keyReference),
                },
              }
            : {}),
        },
      ];
    }),
  );
  const context = { ...c, identities, relationIds: [...relationData.keys()] };
  const input: LegacyNativeCoreAdapterInput = {
    fields: source.fields,
    runtimeProfiles: source.runtimeProfiles!,
    fieldMappings: fields,
    runtimeMappings: Object.fromEntries(
      source.runtimeProfiles!.map((r) => [
        r.id!,
        {
          sourceHash: sha256(r),
          idFieldKey: "id",
          storageCatalogueHash: "a".repeat(64),
          readHandlerVersion: null,
          writeHandlerVersion: null,
        },
      ]),
    ),
    context,
    resources: {
      fields: {
        owner: "component-test",
        key: "read-fields",
        version: 1,
        hash: "b".repeat(64),
      },
      runtimeProfiles: {
        owner: "component-test",
        key: "scalar-runtime",
        version: 1,
        hash: "c".repeat(64),
      },
    },
    relationReference: (id) => structuredClone(relationData.get(id)),
  };
  return { source, input };
}
for (const name of ["country", "state_region"])
  it(`round-trips actual ${name} scalar source members without name dispatch`, () => {
    const { source, input } = fixture(name),
      before = structuredClone(source);
    const adapters = createLegacyNativeCoreAdapters(input);
    const fields = adapters.fields.forward(source.fields),
      runtime = adapters.runtimeProfiles.forward(source.runtimeProfiles!);
    expect(adapters.fields.reverse(fields)).toEqual(source.fields);
    expect(adapters.runtimeProfiles.reverse(runtime)).toEqual(
      source.runtimeProfiles,
    );
    expect(fields.map((f) => f.id)).toEqual(source.fields.map((f) => f.id));
    expect(source).toEqual(before);
  });
it("reconstructs represented values and rejects loss of absence or initialization semantics", () => {
  const { source, input } = fixture("country"),
    a = createLegacyNativeCoreAdapters(input);
  const rows = structuredClone(a.fields.forward(source.fields));
  const code = rows.find(
    (r) => source.fields.find((f) => f.id === r.id)!.fieldKey === "code",
  )!;
  expect(() =>
    a.fields.reverse(
      rows.map((r) => (r.id === code.id ? { ...r, maxLength: 40 } : r)),
    ),
  ).toThrow("NATIVE_CORE_REVERSE_NOT_REPRESENTABLE");
  expect(() =>
    a.fields.reverse(
      rows.map((r) => (r.id === code.id ? { ...r, storageType: "other" } : r)),
    ),
  ).toThrow("NATIVE_CORE_REVERSE_NOT_REPRESENTABLE");
  const runtime = a.runtimeProfiles
    .forward(source.runtimeProfiles!)
    .map((r) => ({ ...r, idFieldId: rows[1]!.id }));
  expect(() => a.runtimeProfiles.reverse(runtime)).toThrow(
    "NATIVE_CORE_REVERSE_NOT_REPRESENTABLE",
  );
});
it("requires a canonical relation inverse and rejects stale or extra mappings", () => {
  const { source, input } = fixture("state_region");
  const noInverse = createLegacyNativeCoreAdapters({
    ...input,
    relationReference: undefined,
  });
  expect(() =>
    noInverse.fields.reverse(noInverse.fields.forward(source.fields)),
  ).toThrow("NATIVE_CORE_RELATION_INVERSE_REQUIRED");
  expect(() =>
    createLegacyNativeCoreAdapters({ ...input, fieldMappings: {} }),
  ).toThrow("NATIVE_CORE_MAPPING_INVENTORY_INVALID");
  const changed = {
    ...input,
    fields: input.fields.map((f, i) =>
      i === 0 ? { ...f, dataClassification: "changed" } : f,
    ),
  };
  expect(() => createLegacyNativeCoreAdapters(changed)).toThrow(
    "NORMALIZED_CORE_LEGACY_SOURCE_HASH_MISMATCH",
  );
});

it("rebuilds legacy values from rows instead of replaying captured source values", () => {
  const { input } = fixture("country");
  const fields = input.fields.map((f) =>
    f.fieldKey === "code"
      ? { ...f, typeConfig: { ...f.typeConfig, max_length: 64 } }
      : f,
  );
  const mappings = Object.fromEntries(
    fields.map((f) => [
      f.id!,
      { ...input.fieldMappings[f.id!]!, sourceHash: sha256(f) },
    ]),
  );
  const a = createLegacyNativeCoreAdapters({
    ...input,
    fields,
    fieldMappings: mappings,
  });
  const rows = a.fields
    .forward(fields)
    .map((row) =>
      row.id === fields.find((f) => f.fieldKey === "code")!.id
        ? { ...row, maxLength: 128 }
        : row,
    );
  const reversed = a.fields.reverse(rows);
  expect(
    reversed.find((f) => f.fieldKey === "code")!.typeConfig.max_length,
  ).toBe(128);
  expect(fields.find((f) => f.fieldKey === "code")!.typeConfig.max_length).toBe(
    64,
  );
});
