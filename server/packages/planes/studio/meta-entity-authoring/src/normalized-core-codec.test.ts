import { describe, expect, it } from "vitest";
import type { MetaEntityField } from "@athyper/server-contract-meta-entity-authoring";
import {
  coreFixture,
  coreFixtureContext,
  coreFixtureId,
} from "../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js";
import { canonicalJson, sha256 } from "./deterministic.js";
import {
  decodeNormalizedCore,
  encodeNormalizedCore,
  normalizedCoreFromStorage,
  normalizedCoreToStorage,
  normalizeLegacyReadField,
  type NormalizedCoreCodecContext,
} from "./normalized-core-codec.js";
const context = (): NormalizedCoreCodecContext => ({
  ...coreFixtureContext(),
  changeSetId: coreFixtureId(101),
  revision: 4,
  authoringSchemaHash: "b".repeat(64),
  maximumBytes: 100_000,
});
const legacy = (): MetaEntityField => ({
  id: coreFixtureId(2),
  fieldKey: "code",
  dataType: "string",
  typeConfig: { kind: "string", max_length: 24 },
  cardinality: "one",
  valueOrigin: "stored",
  writeMode: "read_only",
  storagePath: "code",
  dataClassification: "public",
});
const mapping = (field = legacy()) => ({
  sourceHash: sha256(field),
  fieldIdentityId: coreFixtureId(12),
  labelId: coreFixtureId(32),
  storageType: "text",
  requiredInput: false,
  keyGeneration: "none" as const,
});
describe("normalized core component codec (not deployment evidence)", () => {
  it("round-trips the exact complete graph and revision", () => {
    const c = context(),
      graph = coreFixture();
    const encoded = encodeNormalizedCore(graph, c);
    expect(decodeNormalizedCore(encoded, c)).toEqual(graph);
    expect(encodeNormalizedCore(decodeNormalizedCore(encoded, c), c)).toBe(
      encoded,
    );
    expect(() => decodeNormalizedCore(encoded, { ...c, revision: 5 })).toThrow(
      "NORMALIZED_CORE_PACKAGE_SOURCE_MISMATCH",
    );
    expect(() =>
      decodeNormalizedCore(encoded, { ...c, tenantId: coreFixtureId(99) }),
    ).toThrow("NORMALIZED_CORE_PACKAGE_SOURCE_MISMATCH");
  });
  it("binds schema, catalogue, phase and semantic context", () => {
    const c = context(),
      packet = encodeNormalizedCore(coreFixture(), c);
    expect(() =>
      decodeNormalizedCore(packet, {
        ...c,
        authoringSchemaHash: "c".repeat(64),
      }),
    ).toThrow("NORMALIZED_CORE_PACKAGE_EVIDENCE_MISMATCH");
    expect(() =>
      decodeNormalizedCore(packet, { ...c, phase: "draft" }),
    ).toThrow("NORMALIZED_CORE_PACKAGE_EVIDENCE_MISMATCH");
    expect(() =>
      decodeNormalizedCore(packet, { ...c, catalogues: [] }),
    ).toThrow("NORMALIZED_CORE_PACKAGE_EVIDENCE_MISMATCH");
  });
  it("rejects mutation, unknown versions, extra properties and byte overflow", () => {
    const c = context(),
      p = JSON.parse(encodeNormalizedCore(coreFixture(), c));
    p.graph.field[1].description = "changed";
    expect(() => decodeNormalizedCore(canonicalJson(p), c)).toThrow(
      "NORMALIZED_CORE_PACKAGE_HASH_MISMATCH",
    );
    p.schema = "entity.authoring-normalized-core-package/2";
    expect(() => decodeNormalizedCore(canonicalJson(p), c)).toThrow(
      "NORMALIZED_CORE_PACKAGE_VERSION_UNSUPPORTED",
    );
    p.extra = true;
    expect(() => decodeNormalizedCore(canonicalJson(p), c)).toThrow(
      "NORMALIZED_CORE_PACKAGE_INVALID",
    );
    expect(() =>
      encodeNormalizedCore(coreFixture(), { ...c, maximumBytes: 32 }),
    ).toThrow("NORMALIZED_CORE_PACKAGE_LIMIT");
  });
  it("maps every proposed scalar column bidirectionally without precision repair", () => {
    const graph = coreFixture();
    for (const kind of ["field", "runtime", "surface"] as const) {
      for (const row of graph[kind]) {
        const sql = normalizedCoreToStorage(kind, row);
        expect(normalizedCoreFromStorage(kind, sql)).toEqual(row);
        expect(Object.keys(sql)).not.toContain("type_config");
        expect(Object.keys(sql)).not.toContain("layout_config");
      }
    }
    const field = {
      ...graph.field[1]!,
      dataType: "decimal" as const,
      minimum: "9007199254740993.000001",
      precision: 30,
      scale: 6,
    };
    expect(
      normalizedCoreFromStorage(
        "field",
        normalizedCoreToStorage("field", field),
      ),
    ).toEqual(field);
    expect(() =>
      normalizedCoreFromStorage("field", {
        ...normalizedCoreToStorage("field", field),
        minimum: 9007199254740993,
      }),
    ).toThrow();
    const sql = { ...normalizedCoreToStorage("field", field) };
    delete sql.minimum;
    expect(() => normalizedCoreFromStorage("field", sql)).toThrow(
      "NORMALIZED_CORE_STORAGE_COLUMN_MISSING",
    );
  });
  it("requires explicit stored field identity, label and default policy mapping", () => {
    const f = legacy(),
      c = context(),
      m = mapping(f);
    const row = normalizeLegacyReadField(f, c, m);
    expect(row).toMatchObject({
      fieldIdentityId: m.fieldIdentityId,
      maxLength: 24,
      defaultKind: "none",
      required: false,
      nullable: false,
    });
    expect(() =>
      normalizeLegacyReadField(f, c, { ...m, sourceHash: "c".repeat(64) }),
    ).toThrow("NORMALIZED_CORE_LEGACY_SOURCE_HASH_MISMATCH");
    expect(() =>
      normalizeLegacyReadField(f, c, {
        ...m,
        fieldIdentityId: coreFixtureId(11),
      }),
    ).toThrow("NORMALIZED_CORE_LEGACY_IDENTITY_REQUIRED");
    expect(() =>
      normalizeLegacyReadField(
        f,
        {
          ...c,
          identities: c.identities.map((i) => ({
            ...i,
            parentIdentityId: coreFixtureId(11),
          })),
        },
        m,
      ),
    ).toThrow("NORMALIZED_CORE_LEGACY_IDENTITY_REQUIRED");
  });
  it("reports unrepresented legacy paths and numeric encodings", () => {
    const c = context();
    for (const f of [
      { ...legacy(), defaultSpec: null },
      { ...legacy(), typeConfig: { kind: "string", unknown: true } },
    ] as MetaEntityField[]) {
      expect(() => normalizeLegacyReadField(f, c, mapping(f))).toThrow(
        "NORMALIZED_CORE_LEGACY_PATH_UNSUPPORTED",
      );
    }
    const f = {
      ...legacy(),
      dataType: "decimal",
      typeConfig: { kind: "decimal", minimum: 0.1 },
    } as MetaEntityField;
    expect(() => normalizeLegacyReadField(f, c, mapping(f))).toThrow(
      "NORMALIZED_CORE_LEGACY_NUMERIC_ENCODING_UNSUPPORTED",
    );
  });
  it("rejects serialization loss without invoking accessors", () => {
    const c = context(),
      f = legacy();
    let invoked = false;
    Object.defineProperty(f, "description", {
      enumerable: true,
      get() {
        invoked = true;
        return "bad";
      },
    });
    expect(() => normalizeLegacyReadField(f, c, mapping())).toThrow(
      "NORMALIZED_CORE_LEGACY_INPUT_INVALID",
    );
    expect(invoked).toBe(false);
    const undef = { ...legacy(), description: undefined };
    expect(() => normalizeLegacyReadField(undef, c, mapping())).toThrow(
      "NORMALIZED_CORE_LEGACY_INPUT_INVALID",
    );
  });
  it("requires independently mapped relation evidence", () => {
    const f = {
      ...legacy(),
      typeConfig: {
        kind: "string",
        keyReference: { target: "declared_source" },
      },
    } as MetaEntityField;
    const c = context(),
      m = mapping(f),
      relation = {
        id: coreFixtureId(70),
        sourceConfigHash: sha256(f.typeConfig!.keyReference),
      };
    expect(() => normalizeLegacyReadField(f, c, m)).toThrow(
      "NORMALIZED_CORE_LEGACY_RELATION_EVIDENCE_REQUIRED",
    );
    expect(
      normalizeLegacyReadField(
        f,
        { ...c, relationIds: [relation.id] },
        { ...m, relation },
      ).relationId,
    ).toBe(relation.id);
    expect(() =>
      normalizeLegacyReadField(
        f,
        { ...c, relationIds: [relation.id] },
        { ...m, relation: { ...relation, sourceConfigHash: "0".repeat(64) } },
      ),
    ).toThrow("NORMALIZED_CORE_LEGACY_RELATION_EVIDENCE_REQUIRED");
  });
});
