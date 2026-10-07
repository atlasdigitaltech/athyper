import {
  FoundationContractError,
  assertOwnedLabelsComplete,
  parseNormalizedCoreGraph,
  parseNormalizedLayoutGraph,
  selectNativeStructuralGraph,
  referenceMembers,
  validateReferenceMember,
  validateFoundationNode,
  referenceUuid,
  type MetaEntityGraph,
  type ExpandedNativeMetaEntityGraph,
  type CompiledMetaEntityArtifact,
  type NormalizedCoreContext,
  type NormalizedLayoutContext,
  type NativeStructuralContext,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  parseEntityRecordPresentation,
  validateRecordPresentationReferences,
} from "@athyper/contract-platform-entity-runtime";
import { canonicalJson, sha256 } from "./deterministic.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";
import { compileNativeStructuralGraph } from "./native-structural-codec.js";
import {
  compileNativeLocalizedText,
  validateNativeEntityLabelOwner,
} from "./native-localized-labels.js";
import {
  compileNativeAuthorization,
  type NativeAuthorizationContext,
} from "./native-authorization.js";
import { compileNativeAi, type NativeAiContext } from "./native-ai.js";
import { compileNativeDefaultListView } from "./native-list-view.js";
import {
  compileNativeListSettings,
  optionalListLimits,
  type NativeListSettingsContext,
} from "./native-list-settings.js";
import { compileNativeSurfaceIdentity } from "./native-surface-identity.js";
import { compileNativeDetailNavigation } from "./native-detail-navigation.js";
import { compileNativeDetailFieldSections } from "./native-detail-sections.js";
import { compileNativeFieldChoices } from "./native-field-choices.js";
import { compileNativeDetailBadges } from "./native-detail-badges.js";
import { validateNativeSnapshotReferences } from "./native-snapshot-validation.js";
import {
  verifyNativeCompiledOperationControls,
  type NativeCompiledOperation,
} from "./native-operation-compilation.js";
import { compileNativeFieldReferenceBindings } from "./native-field-reference-compilation.js";
import type { NativeConversionResource } from "./native-graph-conversion.js";

/** Installed compilation inputs, not a draft grant or a deployed qualification.
 * The repository obtains operation controls from its exact locked source. */
export interface NativeReleaseCompilationContext {
  readonly componentResourceEvidence?: readonly import("./native-component-resources.js").InstalledComponentEvidence[];
  readonly graphHash: string;
  readonly authoringSchemaHash: string;
  readonly core: NormalizedCoreContext;
  readonly layout: Omit<NormalizedLayoutContext, "core" | "coreContext">;
  readonly structural: NativeStructuralContext;
  readonly authorization: NativeAuthorizationContext;
  readonly ai: NativeAiContext | null;
  readonly identityResource: NativeConversionResource;
  readonly listProviders: readonly NativeListSettingsContext[];
  readonly domains: readonly { code: string; values: readonly string[] }[];
  readonly relationLabels: readonly {
    relationId: string;
    labelFieldKey: string;
    resource: NativeConversionResource;
  }[];
  readonly components: readonly { id: string; runtimeKey: string }[];
}
const fail = (
  path: string,
  code = "NATIVE_RELEASE_ADAPTER_UNAVAILABLE",
): never => {
  throw new FoundationContractError(code, path);
};
const emptyBranches = [
  "changeCaseBindings",
  "operationContextRequirements",
  "materializationBindings",
  "materializationFieldMappings",
  "surfaceOperations",
  "flows",
  "flowSteps",
  "lifecycleBindings",
  "lifecycleOperationBindings",
  "policyBindings",
  "fieldPolicyBindings",
  "numberingBindings",
  "capabilities",
  "operationRules",
  "tests",
  "classProfiles",
] as const;
/** Native reference-slice lowering. No legacy graph compiler, captured legacy
 * presentation, first-field selection or inferred navigation is invoked. Every
 * unsupported nonempty family/property rejects before an artifact is returned.
 * Reader/target conformance and publication approval remain separate gates. */
export function compileNativeRelease(
  input: ExpandedNativeMetaEntityGraph,
  c: NativeReleaseCompilationContext,
  controls: readonly NativeCompiledOperation[],
): CompiledMetaEntityArtifact {
  validateConversionJsonData(input, "/graph");
  const graph = structuredClone(input);
  if (!graph.referenceMembers || !graph.ownedLabels)
    return fail("/context", "NATIVE_RELEASE_SOURCE_MISMATCH");
  if (
    graph.contractSchema !== "athyper.meta-entity-contract/2.5" ||
    sha256(graph) !== c.graphHash ||
    graph.authoringSource.authoringSchemaHash !== c.authoringSchemaHash ||
    graph.authoringSource.entityId !== c.core.entityId ||
    graph.authoringSource.tenantId !== c.core.tenantId ||
    c.core.phase !== "qualification" ||
    c.authorization.entityCode !== graph.entity.entityCode ||
    c.authorization.changeSetId !== graph.ownedLabels?.changeSetId ||
    !graph.referenceMembers ||
    !graph.ownedLabels
  )
    fail("/context", "NATIVE_RELEASE_SOURCE_MISMATCH");
  const allowed = new Set([
    "contractSchema",
    "authoringSource",
    "entity",
    "fields",
    "fieldIdentities",
    "fieldReferenceBindings",
    "operations",
    "runtimeProfiles",
    "surfaces",
    "surfaceSections",
    "surfaceFieldBindings",
    "referenceMembers",
    "ownedLabels",
    "ai",
    "classProfiles",
    "keys",
    "keyFields",
    "searchProfiles",
    "searchFields",
    "relations",
    "relationTargets",
    "relationFields",
    "operationPermissions",
    "operationScopeBindings",
    "tests",
    ...emptyBranches,
  ]);
  for (const key of Object.keys(graph)) if (!allowed.has(key)) fail("/" + key);
  for (const key of emptyBranches) if (graph[key]?.length) fail("/" + key);
  const core = parseNormalizedCoreGraph(
    {
      field: graph.fields,
      runtime: graph.runtimeProfiles,
      surface: graph.surfaces,
    },
    c.core,
  );
  const layout = parseNormalizedLayoutGraph(
    { section: graph.surfaceSections, binding: graph.surfaceFieldBindings },
    { ...c.layout, core, coreContext: c.core },
  );
  assertOwnedLabelsComplete(graph.ownedLabels, {
    entityId: c.core.entityId,
    changeSetId: graph.ownedLabels.changeSetId,
    tenantId: c.core.tenantId,
    supportedLocales: graph.ownedLabels.requiredLocales,
  });
  const { members } = graph.referenceMembers;
  for (const [kind] of Object.entries(referenceMembers)) {
    const rows = Reflect.get(members, kind) as readonly { id: string }[];
    if (new Set(rows.map((row) => row.id)).size !== rows.length)
      fail("/referenceMembers/" + kind, "NATIVE_RELEASE_SOURCE_MISMATCH");
    for (const row of rows) {
      validateFoundationNode(
        referenceUuid,
        row.id,
        "/referenceMembers/" + kind + "/id",
      );
      const { id: _, ...properties } = row;
      validateReferenceMember(
        kind as keyof typeof referenceMembers,
        properties,
      );
    }
  }
  if (members.predicate.length || members.accessPermission.length)
    fail("/referenceMembers/predicate-or-surface-permission");
  validateNativeEntityLabelOwner(graph, {
    entityId: c.core.entityId,
    tenantId: c.core.tenantId,
    changeSetId: graph.ownedLabels.changeSetId,
  });
  validateNativeSnapshotReferences(graph, graph.ownedLabels, c.core.maxMembers);
  const fieldKey = (id: string) => {
    const field = graph.fields.find((f) => f.id === id);
    const identities = c.core.identities.filter(
      (i) =>
        i.id === field?.fieldIdentityId &&
        i.entityId === c.core.entityId &&
        i.tenantId === c.core.tenantId &&
        i.parentIdentityId === null,
    );
    if (!field || identities.length !== 1)
      return fail("/fields/identity", "NATIVE_RELEASE_IDENTITY_REQUIRED");
    return identities[0]!.fieldKey;
  };
  const label = (id: string) => {
    const localizedLabel = compileNativeLocalizedText(
      graph.ownedLabels!,
      id,
      "translations",
    );
    return { label: localizedLabel.defaultText, localizedLabel };
  };
  const text = (id: string | null) =>
    id === null
      ? fail("/labelId", "NATIVE_RELEASE_LABEL_REQUIRED")
      : label(id).label;
  const presentation = (id: string) => {
    const rows = c.layout.fieldPresentation.filter((p) => p.fieldId === id);
    if (rows.length !== 1)
      return fail("/fields/access", "NATIVE_RELEASE_ACCESS_REQUIRED");
    const access = members.fieldAccess.filter(
      (a) => a.entityFieldId === id && a.targetPlane === c.authorization.plane,
    );
    if (
      access.length !== 1 ||
      access[0]!.representation !== rows[0]!.display ||
      canonicalJson([...access[0]!.queryUses].sort()) !==
        canonicalJson([...rows[0]!.queryUses].sort())
    )
      return fail("/fields/access", "NATIVE_RELEASE_ACCESS_REQUIRED");
    return rows[0]!;
  };
  const structuralInput = {
    ...selectNativeStructuralGraph(graph as unknown as MetaEntityGraph),
    relationTargets: (graph.relationTargets ?? []).map((row) => {
      const value = { ...row };
      Reflect.deleteProperty(value, "targetEntityCode");
      return value;
    }),
  };
  if (
    canonicalJson([...c.structural.fieldIds].sort()) !==
    canonicalJson(graph.fields.map((f) => f.id).sort())
  )
    fail("/structural/fieldIds", "NATIVE_RELEASE_SOURCE_MISMATCH");
  const structural = compileNativeStructuralGraph(
    structuralInput as never,
    c.structural,
  ).descriptor;
  const choiceContext = (field: (typeof graph.fields)[number]) => {
    const domain =
      field.domainCode === null
        ? null
        : c.domains.filter((d) => d.code === field.domainCode);
    if (domain !== null && domain.length !== 1)
      fail("/domains/" + field.domainCode, "NATIVE_RELEASE_RESOURCE_REQUIRED");
    return {
      field,
      maximumChoices: c.core.maxMembers,
      domainValues: domain === null ? null : domain[0]!.values,
      labelText: text,
    };
  };
  if (
    members.fieldChoice.some(
      (r) =>
        !graph.fields.some(
          (f) => f.id === r.entityFieldId && f.dataType === "enum",
        ),
    )
  )
    fail("/referenceMembers/fieldChoice");
  const fields = graph.fields.map((field) => {
    if (
      field.valueOrigin !== "stored" ||
      field.writeMode !== "read_only" ||
      field.storageKind !== "column" ||
      field.cardinality !== "one" ||
      field.parentFieldId !== null ||
      field.defaultKind !== "none" ||
      ["json", "money"].includes(field.dataType)
    )
      fail("/fields/" + field.id);
    for (const key of [
      "computedContractKey",
      "validationContractKey",
      "jsonSchemaKey",
      "replacementFieldId",
      "minimumDate",
      "maximumDate",
      "minimumDatetime",
      "maximumDatetime",
      "currencyFieldId",
      "currencyCode",
      "defaultDate",
      "defaultDatetime",
      "defaultUuid",
      "defaultText",
      "defaultNumeric",
      "defaultBoolean",
      "defaultContextKey",
    ] as const)
      if (field[key] !== null) fail("/fields/" + field.id + "/" + key);
    const typeConfig: Record<string, unknown> = { kind: field.dataType };
    for (const [property, key] of Object.entries({
      domainCode: "domain_code",
      minLength: "min_length",
      maxLength: "max_length",
      pattern: "pattern",
      minimum: "minimum",
      maximum: "maximum",
      precision: "precision",
      scale: "scale",
    }))
      if (Reflect.get(field, property) !== null)
        typeConfig[key] = Reflect.get(field, property);
    if (field.relationId !== null) {
      const relation = graph.relations?.find((r) => r.id === field.relationId),
        target = graph.relationTargets?.filter(
          (t) => t.entityRelationId === relation?.id,
        );
      if (!relation || target?.length !== 1) fail("/fields/relationId");
      const admitted = c.structural.targets.find(
        (t) =>
          t.entityId === target![0]!.targetEntityId &&
          t.keyKey === target![0]!.targetKeyKey,
      );
      if (!admitted)
        fail("/fields/relationId", "NATIVE_RELEASE_RESOURCE_REQUIRED");
      const labelReferences = c.relationLabels.filter(
        (r) => r.relationId === field.relationId,
      );
      if (
        labelReferences.length !== 1 ||
        !labelReferences[0]!.labelFieldKey ||
        !/^[a-f0-9]{64}$/.test(labelReferences[0]!.resource.hash)
      )
        fail("/fields/relation/label", "NATIVE_RELEASE_RESOURCE_REQUIRED");
      if (
        !(graph.fieldReferenceBindings ?? []).some(
          (binding) => binding.entityFieldId === field.id,
        )
      )
        typeConfig.relationReference = {
          relationKey: relation!.relationKey,
          labelField: labelReferences[0]!.labelFieldKey,
        };
      typeConfig.keyReference = {
        targetEntity: admitted!.entityCode,
        fields: (graph.relationFields ?? [])
          .filter((r) => r.entityRelationTargetId === target![0]!.id)
          .sort((a, b) => a.position - b.position)
          .map((r) => ({
            source: fieldKey(r.sourceFieldId),
            target: r.targetFieldKey,
          })),
        labelField: labelReferences[0]!.labelFieldKey,
      };
    }
    return { ...field, fieldKey: fieldKey(field.id), typeConfig };
  });
  const fieldReferenceBindings = compileNativeFieldReferenceBindings(
    graph.fieldReferenceBindings ?? [],
    fields.flatMap((field) => {
      const reference = field.typeConfig.keyReference as
        { targetEntity: string } | undefined;
      return reference
        ? [{ fieldId: field.id, targetEntityCode: reference.targetEntity }]
        : [];
    }),
  );
  const fieldRosters = fields.map((f) => ({
    id: f.id,
    key: f.fieldKey,
    uuid: f.dataType === "uuid",
    representation: presentation(f.id).display,
  }));
  if (
    canonicalJson(
      c.authorization.fields.slice().sort((a, b) => a.id.localeCompare(b.id)),
    ) !==
    canonicalJson(
      fields
        .map((f) => ({ id: f.id, key: f.fieldKey }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    )
  )
    fail("/authorization/fields", "NATIVE_RELEASE_SOURCE_MISMATCH");
  const authorization = compileNativeAuthorization(
    {
      profiles: members.authorizationProfile,
      fields: members.fieldAccess,
      operations: graph.operations,
    },
    c.authorization,
  );
  // A context cannot redeclare a wider permission than the canonical graph.
  for (const row of c.authorization.permissions) {
    const authored = (graph.operationPermissions ?? []).filter(
      (p) =>
        p.entityOperationId === row.operationId && p.targetPlane === row.plane,
    );
    if (
      authored.length > 1 ||
      (row.state === "none"
        ? authored.length !== 0 || row.permissionCode !== null
        : authored.length !== 1 ||
          authored[0]!.permissionCode !== row.permissionCode)
    )
      fail("/authorization/permissions", "NATIVE_RELEASE_SOURCE_MISMATCH");
  }
  const operations = graph.operations.map((operation) => {
    const source = controls.filter((o) => o.id === operation.id);
    if (
      source.length !== 1 ||
      canonicalJson(
        Object.fromEntries(
          Object.entries(source[0]!).filter(([key]) => key !== "requiresMfa"),
        ),
      ) !== canonicalJson(operation)
    )
      fail("/operations", "NATIVE_RELEASE_SOURCE_MISMATCH");
    return {
      ...source[0]!,
      label: text(operation.labelId),
      fieldKeys: members.operationField
        .filter((r) => r.entityOperationId === operation.id)
        .sort((a, b) => a.position - b.position)
        .map((r) => fieldKey(r.entityFieldId)),
    };
  });
  if (controls.length !== operations.length)
    fail("/operations", "NATIVE_RELEASE_SOURCE_MISMATCH");
  const runtime = graph.runtimeProfiles.map((row) => ({
    ...row,
    idFieldKey: fieldKey(row.idFieldId),
    ...(row.tenantFieldId === null
      ? {}
      : { tenantFieldKey: fieldKey(row.tenantFieldId) }),
    ...(row.recordVersionFieldId === null
      ? {}
      : { recordVersionFieldKey: fieldKey(row.recordVersionFieldId) }),
    ...(row.softDeleteFieldId === null
      ? {}
      : { softDeleteFieldKey: fieldKey(row.softDeleteFieldId) }),
  }));
  const lists = graph.surfaces.filter(
      (s) => s.surfaceKind === "list" && s.isDefault,
    ),
    details = graph.surfaces.filter(
      (s) => s.surfaceKind === "detail" && s.isDefault,
    );
  if (lists.length !== 1 || details.length !== 1 || graph.surfaces.length !== 2)
    fail("/surfaces", "NATIVE_RELEASE_SURFACE_VARIANT_UNSUPPORTED");
  const list = lists[0]!,
    detail = details[0]!;
  const listBindings = layout.binding.filter(
    (b) => b.entitySurfaceId === list.id,
  );
  const views = members.surfaceView.filter(
    (v) => v.entitySurfaceId === list.id,
  );
  if (
    views.length !== 1 ||
    views[0]!.viewKind !== "default" ||
    members.surfaceView.length !== 1
  )
    fail("/referenceMembers/surfaceView");
  const view = compileNativeDefaultListView(
    { view: views[0]!, fields: members.surfaceViewField },
    {
      entityId: c.core.entityId,
      tenantId: c.core.tenantId,
      surface: list,
      bindings: listBindings,
      fields: graph.fields,
      identities: c.core.identities,
      presentation: c.layout.fieldPresentation,
      maximumFields: c.core.maxMembers,
    },
  );
  const provider = c.listProviders.filter((p) => p.surfaceId === list.id);
  if (provider.length !== 1)
    fail("/listProviders", "NATIVE_RELEASE_RESOURCE_REQUIRED");
  const settings = compileNativeListSettings(
    list,
    provider[0]!,
    optionalListLimits.filter((k) => list[k] !== null),
  );
  const identity = (
    surface: typeof list,
    properties: Parameters<typeof compileNativeSurfaceIdentity>[2],
  ) =>
    compileNativeSurfaceIdentity(
      surface,
      {
        entityId: c.core.entityId,
        tenantId: c.core.tenantId,
        resource: c.identityResource,
        fields: graph.fields,
        identities: c.core.identities,
        presentation: c.layout.fieldPresentation,
        maximumFields: c.core.maxMembers,
      },
      properties,
    );
  const detailSections = layout.section.filter(
      (s) => s.entitySurfaceId === detail.id,
    ),
    groups = members.navigationGroup.filter(
      (g) => g.entitySurfaceId === detail.id,
    );
  const navigation = compileNativeDetailNavigation(
    { groups, sections: detailSections },
    { surface: detail, maximumSections: c.core.maxMembers, label },
  );
  const sectionOrder = [...groups]
    .sort((a, b) => a.position - b.position)
    .flatMap((g) =>
      detailSections
        .filter((s) => s.navigationGroupId === g.id)
        .sort((a, b) => a.position - b.position)
        .map((s) => s.id),
    );
  const sections = compileNativeDetailFieldSections(
    {
      sections: detailSections,
      bindings: layout.binding.filter(
        (b) => b.entitySurfaceId === detail.id && b.bindingKind === "field",
      ),
    },
    {
      surface: detail,
      maximumMembers: c.core.maxMembers,
      fields: fieldRosters,
      label: (id) => ({
        label: text(id),
        localizedLabel: compileNativeLocalizedText(
          graph.ownedLabels!,
          id,
          "key-default",
        ),
      }),
    },
    sectionOrder,
  );
  if (
    layout.section.length !== detailSections.length ||
    members.navigationGroup.length !== groups.length ||
    layout.binding.some(
      (b) =>
        ![list.id, detail.id].includes(b.entitySurfaceId ?? "") ||
        !["field", "badge"].includes(b.bindingKind),
    )
  )
    fail("/layout");
  const badges = compileNativeDetailBadges(
    layout.binding.filter(
      (b) => b.entitySurfaceId === detail.id && b.bindingKind === "badge",
    ),
    members.fieldChoice,
    {
      surface: detail,
      maximumBadges: c.core.maxMembers,
      fields: graph.fields
        .filter((f) => f.dataType === "enum")
        .map((f) => ({
          key: fieldKey(f.id),
          representation: presentation(f.id).display,
          choices: choiceContext(f),
        })),
    },
  );
  const localizedLabels = {
    entity: compileNativeLocalizedText(
      graph.ownedLabels,
      graph.entity.entityLabelId ?? fail("/entity/entityLabelId"),
      "translations",
    ),
    options: Object.fromEntries(
      graph.fields
        .filter((f) => f.dataType === "enum")
        .map((f) => [
          fieldKey(f.id),
          Object.fromEntries(
            members.fieldChoice
              .filter((r) => r.entityFieldId === f.id)
              .map((r) => [
                r.valueText,
                compileNativeLocalizedText(
                  graph.ownedLabels!,
                  r.labelId,
                  "translations",
                ),
              ]),
          ),
        ]),
    ),
    fields: Object.fromEntries(
      graph.fields
        .filter((f) => f.labelId !== null)
        .map((f) => [
          fieldKey(f.id),
          compileNativeLocalizedText(
            graph.ownedLabels!,
            f.labelId!,
            "translations",
          ),
        ]),
    ),
  };
  const recordPresentation = parseEntityRecordPresentation({
    schemaVersion: 1,
    ...identity(detail, [
      "titleField",
      ...(detail.codeFieldId === null ? [] : ["codeField" as const]),
      ...(detail.iconKey === null ? [] : ["iconKey" as const]),
    ]),
    navigation,
    sections: sections.map((section) => ({
      ...section,
      localizedLabel: compileNativeLocalizedText(
        graph.ownedLabels!,
        detailSections.find((row) => row.sectionKey === section.key)!.labelId!,
        "translations",
      ),
    })),
    ...(badges.length ? { badges } : {}),
    localizedLabels: {
      ...localizedLabels,
      title: compileNativeLocalizedText(
        graph.ownedLabels,
        detail.labelId!,
        "translations",
      ),
    },
  });
  validateRecordPresentationReferences(
    recordPresentation,
    fields.map((f) => f.fieldKey),
    operations.map((o) => o.operationKey),
  );
  const search = graph.searchProfiles?.find(
    (p) => p.id === list.searchProfileId,
  );
  if (list.searchProfileId !== null && !search)
    fail("/surfaces/searchProfileId");
  const listPresentation = {
    schemaVersion: 1,
    title: text(list.labelId),
    localizedLabels: {
      ...localizedLabels,
      title: compileNativeLocalizedText(
        graph.ownedLabels,
        list.labelId!,
        "translations",
      ),
    },
    ...identity(list, ["identityField"]),
    ...settings,
    defaultState: { ...view.defaultState, columns: view.visibleFields },
    search: search
      ? {
          profileKey: search.searchKey,
          minimumQueryLength: search.minimumQueryLength,
        }
      : {},
  };
  const bindings = layout.binding.map((b) => {
    for (const key of [
      "componentInputId",
      "componentFilterId",
      "componentFormatId",
      "referenceSurfaceKey",
      "referenceLoadMode",
      "tokenKey",
      "textWrap",
      "fractionDigits",
      "dateStyle",
      "emptyTextLabelId",
      "alignment",
      "defaultFilterOperator",
      "helpLabelId",
      "placeholderLabelId",
    ] as const)
      if (b[key] !== null) fail("/bindings/" + b.id + "/" + key);
    if (b.columnSpan !== 1 || b.meaningfulForForm)
      fail("/bindings/" + b.id + "/geometry");
    const field = graph.fields.find((f) => f.id === b.entityFieldId)!;
    const component =
      b.componentDisplayId === null
        ? []
        : c.components.filter((r) => r.id === b.componentDisplayId);
    if (b.componentDisplayId !== null && component.length !== 1)
      fail("/bindings/componentDisplayId", "NATIVE_RELEASE_RESOURCE_REQUIRED");
    if (b.bindingKind === "badge") return { ...b };
    const choices =
      field.dataType === "enum"
        ? compileNativeFieldChoices(
            members.fieldChoice.filter((r) => r.entityFieldId === field.id),
            choiceContext(field),
          )
        : null;
    return {
      ...b,
      labelOverride: text(b.labelOverrideId ?? field.labelId),
      displayConfig: {
        defaultVisible:
          b.entitySurfaceId === list.id &&
          view.visibleFields.includes(fieldKey(field.id)),
        ...(field.semanticRole === null
          ? {}
          : { semanticRole: field.semanticRole }),
        ...(b.width === null ? {} : { defaultWidth: b.width }),
        ...(component.length ? { rendererKey: component[0]!.runtimeKey } : {}),
        ...(choices
          ? { lookup: { options: choices.options }, statusTones: choices.tones }
          : {}),
        ...(b.filterOperators === null
          ? {}
          : { filterOperators: b.filterOperators }),
      },
    };
  });
  const aiMembers = Object.values(graph.ai).some((rows) => rows.length > 0);
  if (aiMembers && c.ai === null)
    fail("/ai", "NATIVE_RELEASE_RESOURCE_REQUIRED");
  if (
    c.ai &&
    canonicalJson(
      c.ai.fields.slice().sort((a, b) => a.id.localeCompare(b.id)),
    ) !==
      canonicalJson(
        fieldRosters.slice().sort((a, b) => a.id.localeCompare(b.id)),
      )
  )
    fail("/ai/fields", "NATIVE_RELEASE_SOURCE_MISMATCH");
  const descriptor: Readonly<Record<string, unknown>> = {
    compilationContextHash: sha256(c),
    entity: graph.entity,
    fields,
    fieldReferenceBindings,
    operations,
    ...structural,
    classProfiles: graph.classProfiles ?? [],
    runtimeProfiles: runtime,
    surfaces: graph.surfaces.map((s) => ({ ...s, title: text(s.labelId) })),
    surfaceSections: graph.surfaceSections,
    surfaceFieldBindings: bindings,
    operationPermissions: graph.operationPermissions ?? [],
    operationScopeBindings: graph.operationScopeBindings ?? [],
    authorization: authorization.profile,
    authorizationRuntime: authorization.runtime,
    listPresentation,
    recordPresentation,
    ...(aiMembers ? { ai: compileNativeAi(graph.ai, c.ai!) } : {}),
    ...(runtime[0]?.referenceCapabilityKey === null
      ? {}
      : { referenceCapability: runtime[0]?.referenceCapabilityKey }),
  };
  verifyNativeCompiledOperationControls(controls, descriptor);
  return {
    schema: "athyper.entity-runtime-descriptor/1.0",
    compiler: {
      name: "@athyper/meta-entity-compiler",
      version: "native-reference/1",
    },
    contractHash: sha256(graph),
    descriptorHash: sha256(descriptor),
    descriptor: JSON.parse(canonicalJson(descriptor)),
  };
}
