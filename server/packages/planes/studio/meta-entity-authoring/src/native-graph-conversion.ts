import {
  FoundationContractError,
  parseNormalizedLayoutGraph,
  validateFoundationNode,
  referenceUuid,
  type MetaEntityGraph,
  type NativeMetaEntityGraph,
  type NormalizedLayoutContext,
} from "@athyper/server-contract-meta-entity-authoring";
import { canonicalJson, sha256 } from "./deterministic.js";
import { encodeNormalizedLayout } from "./normalized-layout-codec.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";
export const nativeConversionFamilies = [
  "fields",
  "runtimeProfiles",
  "surfaces",
  "surfaceSections",
  "surfaceFieldBindings",
] as const;
export type NativeConversionFamily = (typeof nativeConversionFamilies)[number];
export interface NativeConversionResource {
  readonly owner: string;
  readonly key: string;
  readonly version: number;
  readonly hash: string;
}
/** Installed migration adapters, not functions supplied by an author/request.
 * The inverse is mandatory: unsupported source semantics cannot be discarded. */
export type NativeFamilyConversionAdapter<K extends NativeConversionFamily> = {
  readonly resource: NativeConversionResource;
  forward(source: NonNullable<MetaEntityGraph[K]>): NativeMetaEntityGraph[K];
  reverse(target: NativeMetaEntityGraph[K]): NonNullable<MetaEntityGraph[K]>;
};
export type NativeConversionAdapters = {
  readonly [K in NativeConversionFamily]: NativeFamilyConversionAdapter<K>;
};
export interface NativeGraphConversionContext {
  readonly source: {
    readonly entityId: string;
    readonly tenantId: string | null;
    readonly changeSetId: string;
    readonly revision: number;
    readonly graphHash: string;
  };
  readonly sourceKind: "product" | "tenant_entity";
  readonly authoringSchemaHash: string;
  readonly maximumBytes: number;
  readonly installedAdapters: readonly NativeConversionResource[];
  readonly retainedValidation: {
    readonly resource: NativeConversionResource;
    readonly evidenceHash: string;
  };
  /** Independent owner/resource validation for preserved branches, labels,
   * identities, operations and security references. This is mandatory and not
   * an authorization resolver or a callback accepted from HTTP. */
  validateRetained(source: MetaEntityGraph): void;
  resolveLayout(core: NormalizedLayoutContext["core"]): NormalizedLayoutContext;
}
const retained = [
  "entity",
  "classProfiles",
  "keys",
  "keyFields",
  "searchProfiles",
  "searchFields",
  "relations",
  "relationTargets",
  "relationFields",
  "operations",
  "operationPermissions",
  "operationRules",
  "operationScopeBindings",
  "changeCaseBindings",
  "operationContextRequirements",
  "fieldReferenceBindings",
  "materializationBindings",
  "materializationFieldMappings",
  "surfaceOperations",
  "flows",
  "flowSteps",
  "lifecycleBindings",
  "lifecycleOperationBindings",
  "policyBindings",
  "capabilities",
  "fieldPolicyBindings",
  "numberingBindings",
  "tests",
  "referenceMembers",
  "fieldIdentities",
  "ownedLabels",
] as const;
const fail = (code: string, path: string): never => {
  throw new FoundationContractError(code, path);
};
/** Complete preservation proof for a selected source revision. Produces a review
 * candidate only. Applying it must retain the original immutable snapshot and
 * advance into a distinct native revision through a qualified cutover transaction. */
export function prepareNativeGraphConversion(
  source: MetaEntityGraph,
  context: NativeGraphConversionContext,
  adapters: NativeConversionAdapters,
) {
  validateConversionJsonData(source, "/source");
  if (
    !Number.isSafeInteger(context.maximumBytes) ||
    context.maximumBytes < 1 ||
    Buffer.byteLength(canonicalJson(source)) > context.maximumBytes
  )
    fail("NATIVE_CONVERSION_LIMIT", "/source");
  for (const id of [
    context.source.entityId,
    context.source.changeSetId,
    ...(context.source.tenantId === null ? [] : [context.source.tenantId]),
  ])
    validateFoundationNode(referenceUuid, id, "/source");
  if (!["product", "tenant_entity"].includes(context.sourceKind))
    fail("NATIVE_CONVERSION_SCOPE_INVALID", "/sourceKind");
  if (
    !Number.isSafeInteger(context.source.revision) ||
    context.source.revision < 0 ||
    !/^[a-f0-9]{64}$/.test(context.authoringSchemaHash)
  )
    fail("NATIVE_CONVERSION_SOURCE_INVALID", "/source");
  if (
    source.contractSchema !== "athyper.meta-entity-contract/2.3" ||
    !source.ownedLabels ||
    !source.referenceMembers ||
    !source.fieldIdentities
  )
    fail("NATIVE_CONVERSION_DEPENDENCIES_REQUIRED", "/source");
  if (sha256(source) !== context.source.graphHash)
    fail("NATIVE_CONVERSION_SOURCE_HASH_MISMATCH", "/source");
  if ((context.sourceKind === "product") !== (context.source.tenantId === null))
    fail("NATIVE_CONVERSION_SCOPE_INVALID", "/sourceKind");
  const labels = source.ownedLabels;
  if (!labels)
    return fail("NATIVE_CONVERSION_DEPENDENCIES_REQUIRED", "/ownedLabels");
  if (
    labels.entityId !== context.source.entityId ||
    labels.tenantId !== context.source.tenantId ||
    labels.changeSetId !== context.source.changeSetId
  )
    fail("NATIVE_CONVERSION_SCOPE_INVALID", "/ownedLabels");
  const keys = new Set<string>([
    "contractSchema",
    ...retained,
    ...nativeConversionFamilies,
  ]);
  for (const key of Object.keys(source))
    if (!keys.has(key))
      fail("NATIVE_CONVERSION_SOURCE_PATH_UNSUPPORTED", "/source/" + key);
  if (
    Object.keys(adapters).sort().join() !==
    [...nativeConversionFamilies].sort().join()
  )
    fail("NATIVE_CONVERSION_ADAPTER_INVENTORY_INVALID", "/adapters");
  validateConversionJsonData(context.installedAdapters, "/installedAdapters");
  const installed = (resource: NativeConversionResource, path: string) => {
    validateConversionJsonData(resource, path);
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
      path,
    );
    if (
      context.installedAdapters.filter(
        (i) => canonicalJson(i) === canonicalJson(resource),
      ).length !== 1
    )
      fail("NATIVE_CONVERSION_ADAPTER_NOT_INSTALLED", path);
  };
  if (!context.retainedValidation)
    return fail(
      "NATIVE_CONVERSION_RETAINED_EVIDENCE_REQUIRED",
      "/retainedValidation",
    );
  installed(
    context.retainedValidation.resource,
    "/retainedValidation/resource",
  );
  if (!/^[a-f0-9]{64}$/.test(context.retainedValidation.evidenceHash))
    fail(
      "NATIVE_CONVERSION_RETAINED_EVIDENCE_REQUIRED",
      "/retainedValidation/evidenceHash",
    );
  context.validateRetained(structuredClone(source));
  const converted: Record<string, unknown> = {},
    proof: Record<
      string,
      {
        sourceHash: string;
        targetHash: string;
        adapter: NativeConversionResource;
      }
    > = {};
  for (const kind of nativeConversionFamilies) {
    const adapter = adapters[kind];
    const r = adapter.resource;
    installed(r, "/adapters/" + kind);
    // Every family must be explicitly present. Missing is not silently normalized
    // to [], which would erase source absence semantics.
    const original = source[kind];
    if (!Array.isArray(original))
      return fail("NATIVE_CONVERSION_FAMILY_REQUIRED", "/source/" + kind);
    const target = adapter.forward(structuredClone(original) as never);
    validateConversionJsonData(target, "/target/" + kind);
    if (!Array.isArray(target))
      fail("NATIVE_CONVERSION_TARGET_INVALID", "/target/" + kind);
    const inverse = adapter.reverse(structuredClone(target) as never);
    validateConversionJsonData(inverse, "/inverse/" + kind);
    if (canonicalJson(original) !== canonicalJson(inverse))
      fail("NATIVE_CONVERSION_NOT_LOSSLESS", "/source/" + kind);
    const beforeIds = original.map((row) => row.id),
      afterIds = target.map((row) => row.id);
    if (
      beforeIds.some((id) => typeof id !== "string") ||
      canonicalJson([...beforeIds].sort()) !==
        canonicalJson([...afterIds].sort())
    )
      fail("NATIVE_CONVERSION_IDENTITY_CHANGED", "/target/" + kind);
    converted[kind] = target;
    proof[kind] = {
      sourceHash: sha256(original),
      targetHash: sha256(target),
      adapter: structuredClone(r),
    };
  }
  const core = {
    field: converted.fields,
    runtime: converted.runtimeProfiles,
    surface: converted.surfaces,
  } as NormalizedLayoutContext["core"];
  const layoutContext = context.resolveLayout(structuredClone(core));
  if (
    layoutContext.coreContext.entityId !== context.source.entityId ||
    layoutContext.coreContext.tenantId !== context.source.tenantId ||
    canonicalJson(layoutContext.core) !== canonicalJson(core)
  )
    fail("NATIVE_CONVERSION_CONTEXT_MISMATCH", "/context");
  parseNormalizedLayoutGraph(
    {
      section: converted.surfaceSections,
      binding: converted.surfaceFieldBindings,
    },
    layoutContext,
  );
  const coreLayoutEvidenceHash = sha256(
    encodeNormalizedLayout(
      {
        section: converted.surfaceSections,
        binding: converted.surfaceFieldBindings,
      } as Parameters<typeof encodeNormalizedLayout>[0],
      {
        ...layoutContext,
        changeSetId: context.source.changeSetId,
        revision: context.source.revision,
        authoringSchemaHash: context.authoringSchemaHash,
        maximumBytes: context.maximumBytes,
      },
    ),
  );
  const candidate = {
    ...structuredClone(source),
    ...converted,
    contractSchema: "athyper.meta-entity-contract/2.4",
    authoringSource: {
      entityId: context.source.entityId,
      tenantId: context.source.tenantId,
      sourceKind: context.sourceKind,
      authoringSchemaHash: context.authoringSchemaHash,
    },
  } as unknown as NativeMetaEntityGraph;
  if (Buffer.byteLength(canonicalJson(candidate)) > context.maximumBytes)
    fail("NATIVE_CONVERSION_LIMIT", "/target");
  return {
    schema: "entity.native-graph-conversion-proof/1" as const,
    source: structuredClone(context.source),
    contextHash: sha256({
      coreLayoutEvidenceHash,
      retainedValidation: context.retainedValidation,
      authoringSchemaHash: context.authoringSchemaHash,
    }),
    targetHash: sha256(candidate),
    preservedHash: sha256(
      Object.fromEntries(
        retained
          .filter((k) => Object.hasOwn(source, k))
          .map((k) => [k, source[k]]),
      ),
    ),
    families: proof,
    candidate,
  };
}
