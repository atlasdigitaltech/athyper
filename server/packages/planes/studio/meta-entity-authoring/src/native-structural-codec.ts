import {
  FoundationContractError,
  nativeStructuralMembers,
  parseNativeStructuralGraph,
  selectNativeStructuralGraph,
  validateFoundationNode,
  referenceUuid,
  type MetaEntityGraph,
  type NativeStructuralContext,
  type NativeStructuralFamily,
  type NativeStructuralGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import { canonicalJson, sha256 } from "./deterministic.js";

export interface NativeStructuralCodecContext extends NativeStructuralContext {
  readonly entityId: string;
  readonly tenantId: string | null;
  readonly changeSetId: string;
  readonly revision: number;
  readonly authoringSchemaHash: string;
  readonly maximumBytes: number;
  /** Declared source provenance. A one-based receiving DB is not a conflict
   * with qualified zero-based input. Conversion occurs only at this boundary. */
  readonly sourcePositionConvention: "one-based" | "zero-based";
}
const fail = (code: string, path: string): never => {
  throw new FoundationContractError(code, path);
};
function contextValid(c: NativeStructuralCodecContext) {
  for (const id of [
    c.entityId,
    c.changeSetId,
    ...(c.tenantId === null ? [] : [c.tenantId]),
  ])
    validateFoundationNode(referenceUuid, id, "/context");
  if (
    !Number.isSafeInteger(c.revision) ||
    c.revision < 0 ||
    !/^[0-9a-f]{64}$/.test(c.authoringSchemaHash) ||
    !Number.isSafeInteger(c.maximumBytes) ||
    c.maximumBytes < 1 ||
    !["one-based", "zero-based"].includes(c.sourcePositionConvention)
  )
    fail("NATIVE_STRUCTURAL_CONTEXT_INVALID", "/context");
}
function source(c: NativeStructuralCodecContext) {
  return {
    entityId: c.entityId,
    tenantId: c.tenantId,
    changeSetId: c.changeSetId,
    revision: c.revision,
  };
}
function closed(
  value: unknown,
  keys: readonly string[],
  path: string,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    return fail("NATIVE_STRUCTURAL_PACKAGE_INVALID", path);
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(row, key))
  )
    fail("NATIVE_STRUCTURAL_PACKAGE_INVALID", path);
  return row;
}
/** Explicit legacy graph bridge: numerical weights are bounded numeric(6,3),
 * target codes must match independent resolved targets. No IDs are allocated,
 * no defaults are installed and no unsupported property is removed. */
export function importNativeStructuralGraph(
  graph: MetaEntityGraph,
  context: NativeStructuralContext,
): NativeStructuralGraph {
  const selected = structuredClone(
    selectNativeStructuralGraph(graph),
  ) as Record<NativeStructuralFamily, Record<string, unknown>[]>;
  for (const row of selected.searchFields) {
    if (typeof row.weight === "number") {
      if (
        !Number.isFinite(row.weight) ||
        row.weight <= 0 ||
        row.weight > 100 ||
        Number(row.weight.toFixed(3)) !== row.weight
      )
        fail("NATIVE_STRUCTURAL_WEIGHT_INVALID", "/searchFields/weight");
      row.weight = row.weight.toFixed(3);
    }
  }
  for (const row of selected.relationTargets) {
    if (Object.hasOwn(row, "targetEntityCode")) {
      const targets = context.targets.filter(
        (target) =>
          target.entityId === row.targetEntityId &&
          target.keyKey === row.targetKeyKey,
      );
      if (
        targets.length !== 1 ||
        targets[0]!.entityCode !== row.targetEntityCode
      )
        fail(
          "NATIVE_STRUCTURAL_TARGET_EVIDENCE_REQUIRED",
          "/relationTargets/targetEntityCode",
        );
      delete row.targetEntityCode; // independently derived code, not an authored SQL column
    }
  }
  return parseNativeStructuralGraph(selected, context);
}
export function encodeNativeStructuralGraph(
  graph: NativeStructuralGraph,
  context: NativeStructuralCodecContext,
): string {
  contextValid(context);
  if (context.sourcePositionConvention !== "one-based")
    fail("NATIVE_STRUCTURAL_EXPORT_CONVENTION_INVALID", "/positionConvention");
  const checked = parseNativeStructuralGraph(graph, context);
  const result = canonicalJson({
    schema: "entity.authoring-native-structural-package/1",
    authoringSchemaHash: context.authoringSchemaHash,
    source: source(context),
    positionConvention: "one-based",
    contextHash: sha256({
      fieldIds: context.fieldIds,
      targets: context.targets,
    }),
    graphHash: sha256(checked),
    graph: checked,
  });
  if (Buffer.byteLength(result, "utf8") > context.maximumBytes)
    fail("NATIVE_STRUCTURAL_PACKAGE_LIMIT", "");
  return result;
}
export function decodeNativeStructuralGraph(
  packet: string,
  context: NativeStructuralCodecContext,
): NativeStructuralGraph {
  contextValid(context);
  if (
    typeof packet !== "string" ||
    Buffer.byteLength(packet, "utf8") > context.maximumBytes
  )
    fail("NATIVE_STRUCTURAL_PACKAGE_LIMIT", "");
  let value: unknown;
  try {
    value = JSON.parse(packet);
  } catch {
    return fail("NATIVE_STRUCTURAL_PACKAGE_JSON_INVALID", "");
  }
  const root = closed(
    value,
    [
      "schema",
      "authoringSchemaHash",
      "source",
      "positionConvention",
      "contextHash",
      "graphHash",
      "graph",
    ],
    "",
  );
  if (root.schema !== "entity.authoring-native-structural-package/1")
    fail("NATIVE_STRUCTURAL_PACKAGE_VERSION_UNSUPPORTED", "/schema");
  if (root.authoringSchemaHash !== context.authoringSchemaHash)
    fail("NATIVE_STRUCTURAL_DESCRIPTOR_MISMATCH", "/authoringSchemaHash");
  closed(
    root.source,
    ["entityId", "tenantId", "changeSetId", "revision"],
    "/source",
  );
  if (canonicalJson(root.source) !== canonicalJson(source(context)))
    fail("NATIVE_STRUCTURAL_SOURCE_MISMATCH", "/source");
  if (root.positionConvention !== context.sourcePositionConvention)
    fail(
      "NATIVE_STRUCTURAL_POSITION_PROVENANCE_MISMATCH",
      "/positionConvention",
    );
  if (
    root.contextHash !==
    sha256({ fieldIds: context.fieldIds, targets: context.targets })
  )
    fail("NATIVE_STRUCTURAL_TARGET_EVIDENCE_MISMATCH", "/contextHash");
  if (root.graphHash !== sha256(root.graph))
    fail("NATIVE_STRUCTURAL_GRAPH_HASH_MISMATCH", "/graphHash");
  const graph = structuredClone(root.graph) as Record<string, unknown>;
  if (context.sourcePositionConvention === "zero-based") {
    closed(graph, Object.keys(nativeStructuralMembers), "/graph");
    for (const family of [
      "keyFields",
      "searchFields",
      "relationFields",
    ] as const) {
      if (!Array.isArray(graph[family]))
        fail("NATIVE_STRUCTURAL_PACKAGE_INVALID", `/graph/${family}`);
      for (const row of graph[family] as Record<string, unknown>[]) {
        if (
          !row ||
          typeof row !== "object" ||
          !Number.isSafeInteger(row.position) ||
          Number(row.position) < 0
        )
          fail("NATIVE_STRUCTURAL_ORDER_INVALID", `/graph/${family}/position`);
        row.position = Number(row.position) + 1;
      }
    }
  }
  return parseNativeStructuralGraph(graph, context);
}
/** Component compiler output uses existing runtime members. It is not a release
 * compiler, a live-read resource or permission/host qualification evidence. */
export function compileNativeStructuralGraph(
  graph: NativeStructuralGraph,
  context: NativeStructuralContext,
) {
  const checked = parseNativeStructuralGraph(graph, context);
  const runtime = structuredClone(checked) as unknown as Record<
    NativeStructuralFamily,
    Record<string, unknown>[]
  >;
  for (const row of runtime.searchFields)
    if (typeof row.weight === "string") row.weight = Number(row.weight);
  for (const row of runtime.relationTargets)
    row.targetEntityCode = context.targets.find(
      (target) =>
        target.entityId === row.targetEntityId &&
        target.keyKey === row.targetKeyKey,
    )!.entityCode;
  return {
    schema: "entity.native-structural-compilation/1" as const,
    contractHash: sha256(checked),
    descriptorHash: sha256(runtime),
    descriptor: runtime,
  };
}
