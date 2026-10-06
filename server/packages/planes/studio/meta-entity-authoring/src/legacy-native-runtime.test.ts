import { expect, it } from "vitest";
import {
  coreFixture,
  coreFixtureContext,
  coreFixtureId,
} from "../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js";
import {
  parseNormalizedCoreGraph,
  type MetaEntityRuntimeProfile,
} from "@athyper/server-contract-meta-entity-authoring";
import { normalizeLegacyRuntime } from "./legacy-native-runtime.js";
import { sha256 } from "./deterministic.js";
const source = (): MetaEntityRuntimeProfile => ({
  id: coreFixtureId(20),
  profileKey: "default",
  backingKind: "table",
  storagePlane: "studio",
  storageSchema: "shared",
  storageObject: "synthetic_reference",
  readMode: "generic",
  writeMode: "none",
  apiExposure: "api",
  createMode: "form_only",
  concurrencyMode: "none",
});
const mapping = (s = source()) => ({
  sourceHash: sha256(s),
  idFieldKey: "id",
  storageCatalogueHash: "a".repeat(64),
  readHandlerVersion: null,
  writeHandlerVersion: null,
});
it("converts every selected runtime scalar with an explicit stable field mapping", () => {
  const graph = coreFixture();
  const row = normalizeLegacyRuntime(
    source(),
    graph.field,
    coreFixtureContext(),
    mapping(),
  );
  expect(row).toEqual(graph.runtime[0]);
  expect(
    parseNormalizedCoreGraph(
      { ...graph, runtime: [row] },
      coreFixtureContext(),
    ),
  ).toEqual(graph);
});
it("rejects source mutation, hidden paths, omitted source defaults and inferred identity", () => {
  const graph = coreFixture(),
    c = coreFixtureContext();
  expect(() =>
    normalizeLegacyRuntime(
      { ...source(), storageObject: "other" },
      graph.field,
      c,
      mapping(),
    ),
  ).toThrow("NATIVE_RUNTIME_SOURCE_HASH_MISMATCH");
  const extra = { ...source(), settings: {} };
  expect(() =>
    normalizeLegacyRuntime(extra, graph.field, c, mapping(extra)),
  ).toThrow("NATIVE_RUNTIME_LEGACY_PATH_UNSUPPORTED");
  const missing = { ...source(), profileKey: undefined };
  delete missing.profileKey;
  expect(() =>
    normalizeLegacyRuntime(missing, graph.field, c, mapping(missing)),
  ).toThrow("NATIVE_RUNTIME_EXPLICIT_SOURCE_REQUIRED");
  expect(() =>
    normalizeLegacyRuntime(source(), graph.field, c, {
      ...mapping(),
      idFieldKey: "absent",
    }),
  ).toThrow("NATIVE_RUNTIME_FIELD_MAPPING_REQUIRED");
  expect(() =>
    normalizeLegacyRuntime(
      source(),
      graph.field,
      { ...c, tenantId: coreFixtureId(999) },
      mapping(),
    ),
  ).toThrow("NATIVE_RUNTIME_FIELD_MAPPING_REQUIRED");
});
it("requires explicit handler version evidence and rejects unsupported mapping properties", () => {
  const s = {
      ...source(),
      readMode: "facade",
      readHandlerKey: "registered.reader",
    },
    graph = coreFixture(),
    c = coreFixtureContext();
  expect(() => normalizeLegacyRuntime(s, graph.field, c, mapping(s))).toThrow(
    "NATIVE_RUNTIME_HANDLER_VERSION_REQUIRED",
  );
  const row = normalizeLegacyRuntime(s, graph.field, c, {
    ...mapping(s),
    readHandlerVersion: 3,
  });
  expect(row.readHandlerVersion).toBe(3);
  expect(() =>
    normalizeLegacyRuntime(source(), graph.field, c, {
      ...mapping(),
      allow: true,
    } as never),
  ).toThrow("NATIVE_RUNTIME_MAPPING_INVALID");
});
