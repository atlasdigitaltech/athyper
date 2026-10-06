import {
  FoundationContractError,
  normalizedLayoutMembers,
  parseNormalizedLayoutGraph,
  validateNormalizedLayoutRow,
  type NormalizedLayoutContext,
  type NormalizedLayoutGraph,
  type NormalizedLayoutKind,
  type NormalizedLayoutRow,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  encodeNormalizedCore,
  validateConversionJsonData,
  type NormalizedCoreCodecContext,
} from "./normalized-core-codec.js";
import { canonicalJson, sha256 } from "./deterministic.js";
export interface NormalizedLayoutCodecContext extends NormalizedLayoutContext {
  readonly changeSetId: string;
  readonly revision: number;
  readonly authoringSchemaHash: string;
  readonly maximumBytes: number;
}
const fail = (code: string, path: string): never => {
  throw new FoundationContractError(code, path);
};
function evidence(c: NormalizedLayoutCodecContext) {
  const core: NormalizedCoreCodecContext = {
    ...c.coreContext,
    changeSetId: c.changeSetId,
    revision: c.revision,
    authoringSchemaHash: c.authoringSchemaHash,
    maximumBytes: c.maximumBytes,
  };
  const {
    coreContext: _,
    core: __,
    changeSetId: ___,
    revision: ____,
    authoringSchemaHash: _____,
    maximumBytes: ______,
    ...resources
  } = c;
  return {
    source: {
      entityId: c.coreContext.entityId,
      tenantId: c.coreContext.tenantId,
      changeSetId: c.changeSetId,
      revision: c.revision,
    },
    contextHash: sha256({
      corePackageHash: sha256(encodeNormalizedCore(c.core, core)),
      ...resources,
    }),
  };
}
export function encodeNormalizedLayout(
  graph: NormalizedLayoutGraph,
  c: NormalizedLayoutCodecContext,
): string {
  const e = evidence(c),
    checked = parseNormalizedLayoutGraph(graph, c);
  const packet = canonicalJson({
    schema: "entity.authoring-normalized-layout-package/1",
    source: e.source,
    authoringSchemaHash: c.authoringSchemaHash,
    contextHash: e.contextHash,
    graphHash: sha256(checked),
    graph: checked,
  });
  if (Buffer.byteLength(packet) > c.maximumBytes)
    fail("NORMALIZED_LAYOUT_PACKAGE_LIMIT", "");
  return packet;
}
export function decodeNormalizedLayout(
  packet: string,
  c: NormalizedLayoutCodecContext,
): NormalizedLayoutGraph {
  const e = evidence(c);
  if (typeof packet !== "string" || Buffer.byteLength(packet) > c.maximumBytes)
    fail("NORMALIZED_LAYOUT_PACKAGE_LIMIT", "");
  let value: unknown;
  try {
    value = JSON.parse(packet);
  } catch {
    return fail("NORMALIZED_LAYOUT_PACKAGE_JSON_INVALID", "");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail("NORMALIZED_LAYOUT_PACKAGE_INVALID", "");
  const p = value as Record<string, unknown>;
  if (
    Object.keys(p).sort().join() !==
    [
      "schema",
      "source",
      "authoringSchemaHash",
      "contextHash",
      "graphHash",
      "graph",
    ]
      .sort()
      .join()
  )
    fail("NORMALIZED_LAYOUT_PACKAGE_INVALID", "");
  if (p.schema !== "entity.authoring-normalized-layout-package/1")
    fail("NORMALIZED_LAYOUT_PACKAGE_VERSION_UNSUPPORTED", "/schema");
  if (canonicalJson(p.source) !== canonicalJson(e.source))
    fail("NORMALIZED_LAYOUT_PACKAGE_SOURCE_MISMATCH", "/source");
  if (
    p.authoringSchemaHash !== c.authoringSchemaHash ||
    p.contextHash !== e.contextHash
  )
    fail("NORMALIZED_LAYOUT_PACKAGE_EVIDENCE_MISMATCH", "/contextHash");
  if (p.graphHash !== sha256(p.graph))
    fail("NORMALIZED_LAYOUT_PACKAGE_HASH_MISMATCH", "/graphHash");
  return parseNormalizedLayoutGraph(p.graph, c);
}
/** Explicit position boundary for already typed layout source. This is not a
 * legacy-blob converter: unsupported layout properties still reject validation. */
export function importNormalizedLayoutPositions(
  input: unknown,
  c: NormalizedLayoutCodecContext,
  provenance: {
    readonly sourceHash: string;
    readonly positionConvention: "zero-based" | "one-based";
  },
): NormalizedLayoutGraph {
  validateConversionJsonData(input, "");
  // Serialize only after closed-node validation. Use draft-safe, temporary one-
  // based row positions to verify every source property without dropping any.
  if (!input || typeof input !== "object" || Array.isArray(input))
    return fail("NORMALIZED_LAYOUT_IMPORT_INVALID", "");
  const p = input as Record<string, unknown>;
  if (
    Object.keys(p).sort().join() !== "binding,section" ||
    !Array.isArray(p.section) ||
    !Array.isArray(p.binding)
  )
    return fail("NORMALIZED_LAYOUT_IMPORT_INVALID", "");
  if (!["zero-based", "one-based"].includes(provenance.positionConvention))
    fail("NORMALIZED_LAYOUT_POSITION_SOURCE_REQUIRED", "/positionConvention");
  const shift = provenance.positionConvention === "zero-based" ? 1 : 0;
  const source: Record<string, unknown[]> = {};
  for (const kind of ["section", "binding"] as const) {
    source[kind] = (p[kind] as unknown[]).map((row, index) => {
      if (
        !row ||
        typeof row !== "object" ||
        Array.isArray(row) ||
        Object.getPrototypeOf(row) !== Object.prototype ||
        Reflect.ownKeys(row).some((key) => typeof key === "symbol")
      )
        return fail("NORMALIZED_LAYOUT_IMPORT_INVALID", `/${kind}/${index}`);
      const props = Object.getOwnPropertyDescriptors(row);
      if (
        Object.values(props).some(
          (prop) => !prop.enumerable || !("value" in prop),
        )
      )
        fail("NORMALIZED_LAYOUT_IMPORT_INVALID", `/${kind}/${index}`);
      const r = row as Record<string, unknown>,
        position = r.position;
      if (
        !Number.isSafeInteger(position) ||
        (position as number) < (shift ? 0 : 1) ||
        (position as number) > 32767 - shift
      )
        fail(
          "NORMALIZED_LAYOUT_POSITION_INVALID",
          `/${kind}/${index}/position`,
        );
      const normalized = { ...r, position: (position as number) + shift };
      validateNormalizedLayoutRow(kind, normalized);
      return normalized;
    });
  }
  if (sha256(input) !== provenance.sourceHash)
    fail("NORMALIZED_LAYOUT_IMPORT_SOURCE_MISMATCH", "");
  return parseNormalizedLayoutGraph(source, c);
}
export function normalizedLayoutToStorage<K extends NormalizedLayoutKind>(
  kind: K,
  row: NormalizedLayoutRow<K>,
): Readonly<Record<string, unknown>> {
  validateNormalizedLayoutRow(kind, row);
  return {
    id: row.id,
    ...Object.fromEntries(
      Object.entries(normalizedLayoutMembers[kind].columns).map(([p, c]) => [
        c.column,
        Reflect.get(row, p),
      ]),
    ),
  };
}
export function normalizedLayoutFromStorage<K extends NormalizedLayoutKind>(
  kind: K,
  value: Readonly<Record<string, unknown>>,
): NormalizedLayoutRow<K> {
  const row = {
    id: value.id,
    ...Object.fromEntries(
      Object.entries(normalizedLayoutMembers[kind].columns).map(([p, c]) => {
        if (!Object.hasOwn(value, c.column))
          fail(
            "NORMALIZED_LAYOUT_STORAGE_COLUMN_MISSING",
            `/${kind}/${c.column}`,
          );
        return [p, value[c.column]];
      }),
    ),
  };
  validateNormalizedLayoutRow(kind, row);
  return row as NormalizedLayoutRow<K>;
}
