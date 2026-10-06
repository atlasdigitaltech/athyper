import { describe, expect, it } from "vitest";
import {
  layoutFixture,
  layoutFixtureContext,
} from "../../../../contracts/meta-entity-authoring/src/normalized-layout.fixtures.js";
import { coreFixtureId } from "../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js";
import { canonicalJson, sha256 } from "./deterministic.js";
import {
  decodeNormalizedLayout,
  encodeNormalizedLayout,
  importNormalizedLayoutPositions,
  normalizedLayoutFromStorage,
  normalizedLayoutToStorage,
  type NormalizedLayoutCodecContext,
} from "./normalized-layout-codec.js";
const context = (): NormalizedLayoutCodecContext => ({
  ...layoutFixtureContext(),
  changeSetId: coreFixtureId(101),
  revision: 4,
  authoringSchemaHash: "b".repeat(64),
  maximumBytes: 100_000,
});
describe("normalized layout codec and proposed scalar mapping", () => {
  it("round-trips exact layout source under saved revision and context", () => {
    const c = context(),
      graph = layoutFixture(),
      packet = encodeNormalizedLayout(graph, c);
    expect(decodeNormalizedLayout(packet, c)).toEqual(graph);
    expect(encodeNormalizedLayout(decodeNormalizedLayout(packet, c), c)).toBe(
      packet,
    );
    expect(() => decodeNormalizedLayout(packet, { ...c, revision: 5 })).toThrow(
      "NORMALIZED_LAYOUT_PACKAGE_SOURCE_MISMATCH",
    );
    expect(() =>
      decodeNormalizedLayout(packet, { ...c, navigationGroups: [] }),
    ).toThrow("NORMALIZED_LAYOUT_PACKAGE_EVIDENCE_MISMATCH");
  });
  it("binds the independently validated core graph instead of accepting a detached surface", () => {
    const c = context(),
      packet = encodeNormalizedLayout(layoutFixture(), c);
    const core = structuredClone(c.core) as any;
    core.field[1].description = "different";
    expect(() => decodeNormalizedLayout(packet, { ...c, core })).toThrow(
      "NORMALIZED_LAYOUT_PACKAGE_EVIDENCE_MISMATCH",
    );
    expect(() =>
      decodeNormalizedLayout(packet, {
        ...c,
        authoringSchemaHash: "c".repeat(64),
      }),
    ).toThrow("NORMALIZED_LAYOUT_PACKAGE_EVIDENCE_MISMATCH");
  });
  it("rejects graph mutation, unsupported schemas and extra envelope properties", () => {
    const c = context(),
      p = JSON.parse(encodeNormalizedLayout(layoutFixture(), c));
    p.graph.binding[0].width = 100;
    expect(() => decodeNormalizedLayout(canonicalJson(p), c)).toThrow(
      "NORMALIZED_LAYOUT_PACKAGE_HASH_MISMATCH",
    );
    p.schema = "entity.authoring-normalized-layout-package/2";
    expect(() => decodeNormalizedLayout(canonicalJson(p), c)).toThrow(
      "NORMALIZED_LAYOUT_PACKAGE_VERSION_UNSUPPORTED",
    );
    p.extra = true;
    expect(() => decodeNormalizedLayout(canonicalJson(p), c)).toThrow(
      "NORMALIZED_LAYOUT_PACKAGE_INVALID",
    );
  });
  it("converts a declared zero-based source once into already one-based target storage", () => {
    const c = context(),
      zero = structuredClone(layoutFixture()) as any;
    zero.section[0].position = 0;
    zero.binding[0].position = 0;
    const decoded = importNormalizedLayoutPositions(zero, c, {
      sourceHash: sha256(zero),
      positionConvention: "zero-based",
    });
    expect(decoded).toEqual(layoutFixture());
    expect(
      importNormalizedLayoutPositions(decoded, c, {
        sourceHash: sha256(decoded),
        positionConvention: "one-based",
      }),
    ).toEqual(decoded);
    expect(() =>
      importNormalizedLayoutPositions(zero, c, {
        sourceHash: sha256(zero),
        positionConvention: "one-based",
      }),
    ).toThrow("NORMALIZED_LAYOUT_POSITION_INVALID");
    expect(() =>
      importNormalizedLayoutPositions(decoded, c, {
        sourceHash: sha256(decoded),
        positionConvention: "zero-based",
      }),
    ).toThrow("NORMALIZED_LAYOUT_ORDER_INVALID");
  });
  it("rejects unknown source properties instead of dropping them during import", () => {
    const c = context(),
      source = { ...layoutFixture(), unsupported: true };
    expect(() =>
      importNormalizedLayoutPositions(source, c, {
        sourceHash: sha256(source),
        positionConvention: "one-based",
      }),
    ).toThrow("NORMALIZED_LAYOUT_IMPORT_INVALID");
    const nested = structuredClone(layoutFixture()) as any;
    nested.binding[0].layoutConfig = {};
    expect(() =>
      importNormalizedLayoutPositions(nested, c, {
        sourceHash: sha256(nested),
        positionConvention: "one-based",
      }),
    ).toThrow();
    expect(() =>
      importNormalizedLayoutPositions(layoutFixture(), c, {
        sourceHash: "c".repeat(64),
        positionConvention: "one-based",
      }),
    ).toThrow("NORMALIZED_LAYOUT_IMPORT_SOURCE_MISMATCH");
  });
  it("maps all selected SQL columns without retaining layout_config", () => {
    const graph = layoutFixture();
    for (const kind of ["section", "binding"] as const)
      for (const row of graph[kind]) {
        const sql = normalizedLayoutToStorage(kind, row);
        expect(normalizedLayoutFromStorage(kind, sql)).toEqual(row);
        expect(Object.keys(sql)).not.toContain("layout_config");
      }
    const sql = { ...normalizedLayoutToStorage("section", graph.section[0]!) };
    delete sql.navigation_group_id;
    expect(() => normalizedLayoutFromStorage("section", sql)).toThrow(
      "NORMALIZED_LAYOUT_STORAGE_COLUMN_MISSING",
    );
  });
});
