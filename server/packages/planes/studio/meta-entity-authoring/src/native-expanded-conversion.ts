import {
  FoundationContractError,
  nativeStructuralRowNode,
  type NativeStructuralGraph,
  referenceUuid,
  validateFoundationNode,
  validateNativeAiSemantics,
  validateNativeOperation,
  type MetaEntityGraph,
  type NativeAiGraph,
  type NativeOperationRow,
  type ExpandedNativeMetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import { canonicalJson, sha256 } from "./deterministic.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";
import {
  nativeConversionFamilies,
  prepareNativeGraphConversion,
  type NativeConversionAdapters,
  type NativeConversionResource,
  type NativeGraphConversionContext,
  type NativeNestedConversionAdapter,
} from "./native-graph-conversion.js";
import { validateNativeSupplementalReferences } from "./native-supplemental-storage.js";

export interface NativeSupplementalConversionAdapter {
  readonly resource: NativeConversionResource;
  readonly contextHash: string;
  readonly dependencies: readonly NativeConversionResource[];
  /** A transient legacy-shaped graph for the existing core/layout adapters.
   * It is never saved or used as a second writable source. */
  forward(source: MetaEntityGraph): {
    readonly prepared: MetaEntityGraph;
    readonly operations: readonly NativeOperationRow[];
    readonly ai: NativeAiGraph;
  };
  reverse(
    prepared: MetaEntityGraph,
    target: ExpandedNativeMetaEntityGraph,
  ): MetaEntityGraph;
}
export interface NativeExpandedConversionContext extends NativeGraphConversionContext {
  readonly maximumSupplementalMembers: number;
}
const fail = (code: string, path: string): never => {
  throw new FoundationContractError(code, path);
};
function additions(
  before: readonly { id: string }[],
  after: readonly { id: string }[],
  path: string,
) {
  const ids = new Set<string>();
  for (const row of after) {
    validateFoundationNode(referenceUuid, row.id, path);
    if (ids.has(row.id)) fail("NATIVE_EXPANDED_IDENTITY_INVALID", path);
    ids.add(row.id);
  }
  for (const row of before)
    if (
      !after.some(
        (r) => r.id === row.id && canonicalJson(r) === canonicalJson(row),
      )
    )
      fail("NATIVE_EXPANDED_RETAINED_CHANGED", path);
}
/** Extends the existing preservation proof to native 2.5. This prepares a review
 * candidate only; no repository write, schema guard, release or authority grant
 * is implied. Every original path must reconstruct from the final typed graph. */
export function prepareExpandedNativeGraphConversion(
  source: MetaEntityGraph,
  context: NativeExpandedConversionContext,
  adapters: NativeConversionAdapters,
  nested: NativeNestedConversionAdapter | undefined,
  supplemental: NativeSupplementalConversionAdapter,
) {
  if (
    !Number.isSafeInteger(context.maximumSupplementalMembers) ||
    context.maximumSupplementalMembers < 1 ||
    context.maximumSupplementalMembers >= 2147483647
  )
    fail("NATIVE_SNAPSHOT_LIMIT", "/context/maximumSupplementalMembers");
  validateConversionJsonData(source, "/source");
  if (
    !Number.isSafeInteger(context.maximumBytes) ||
    context.maximumBytes < 1 ||
    Buffer.byteLength(canonicalJson(source)) > context.maximumBytes
  )
    fail("NATIVE_CONVERSION_LIMIT", "/source");
  if (sha256(source) !== context.source.graphHash)
    fail("NATIVE_CONVERSION_SOURCE_HASH_MISMATCH", "/source");
  const supplementalContextHash = supplemental.contextHash;
  const supplementalResource = structuredClone(supplemental.resource);
  const supplementalDependencies = structuredClone(supplemental.dependencies);
  if (!/^[a-f0-9]{64}$/.test(supplementalContextHash))
    fail("NATIVE_EXPANDED_SOURCE_INVALID", "/supplemental/contextHash");
  const dependencies = [supplementalResource, ...supplementalDependencies];
  validateConversionJsonData(dependencies, "/supplemental/resources");
  if (
    new Set(dependencies.map((r) => canonicalJson(r))).size !==
    dependencies.length
  )
    fail(
      "NATIVE_CONVERSION_ADAPTER_INVENTORY_INVALID",
      "/supplemental/resources",
    );
  for (const resource of dependencies) {
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
      resource,
      "/supplemental/resources",
    );
    if (
      context.installedAdapters.filter(
        (r) => canonicalJson(r) === canonicalJson(resource),
      ).length !== 1
    )
      fail(
        "NATIVE_CONVERSION_ADAPTER_NOT_INSTALLED",
        "/supplemental/resources",
      );
  }
  context.validateRetained(structuredClone(source));
  const stage = supplemental.forward(structuredClone(source));
  validateConversionJsonData(stage, "/supplemental");
  if (
    !stage ||
    !stage.prepared ||
    typeof stage.prepared !== "object" ||
    Array.isArray(stage.prepared) ||
    !Array.isArray(stage.operations) ||
    Object.keys(stage).sort().join() !== "ai,operations,prepared" ||
    Object.keys(stage.prepared).sort().join() !==
      Object.keys(source).sort().join()
  )
    fail("NATIVE_EXPANDED_SOURCE_INVALID", "/supplemental");
  // Supplemental normalization may consume only the declared three surface
  // resource paths and add typed labels/reference rows. Other source members,
  // including all legacy operation controls, remain byte-for-byte authoritative.
  for (const key of Object.keys(source)) {
    if (
      !["surfaces", "referenceMembers", "ownedLabels"].includes(key) &&
      canonicalJson(Reflect.get(source, key)) !==
        canonicalJson(Reflect.get(stage.prepared, key))
    )
      fail("NATIVE_EXPANDED_RETAINED_CHANGED", "/supplemental/" + key);
  }
  const strip = (surfaces: MetaEntityGraph["surfaces"]) =>
    surfaces?.map((s) => {
      const row = structuredClone(s);
      if (row.layoutConfig) {
        const config = { ...row.layoutConfig };
        for (const key of ["ai", "authorization", "authorizationRuntime"])
          delete config[key];
        return { ...row, layoutConfig: config };
      }
      return row;
    });
  if (
    canonicalJson(strip(source.surfaces)) !==
    canonicalJson(strip(stage.prepared.surfaces))
  )
    fail("NATIVE_EXPANDED_RETAINED_CHANGED", "/supplemental/surfaces");
  for (const [before, after, path] of [
    [
      source.referenceMembers,
      stage.prepared.referenceMembers,
      "referenceMembers",
    ],
    [source.ownedLabels, stage.prepared.ownedLabels, "ownedLabels"],
  ] as const) {
    if (
      !before ||
      !after ||
      Object.keys(before).sort().join() !== Object.keys(after).sort().join()
    )
      fail("NATIVE_EXPANDED_SOURCE_INVALID", "/supplemental/" + path);
    for (const key of Object.keys(before!)) {
      const a = Reflect.get(before!, key),
        b = Reflect.get(after!, key);
      if (path === "referenceMembers" && key === "members") {
        if (Object.keys(a).sort().join() !== Object.keys(b).sort().join())
          fail(
            "NATIVE_EXPANDED_SOURCE_INVALID",
            "/supplemental/referenceMembers/members",
          );
        for (const kind of Object.keys(a)) {
          if (
            !["operationField", "authorizationProfile", "fieldAccess"].includes(
              kind,
            ) &&
            canonicalJson(a[kind]) !== canonicalJson(b[kind])
          )
            fail(
              "NATIVE_EXPANDED_RETAINED_CHANGED",
              "/supplemental/referenceMembers/" + kind,
            );
          additions(a[kind], b[kind], "/supplemental/referenceMembers/" + kind);
        }
      } else if (
        path === "ownedLabels" &&
        ["labels", "translations"].includes(key) &&
        Array.isArray(a) &&
        Array.isArray(b)
      )
        additions(a, b, "/supplemental/" + path + "/" + key);
      else if (canonicalJson(a) !== canonicalJson(b))
        fail(
          "NATIVE_EXPANDED_RETAINED_CHANGED",
          "/supplemental/" + path + "/" + key,
        );
    }
  }
  validateNativeAiSemantics(stage.ai, context.maximumSupplementalMembers);
  for (const operation of stage.operations)
    validateNativeOperation(operation, true);
  const operationIds = source.operations.map((o) => o.id);
  if (
    operationIds.some((id) => typeof id !== "string") ||
    new Set(operationIds).size !== operationIds.length ||
    canonicalJson(operationIds.slice().sort()) !==
      canonicalJson(stage.operations.map((o) => o.id).sort())
  )
    fail("NATIVE_EXPANDED_IDENTITY_INVALID", "/operations");
  const core = prepareNativeGraphConversion(
    stage.prepared,
    {
      ...context,
      source: { ...context.source, graphHash: sha256(stage.prepared) },
    },
    adapters,
    nested,
  );
  const candidate: ExpandedNativeMetaEntityGraph = {
    ...core.candidate,
    contractSchema: "athyper.meta-entity-contract/2.5",
    searchFields: core.candidate.searchFields
      ? (core.candidate.searchFields.map((row, index) => {
          if (
            typeof row.weight === "number" &&
            (!Number.isFinite(row.weight) ||
              Number(row.weight.toFixed(3)) !== row.weight)
          )
            fail(
              "NATIVE_STRUCTURAL_WEIGHT_INVALID",
              `/searchFields/${index}/weight`,
            );
          const native = {
            ...row,
            ...(typeof row.weight === "number"
              ? { weight: row.weight.toFixed(3) }
              : {}),
          };
          validateFoundationNode(
            nativeStructuralRowNode("searchFields"),
            native,
            `/searchFields/${index}`,
          );
          return native;
        }) as NativeStructuralGraph["searchFields"])
      : undefined,
    operations: structuredClone(stage.operations),
    ai: structuredClone(stage.ai),
  };
  validateNativeSupplementalReferences(
    candidate,
    context.maximumSupplementalMembers,
  );
  if (Buffer.byteLength(canonicalJson(candidate)) > context.maximumBytes)
    fail("NATIVE_CONVERSION_LIMIT", "/target");
  // Begin at the same normalized nested boundary used by the core proof. The
  // supplemental boundary lacks derived labels/relations/views and cannot be
  // supplied directly to a nested inverse after scalar reconstruction.
  let inverse = nested
    ? nested.forward(structuredClone(stage.prepared))
    : structuredClone(stage.prepared);
  for (const kind of nativeConversionFamilies)
    Reflect.set(
      inverse,
      kind,
      adapters[kind].reverse(structuredClone(candidate[kind]) as never),
    );
  if (nested) inverse = nested.reverse(inverse, core.candidate);
  const restored = supplemental.reverse(inverse, structuredClone(candidate));
  validateConversionJsonData(restored, "/inverse");
  if (canonicalJson(restored) !== canonicalJson(source))
    fail("NATIVE_CONVERSION_NOT_LOSSLESS", "/inverse");
  return {
    schema: "entity.native-expanded-conversion-proof/1" as const,
    source: structuredClone(context.source),
    contextHash: sha256({
      coreContextHash: core.contextHash,
      supplemental: dependencies,
      supplementalContextHash,
    }),
    coreProof: core,
    supplemental: {
      contextHash: supplementalContextHash,
      resource: supplementalResource,
      dependencies: supplementalDependencies,
      preparedHash: sha256(stage.prepared),
      operationsHash: sha256(stage.operations),
      aiHash: sha256(stage.ai),
    },
    targetHash: sha256(candidate),
    candidate,
  };
}
