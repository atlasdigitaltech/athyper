import { validateNativeEntityLabelOwner } from "./native-localized-labels.js";
import {
  validateNativeEntityLabelDerivation,
  type NativeEntityLabelDerivation,
} from "./native-presentation-localization.js";
import {
  validateNativeBadgeDerivations,
  type NativeBadgeDerivation,
} from "./native-detail-badges.js";
import {
  validateNativeRelationDerivations,
  type NativeRelationDerivation,
} from "./native-reference-relations.js";
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
export interface NativeSectionDerivation {
  readonly id: string;
  readonly surfaceId: string;
  readonly sourceIndex: number;
  readonly sourceHash: string;
}
/** Removes only a redundant unplaced UUID presentation membership. The field,
 * identity and immutable source revision survive; this is not field retirement. */
export interface NativeBindingRetirement {
  readonly id: string;
  readonly surfaceId: string;
  readonly fieldId: string;
  readonly sourceHash: string;
  readonly reason: "unplaced_uuid";
}
export function validateNativeBindingRetirements(
  source: MetaEntityGraph,
  retirements: readonly NativeBindingRetirement[],
): void {
  validateConversionJsonData(source, "/source");
  validateConversionJsonData(retirements, "/nested/bindingRetirements");
  if (
    !Array.isArray(source.fields) ||
    !Array.isArray(source.surfaces) ||
    !Array.isArray(source.surfaceFieldBindings)
  )
    throw new FoundationContractError(
      "NATIVE_CONVERSION_RETIREMENT_INVALID",
      "/source",
    );
  if (
    !Array.isArray(retirements) ||
    retirements.some((r) => !r || typeof r !== "object" || Array.isArray(r)) ||
    new Set(retirements.map((r) => r.id)).size !== retirements.length
  )
    throw new FoundationContractError(
      "NATIVE_CONVERSION_RETIREMENT_INVALID",
      "/nested/bindingRetirements",
    );
  for (const r of retirements) {
    validateFoundationNode(
      {
        type: "object",
        properties: {
          id: referenceUuid,
          surfaceId: referenceUuid,
          fieldId: referenceUuid,
          sourceHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
          reason: { const: "unplaced_uuid" },
        },
      },
      r,
      "/nested/bindingRetirements",
    );
    const rows =
      source.surfaceFieldBindings?.filter((b) => b.id === r.id) ?? [];
    const row = rows[0];
    const fields = source.fields.filter((f) => f.id === r.fieldId);
    const surfaces =
      source.surfaces?.filter(
        (s) =>
          s.id === r.surfaceId && ["detail", "list"].includes(s.surfaceKind),
      ) ?? [];
    const record = surfaces[0]?.layoutConfig?.recordPresentation as
      Record<string, unknown> | undefined;
    const sections = record?.sections;
    // This selected disposition requires an explicit, complete inline field
    // roster. Other presentation or binding behavior cannot be discarded.
    const sectionRoster =
      Array.isArray(sections) &&
      sections.length > 0 &&
      sections.every(
        (section) =>
          section &&
          typeof section === "object" &&
          Array.isArray(section.fields) &&
          section.fields.every((key: unknown) => typeof key === "string"),
      );
    const visibleKeys = [
      record?.titleField,
      record?.codeField,
      ...(Array.isArray(record?.badges)
        ? record.badges.map((b) => b?.field)
        : []),
    ];
    const containsValue = (needle: string, value: unknown): boolean =>
      value === needle ||
      (Array.isArray(value)
        ? value.some((v) => containsValue(needle, v))
        : !!value &&
          typeof value === "object" &&
          Object.values(value).some((v) => containsValue(needle, v)));
    const outside = {
      ...source,
      surfaceFieldBindings: source.surfaceFieldBindings?.filter(
        (b) => b.id !== r.id,
      ),
    };
    if (
      rows.length !== 1 ||
      fields.length !== 1 ||
      surfaces.length !== 1 ||
      row!.entityFieldId !== r.fieldId ||
      row!.entitySurfaceId !== r.surfaceId ||
      row!.entitySurfaceSectionId != null ||
      fields[0]!.dataType !== "uuid" ||
      typeof fields[0]!.fieldKey !== "string" ||
      !/^[a-z][a-z0-9_.-]{0,126}$/.test(fields[0]!.fieldKey) ||
      !Number.isSafeInteger(row!.position) ||
      row!.position < 0 ||
      row!.position > 32767 ||
      sha256(row) !== r.sourceHash ||
      (surfaces[0]!.surfaceKind === "detail"
        ? !sectionRoster
        : row!.displayConfig?.defaultVisible !== false) ||
      (Array.isArray(sections)
        ? (sections as { fields: string[] }[])
        : []
      ).some((section) => section.fields.includes(fields[0]!.fieldKey)) ||
      visibleKeys.includes(fields[0]!.fieldKey) ||
      surfaces[0]!.layoutConfig?.identityField === fields[0]!.fieldKey ||
      (record?.actions !== undefined &&
        (!Array.isArray(record.actions) || record.actions.length !== 0)) ||
      containsValue(r.id, outside) ||
      containsValue(fields[0]!.fieldKey, record) ||
      Object.keys(row!).some(
        (k) =>
          ![
            "id",
            "entitySurfaceId",
            "entitySurfaceSectionId",
            "entityFieldId",
            "bindingKey",
            "position",
            "labelOverride",
            "displayConfig",
          ].includes(k),
      ) ||
      Object.keys(row!.displayConfig ?? {}).some(
        (k) => k !== "defaultVisible",
      ) ||
      (row!.displayConfig?.defaultVisible !== undefined &&
        typeof row!.displayConfig.defaultVisible !== "boolean")
    )
      throw new FoundationContractError(
        "NATIVE_CONVERSION_RETIREMENT_INVALID",
        "/nested/bindingRetirements/" + r.id,
      );
  }
}
export interface NativeNestedConversionAdapter {
  /** Only explicit inline field sections may introduce new section identities.
   * Existing members remain exact except explicit validated unplaced UUID binding dispositions. */
  readonly relationDerivations?: readonly NativeRelationDerivation[];
  readonly badgeDerivations?: readonly NativeBadgeDerivation[];
  readonly entityLabelDerivation?: NativeEntityLabelDerivation;
  readonly sectionDerivations?: readonly NativeSectionDerivation[];
  readonly bindingRetirements?: readonly NativeBindingRetirement[];
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
        relationDerivations?: readonly NativeRelationDerivation[];
        badgeDerivations?: readonly NativeBadgeDerivation[];
        entityLabelDerivation?: NativeEntityLabelDerivation;
        sectionDerivations?: readonly NativeSectionDerivation[];
        bindingRetirements?: readonly NativeBindingRetirement[];
      }
    | undefined;
  if (nested) {
    const metadata = structuredClone({
      resource: nested.resource,
      dependencies: nested.dependencies,
      sectionDerivations: nested.sectionDerivations,
      bindingRetirements: nested.bindingRetirements,
      relationDerivations: nested.relationDerivations,
      badgeDerivations: nested.badgeDerivations,
      entityLabelDerivation: nested.entityLabelDerivation,
    });
    installed(metadata.resource, "/nested/resource");
    if (metadata.dependencies) {
      validateConversionJsonData(metadata.dependencies, "/nested/dependencies");
      if (
        !Array.isArray(metadata.dependencies) ||
        new Set(metadata.dependencies.map((d) => canonicalJson(d))).size !==
          metadata.dependencies.length
      )
        fail(
          "NATIVE_CONVERSION_ADAPTER_INVENTORY_INVALID",
          "/nested/dependencies",
        );
      for (const dependency of metadata.dependencies)
        installed(dependency, "/nested/dependencies");
    }
    prepared = nested.forward(structuredClone(source));
    validateConversionJsonData(prepared, "/prepared");
    const relationBranches = ["relations", "relationTargets", "relationFields"];
    const relationDerivations = structuredClone(
      metadata.relationDerivations ?? [],
    );
    if (relationDerivations.length)
      validateNativeRelationDerivations(source, prepared, relationDerivations);
    for (const d of relationDerivations)
      installed(d.resource, "/nested/relationDerivations/resource");
    const rootKeys = Object.keys(source).concat(
      relationDerivations.length
        ? relationBranches.filter((k) => !Object.hasOwn(source, k))
        : [],
    );
    if (
      prepared.contractSchema !== source.contractSchema ||
      Object.keys(prepared).sort().join() !== rootKeys.sort().join()
    )
      fail("NATIVE_CONVERSION_NESTED_GRAPH_INVALID", "/prepared");
    if (Buffer.byteLength(canonicalJson(prepared)) > context.maximumBytes)
      fail("NATIVE_CONVERSION_LIMIT", "/prepared");
    // Nested presentation conversion cannot rewrite operations, protected
    // controls, scopes, permissions, policies or other retained declarations.
    if (metadata.entityLabelDerivation)
      validateNativeEntityLabelDerivation(
        source,
        prepared,
        metadata.entityLabelDerivation,
      );
    const extensible = new Set([
      ...(metadata.entityLabelDerivation ? ["entity"] : []),
      "referenceMembers",
      "ownedLabels",
      "fieldIdentities",
      ...(relationDerivations.length ? relationBranches : []),
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
    for (const kind of nativeConversionFamilies)
      if (!Array.isArray(source[kind]) || !Array.isArray(prepared[kind]))
        fail("NATIVE_CONVERSION_FAMILY_REQUIRED", "/source/" + kind);
    const derivations = metadata.sectionDerivations ?? [];
    validateConversionJsonData(derivations, "/nested/sectionDerivations");
    if (
      !Array.isArray(derivations) ||
      derivations.some(
        (d) => !d || typeof d !== "object" || Array.isArray(d),
      ) ||
      new Set(derivations.map((d) => d.id)).size !== derivations.length
    )
      fail(
        "NATIVE_CONVERSION_DERIVATION_INVALID",
        "/nested/sectionDerivations",
      );
    for (const d of derivations) {
      validateFoundationNode(
        {
          type: "object",
          properties: {
            id: referenceUuid,
            surfaceId: referenceUuid,
            sourceIndex: { type: "integer", minimum: 0, maximum: 32766 },
            sourceHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
          },
        },
        d,
        "/nested/sectionDerivations",
      );
      const surfaces = source.surfaces!.filter(
        (s) => s.id === d.surfaceId && s.surfaceKind === "detail",
      );
      const record = surfaces[0]?.layoutConfig?.recordPresentation as
        { sections?: readonly { key?: string }[] } | undefined;
      const declaration = Array.isArray(record?.sections)
        ? record.sections[d.sourceIndex]
        : undefined;
      const rows = prepared.surfaceSections!.filter(
        (s) => s.id === d.id && s.entitySurfaceId === d.surfaceId,
      );
      if (
        surfaces.length !== 1 ||
        !declaration ||
        sha256(declaration) !== d.sourceHash ||
        rows.length !== 1 ||
        rows[0]!.sectionKey !== declaration.key ||
        rows[0]!.sectionKind !== "section" ||
        nativeConversionFamilies.some((k) =>
          source[k]?.some((r) => r.id === d.id),
        )
      )
        fail(
          "NATIVE_CONVERSION_DERIVATION_INVALID",
          "/nested/sectionDerivations",
        );
    }
    const badgeDerivations = metadata.badgeDerivations ?? [];
    if (badgeDerivations.length)
      validateNativeBadgeDerivations(source, prepared, badgeDerivations);
    const retirements = metadata.bindingRetirements ?? [];
    validateNativeBindingRetirements(source, retirements);
    for (const kind of nativeConversionFamilies) {
      const before = source[kind],
        after = prepared[kind];
      if (
        !Array.isArray(before) ||
        !Array.isArray(after) ||
        canonicalJson(
          [
            ...before
              .filter(
                (row) =>
                  kind !== "surfaceFieldBindings" ||
                  !retirements.some((r) => r.id === row.id),
              )
              .map((row) => row.id),
            ...(kind === "surfaceSections" ? derivations.map((d) => d.id) : []),
            ...(kind === "surfaceFieldBindings"
              ? badgeDerivations.map((d) => d.id)
              : []),
          ].sort(),
        ) !== canonicalJson(after.map((row) => row.id).sort())
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
      adapter: structuredClone(metadata.resource),
      ...(metadata.entityLabelDerivation
        ? { entityLabelDerivation: metadata.entityLabelDerivation }
        : {}),
      sourceHash: sha256(source),
      preparedHash: sha256(prepared),
      ...(relationDerivations.length ? { relationDerivations } : {}),
      ...(badgeDerivations.length
        ? { badgeDerivations: structuredClone(badgeDerivations) }
        : {}),
      ...(retirements.length
        ? { bindingRetirements: structuredClone(retirements) }
        : {}),
      ...(derivations.length
        ? { sectionDerivations: structuredClone(derivations) }
        : {}),
      ...(metadata.dependencies?.length
        ? { dependencies: structuredClone(metadata.dependencies) }
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
  validateNativeEntityLabelOwner(candidate, context.source);
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
    schema: nestedProof?.entityLabelDerivation
      ? ("entity.native-graph-conversion-proof/7" as const)
      : nestedProof?.badgeDerivations?.length
        ? ("entity.native-graph-conversion-proof/6" as const)
        : nestedProof?.relationDerivations?.length
          ? ("entity.native-graph-conversion-proof/5" as const)
          : nestedProof?.bindingRetirements?.length
            ? ("entity.native-graph-conversion-proof/4" as const)
            : nestedProof?.sectionDerivations?.length
              ? ("entity.native-graph-conversion-proof/3" as const)
              : nestedProof ||
                  Object.values(proof).some((p) => p.dependencies?.length)
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
  const entityOwners = steps.filter((a) => a.entityLabelDerivation);
  if (entityOwners.length > 1)
    throw new FoundationContractError(
      "NATIVE_CONVERSION_ROOT_OWNER_CONFLICT",
      "/adapters",
    );
  return {
    ...(entityOwners.length
      ? {
          entityLabelDerivation: structuredClone(
            entityOwners[0]!.entityLabelDerivation!,
          ),
        }
      : {}),
    resource: structuredClone(resource),
    ...(steps.some((a) => a.badgeDerivations?.length)
      ? {
          badgeDerivations: steps.flatMap((a) =>
            structuredClone(a.badgeDerivations ?? []),
          ),
        }
      : {}),
    ...(steps.some((a) => a.relationDerivations?.length)
      ? {
          relationDerivations: steps.flatMap((a) =>
            structuredClone(a.relationDerivations ?? []),
          ),
        }
      : {}),
    ...(steps.some((a) => a.sectionDerivations?.length)
      ? {
          sectionDerivations: steps.flatMap((a) =>
            structuredClone(a.sectionDerivations ?? []),
          ),
        }
      : {}),
    ...(steps.some((a) => a.bindingRetirements?.length)
      ? {
          bindingRetirements: steps.flatMap((a) =>
            structuredClone(a.bindingRetirements ?? []),
          ),
        }
      : {}),
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
