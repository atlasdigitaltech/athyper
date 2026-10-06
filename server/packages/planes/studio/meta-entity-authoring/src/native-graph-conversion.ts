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
  readonly dependencies?: readonly NativeConversionResource[];
  forward(source: NonNullable<MetaEntityGraph[K]>): NativeMetaEntityGraph[K];
  reverse(target: NativeMetaEntityGraph[K]): NonNullable<MetaEntityGraph[K]>;
};
export type NativeConversionAdapters = {
  readonly [K in NativeConversionFamily]: NativeFamilyConversionAdapter<K>;
};
/** Graph-level normalization of nested source paths into typed reference/label
 * members before scalar adapters run. Installed owner code only. The inverse
 * consumes the converted graph, not a captured source-value backup. */
export interface NativeNestedConversionAdapter {
  readonly resource: NativeConversionResource;
  readonly dependencies?: readonly NativeConversionResource[];
  forward(source: MetaEntityGraph): MetaEntityGraph;
  reverse(
    prepared: MetaEntityGraph,
    target: NativeMetaEntityGraph,
  ): MetaEntityGraph;
}
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
  resolveLayout(
    core: NormalizedLayoutContext["core"],
    prepared?: MetaEntityGraph,
  ): NormalizedLayoutContext;
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
  nested?: NativeNestedConversionAdapter,
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
  let prepared = structuredClone(source);
  let nestedProof:
    | {
        adapter: NativeConversionResource;
        sourceHash: string;
        preparedHash: string;
        dependencies?: readonly NativeConversionResource[];
      }
    | undefined;
  if (nested) {
    installed(nested.resource, "/nested/resource");
    if (nested.dependencies) {
      validateConversionJsonData(nested.dependencies, "/nested/dependencies");
      if (
        !Array.isArray(nested.dependencies) ||
        new Set(nested.dependencies.map((d) => canonicalJson(d))).size !==
          nested.dependencies.length
      )
        fail(
          "NATIVE_CONVERSION_ADAPTER_INVENTORY_INVALID",
          "/nested/dependencies",
        );
      for (const dependency of nested.dependencies)
        installed(dependency, "/nested/dependencies");
    }
    prepared = nested.forward(structuredClone(source));
    validateConversionJsonData(prepared, "/prepared");
    if (
      prepared.contractSchema !== source.contractSchema ||
      Object.keys(prepared).sort().join() !== Object.keys(source).sort().join()
    )
      fail("NATIVE_CONVERSION_NESTED_GRAPH_INVALID", "/prepared");
    if (Buffer.byteLength(canonicalJson(prepared)) > context.maximumBytes)
      fail("NATIVE_CONVERSION_LIMIT", "/prepared");
    // Nested presentation conversion cannot rewrite operations, protected
    // controls, scopes, permissions, policies or other retained declarations.
    const extensible = new Set([
      "referenceMembers",
      "ownedLabels",
      "fieldIdentities",
    ]);
    for (const key of retained) {
      if (
        !extensible.has(key) &&
        canonicalJson(prepared[key]) !== canonicalJson(source[key])
      )
        fail("NATIVE_CONVERSION_RETAINED_BRANCH_CHANGED", "/prepared/" + key);
    }
    const additionsOnly = (before: unknown, after: unknown, path: string) => {
      if (!Array.isArray(before) || !Array.isArray(after))
        return fail("NATIVE_CONVERSION_NESTED_GRAPH_INVALID", path);
      const rows = new Map<string, string>();
      for (const row of after) {
        if (!row || typeof row.id !== "string" || rows.has(row.id))
          return fail("NATIVE_CONVERSION_IDENTITY_CHANGED", path);
        validateFoundationNode(referenceUuid, row.id, path);
        rows.set(row.id, canonicalJson(row));
      }
      const beforeIds = new Set<string>();
      for (const row of before) {
        if (
          !row ||
          beforeIds.has(row.id) ||
          rows.get(row.id) !== canonicalJson(row)
        )
          fail("NATIVE_CONVERSION_RETAINED_MEMBER_CHANGED", path);
        beforeIds.add(row.id);
      }
    };
    additionsOnly(
      source.fieldIdentities,
      prepared.fieldIdentities,
      "/prepared/fieldIdentities",
    );
    if (!prepared.referenceMembers || !prepared.ownedLabels)
      return fail("NATIVE_CONVERSION_DEPENDENCIES_REQUIRED", "/prepared");
    if (
      Object.keys(prepared.referenceMembers).sort().join() !==
        Object.keys(source.referenceMembers!).sort().join() ||
      prepared.referenceMembers.contract !==
        source.referenceMembers!.contract ||
      !prepared.referenceMembers.members ||
      Object.keys(prepared.referenceMembers.members).sort().join() !==
        Object.keys(source.referenceMembers!.members).sort().join()
    )
      fail(
        "NATIVE_CONVERSION_NESTED_GRAPH_INVALID",
        "/prepared/referenceMembers",
      );
    for (const kind of Object.keys(source.referenceMembers!.members)) {
      const key = kind as keyof NonNullable<
        MetaEntityGraph["referenceMembers"]
      >["members"];
      additionsOnly(
        source.referenceMembers!.members[key],
        prepared.referenceMembers.members[key],
        "/prepared/referenceMembers/members/" + kind,
      );
    }
    for (const kind of nativeConversionFamilies) {
      const before = source[kind],
        after = prepared[kind];
      if (
        !Array.isArray(before) ||
        !Array.isArray(after) ||
        canonicalJson(before.map((row) => row.id).sort()) !==
          canonicalJson(after.map((row) => row.id).sort())
      )
        fail("NATIVE_CONVERSION_IDENTITY_CHANGED", "/prepared/" + kind);
    }
    for (const key of Object.keys(source.ownedLabels!)) {
      if (key === "labels" || key === "translations") {
        additionsOnly(
          source.ownedLabels![key],
          prepared.ownedLabels[key],
          "/prepared/ownedLabels/" + key,
        );
      } else if (
        canonicalJson(
          source.ownedLabels![key as keyof typeof source.ownedLabels],
        ) !==
        canonicalJson(
          prepared.ownedLabels[key as keyof typeof prepared.ownedLabels],
        )
      ) {
        fail("NATIVE_CONVERSION_SCOPE_INVALID", "/prepared/ownedLabels/" + key);
      }
    }
    if (
      Object.keys(source.ownedLabels!).sort().join() !==
      Object.keys(prepared.ownedLabels).sort().join()
    )
      fail("NATIVE_CONVERSION_NESTED_GRAPH_INVALID", "/prepared/ownedLabels");
    context.validateRetained(structuredClone(prepared));
    nestedProof = {
      adapter: structuredClone(nested.resource),
      sourceHash: sha256(source),
      preparedHash: sha256(prepared),
      ...(nested.dependencies?.length
        ? { dependencies: structuredClone(nested.dependencies) }
        : {}),
    };
  }
  const converted: Record<string, unknown> = {},
    proof: Record<
      string,
      {
        sourceHash: string;
        targetHash: string;
        adapter: NativeConversionResource;
        dependencies?: readonly NativeConversionResource[];
      }
    > = {};
  for (const kind of nativeConversionFamilies) {
    const adapter = adapters[kind];
    const r = adapter.resource;
    installed(r, "/adapters/" + kind);
    if (adapter.dependencies) {
      validateConversionJsonData(
        adapter.dependencies,
        "/adapters/" + kind + "/dependencies",
      );
      if (
        !Array.isArray(adapter.dependencies) ||
        new Set(adapter.dependencies.map((d) => canonicalJson(d))).size !==
          adapter.dependencies.length
      )
        fail(
          "NATIVE_CONVERSION_ADAPTER_INVENTORY_INVALID",
          "/adapters/" + kind + "/dependencies",
        );
      for (const dependency of adapter.dependencies)
        installed(dependency, "/adapters/" + kind + "/dependencies");
    }
    // Every family must be explicitly present. Missing is not silently normalized
    // to [], which would erase source absence semantics.
    const original = prepared[kind];
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
      ...(adapter.dependencies?.length
        ? { dependencies: structuredClone(adapter.dependencies) }
        : {}),
    };
  }
  const core = {
    field: converted.fields,
    runtime: converted.runtimeProfiles,
    surface: converted.surfaces,
  } as NormalizedLayoutContext["core"];
  const layoutContext = context.resolveLayout(
    structuredClone(core),
    structuredClone(prepared),
  );
  if (
    layoutContext.coreContext.entityId !== context.source.entityId ||
    layoutContext.coreContext.tenantId !== context.source.tenantId ||
    canonicalJson(layoutContext.core) !== canonicalJson(core)
  )
    fail("NATIVE_CONVERSION_CONTEXT_MISMATCH", "/context");
  if (nested) {
    const declared = prepared
      .referenceMembers!.members.navigationGroup.map(
        ({ id, entitySurfaceId, position }) => ({
          id,
          entitySurfaceId,
          position,
        }),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    const resolved = [...layoutContext.navigationGroups].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    if (canonicalJson(declared) !== canonicalJson(resolved))
      fail("NATIVE_CONVERSION_CONTEXT_MISMATCH", "/context/navigationGroups");
  }
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
    ...structuredClone(prepared),
    ...converted,
    contractSchema: "athyper.meta-entity-contract/2.4",
    authoringSource: {
      entityId: context.source.entityId,
      tenantId: context.source.tenantId,
      sourceKind: context.sourceKind,
      authoringSchemaHash: context.authoringSchemaHash,
    },
  } as unknown as NativeMetaEntityGraph;
  if (nested) {
    // Reconstruct every scalar family from the final target, then invert nested
    // normalization. Exact equality binds all source paths, including absence.
    const inverse = { ...structuredClone(prepared) };
    for (const kind of nativeConversionFamilies)
      (inverse as unknown as Record<string, unknown>)[kind] = adapters[
        kind
      ].reverse(structuredClone(candidate[kind]) as never);
    const restored = nested.reverse(inverse, structuredClone(candidate));
    validateConversionJsonData(restored, "/inverse");
    if (canonicalJson(restored) !== canonicalJson(source))
      fail("NATIVE_CONVERSION_NOT_LOSSLESS", "/inverse");
  }
  if (Buffer.byteLength(canonicalJson(candidate)) > context.maximumBytes)
    fail("NATIVE_CONVERSION_LIMIT", "/target");
  return {
    schema:
      nestedProof || Object.values(proof).some((p) => p.dependencies?.length)
        ? ("entity.native-graph-conversion-proof/2" as const)
        : ("entity.native-graph-conversion-proof/1" as const),
    source: structuredClone(context.source),
    contextHash: sha256({
      coreLayoutEvidenceHash,
      retainedValidation: context.retainedValidation,
      authoringSchemaHash: context.authoringSchemaHash,
      ...(nestedProof ? { nested: nestedProof } : {}),
      ...(Object.values(proof).some((p) => p.dependencies?.length)
        ? {
            dependencies: Object.fromEntries(
              Object.entries(proof)
                .filter(([, p]) => p.dependencies?.length)
                .map(([kind, p]) => [kind, p.dependencies]),
            ),
          }
        : {}),
    }),
    ...(nestedProof ? { nested: nestedProof } : {}),
    targetHash: sha256(candidate),
    ...(nestedProof
      ? {
          retainedTargetHash: sha256(
            Object.fromEntries(
              retained
                .filter((k) => Object.hasOwn(candidate, k))
                .map((k) => [k, candidate[k]]),
            ),
          ),
        }
      : {}),
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

/** Registered owner composition of accounted nested paths. Every child resource
 * and dependency remains installed evidence in the outer conversion proof.
 * Reverse order restores each preceding prepared shape from typed target rows;
 * this does not replay a captured legacy graph or admit request-supplied code. */
export function composeNativeNestedConversionAdapters(
  resource: NativeConversionResource,
  adapters: readonly NativeNestedConversionAdapter[],
): NativeNestedConversionAdapter {
  if (!adapters.length)
    throw new FoundationContractError(
      "NATIVE_CONVERSION_NESTED_ADAPTERS_REQUIRED",
      "/adapters",
    );
  const steps = [...adapters];
  return {
    resource: structuredClone(resource),
    dependencies: [
      ...new Map(
        steps
          .flatMap((a) => [a.resource, ...(a.dependencies ?? [])])
          .map((r) => [canonicalJson(r), structuredClone(r)]),
      ).values(),
    ],
    forward: (source) =>
      steps.reduce((graph, a) => a.forward(graph), structuredClone(source)),
    reverse: (prepared, target) =>
      [...steps]
        .reverse()
        .reduce(
          (graph, a) => a.reverse(graph, target),
          structuredClone(prepared),
        ),
  };
}
