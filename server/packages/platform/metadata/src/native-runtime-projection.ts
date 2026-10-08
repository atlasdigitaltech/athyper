import { parseEntityKeyReference } from "@athyper/server-contract-metadata";
import {
  validateEntityLiveReadContractV1,
  type EntityLiveReadContractV1,
  type EntitySourceIdentityV1,
} from "@athyper/server-contract-metadata";
import { compileEntityIntakeSurfaces } from "./intake-surface-projection.js";
import { compileEntityIntakeFlows } from "./intake-projection.js";
import { createHash } from "node:crypto";
import { parseEntityRuntimeDescriptor } from "./descriptor-parser.js";
import {
  COMMON_REFERENCE_VIEW_PERMISSION,
  assertCommonReferenceGraph,
  assertCommonReferenceDescriptor,
} from "@athyper/server-contract-metadata";

type Row = Record<string, any>;

/** Search and filter are independent authorizations; configuration cannot grant either. */
export function projectFieldQueryAccess(
  queryUses: readonly string[],
  configuredSearch: boolean,
) {
  return {
    sortable: queryUses.includes("sort"),
    filterable: queryUses.includes("filter"),
    searchable: queryUses.includes("search") && configuredSearch,
  };
}

/** Stored field writes must agree with both the native operation and its field policy.
 * A writable field alone never grants an operation or makes it executable. */
export function projectStoredFieldWrites(
  field: Row,
  policy: Row,
  operations: readonly Row[],
) {
  if (
    field.valueOrigin !== "stored" ||
    !["read_only", "write_once", "mutable"].includes(field.writeMode)
  )
    throw Error(`NATIVE_PROJECTION_FIELD_ADAPTER_REQUIRED:${field.fieldKey}`);
  const requested = policy.writeOperations ?? [];
  if (!Array.isArray(requested))
    throw Error("NATIVE_PROJECTION_FIELD_WRITES_INVALID");
  return requested.map((key: unknown) => {
    if (key !== "create" && key !== "patch")
      throw Error("NATIVE_PROJECTION_FIELD_WRITE_OPERATION_UNSUPPORTED");
    if (
      field.writeMode === "read_only" ||
      (field.writeMode === "write_once" && key !== "create")
    )
      throw Error(
        `NATIVE_PROJECTION_FIELD_WRITE_MODE_MISMATCH:${field.fieldKey}`,
      );
    const operation = operations.find(
      (operation) =>
        operation.operationKey === key && operation.status !== "deprecated",
    );
    // Persisted native operations do not carry the optional authoring fieldKeys
    // hint. The published field policy above is the write allowlist. When an
    // authoring hint is present, it must agree rather than widen that policy.
    if (
      !operation ||
      operation.operationKind !== (key === "patch" ? "update" : "create") ||
      (operation.fieldKeys !== undefined &&
        (!Array.isArray(operation.fieldKeys) ||
          !operation.fieldKeys.includes(field.fieldKey)))
    )
      throw Error(
        `NATIVE_PROJECTION_FIELD_WRITE_BINDING_REQUIRED:${field.fieldKey}`,
      );
    return key;
  });
}

/** A standalone list surface does not replace its registered application shell.
 * An explicitly authored application remains a complete replacement. Existing
 * action/section contracts retain their permission and scope requirements. */
export function projectListPresentation(native: Row, baseline?: Row): Row {
  const experience = native.experience;
  const registered = baseline?.experience;
  if (
    !registered?.application ||
    !experience ||
    experience.application ||
    experience.navigation !== undefined
  )
    return native;
  const merge = (previous: Row[] = [], next: Row[] = [], key: string) => [
    ...previous.filter(
      (item) => !next.some((value) => value[key] === item[key]),
    ),
    ...next,
  ];
  return {
    ...native,
    experience: {
      ...registered,
      ...experience,
      application: registered.application,
      navigation: registered.navigation,
      currentSurfaceKey: registered.currentSurfaceKey,
      routes: merge(registered.routes, experience.routes, "surfaceKey"),
      actions: merge(registered.actions, experience.actions, "key"),
    },
  };
}
/** Copy only presentation metadata; authorization and query policy stay separate. */
export function projectNativeFieldChoices(
  display: Row = {},
  dataType?: string,
): Row {
  const list = Object.fromEntries(
    [
      "semanticRole",
      "statusTones",
      "cardPriority",
      "filterOperators",
      "groupable",
      "defaultWidth",
      "rendererKey",
      "columnGroup",
    ]
      .filter((key) => display[key] !== undefined)
      .map((key) => [key, display[key]]),
  );
  const options = display.lookup?.options;
  return {
    list,
    ...(dataType === "enum" && Array.isArray(options) && options.length
      ? {
          validation: {
            options: options.map((option: Row) => option.value),
            optionLabels: Object.fromEntries(
              options
                .filter((option: Row) => typeof option.label === "string")
                .map((option: Row) => [String(option.value), option.label]),
            ),
          },
        }
      : {}),
  };
}

export interface NativeProjectionRegistration {
  readonly entityCode: string;
  readonly plane: "studio" | "neon" | "mesh";
  /** Supplied by trusted runtime composition, never inferred from an entity name. */
  readonly storage: {
    schema: string;
    object: string;
    idField: string;
    tenantField?: string;
    versionField?: string;
    statusField?: string;
  };
  readonly columns: readonly string[];
  readonly detailRouteTemplate?: string;
  /** Existing registered presentation survives when the native graph has no
   * replacement surface. It carries no grants, policies or runtime handlers. */
  readonly presentationDefaults?: Readonly<Record<string, unknown>>;
  readonly fieldPresentationDefaults?: Readonly<
    Record<
      string,
      { label?: string; defaultOrder?: number; defaultVisible?: boolean }
    >
  >;
}

/** Common native-to-runtime lowering. Validation of handlers, storage availability
 * and policy dependencies belongs to the caller's runtime qualification gate.
 * Unsupported behavior fails explicitly instead of disappearing from projection. */
export function compileNativeRuntimeProjection(input: {
  native: Readonly<Record<string, unknown>>;
  registration: NativeProjectionRegistration;
  permissions: readonly { code: string; scopeKinds: readonly string[] }[];
  /** Trusted publication composition only. Pins do not attest installation or
   * permission; the existing publication qualifier must establish that evidence.
   * Expected coordinates come from the immutable release, separately from pins. */
  liveRead?: {
    source: EntitySourceIdentityV1;
    contract: EntityLiveReadContractV1;
  };
}) {
  const { native, registration } = input;
  if (
    input.liveRead !== undefined &&
    (!input.liveRead || typeof input.liveRead !== "object")
  )
    throw Error("NATIVE_PROJECTION_LIVE_SOURCE_MISMATCH");
  const liveRead = input.liveRead && structuredClone(input.liveRead);
  if (liveRead) {
    validateEntityLiveReadContractV1(liveRead.contract);
    for (const key of [
      "entityId",
      "releaseId",
      "contractHash",
      "tenantId",
    ] as const)
      if (liveRead.source[key] !== liveRead.contract.source[key])
        throw Error("NATIVE_PROJECTION_LIVE_SOURCE_MISMATCH");
  }
  const commonReference =
    native.referenceCapability === COMMON_REFERENCE_VIEW_PERMISSION ||
    (Array.isArray(native.operationPermissions) &&
      native.operationPermissions.some(
        (p) => p.permissionCode === COMMON_REFERENCE_VIEW_PERMISSION,
      ));
  if (commonReference)
    assertCommonReferenceGraph(
      native,
      registration.plane,
      native.referenceCapability === COMMON_REFERENCE_VIEW_PERMISSION &&
        Array.isArray(native.runtimeProfiles) &&
        native.runtimeProfiles.length === 1 &&
        native.runtimeProfiles[0]?.referenceCapabilityKey !== undefined
        ? "native-runtime"
        : "legacy-surface",
    );
  const object = (value: unknown): Row => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error("NATIVE_PROJECTION_OBJECT_REQUIRED");
    return value as Row;
  };
  const rows = (key: string): Row[] => {
    const value = native[key] ?? [];
    if (!Array.isArray(value))
      throw Error(`NATIVE_PROJECTION_BRANCH_INVALID:${key}`);
    return value.map(object);
  };
  if (object(native.entity).entityCode !== registration.entityCode)
    throw Error("NATIVE_PROJECTION_ENTITY_MISMATCH");
  for (const branch of [
    "policyBindings",
    "fieldPolicyBindings",
    "lifecycleBindings",
    "lifecycleOperationBindings",
    "numberingBindings",
    "operationRules",
  ]) {
    if (rows(branch).some((row) => row.status !== "deprecated"))
      throw Error(`NATIVE_PROJECTION_ADAPTER_REQUIRED:${branch}`);
  }
  if (!native.authorization)
    throw Error("NATIVE_PROJECTION_AUTHORIZATION_REQUIRED");
  const authorization = object(native.authorization);
  if (authorization.planeKey !== registration.plane)
    throw Error("NATIVE_PROJECTION_PLANE_MISMATCH");
  const fields = rows("fields").filter(
    (field) => field.status !== "deprecated",
  );
  const fieldIds = new Map(fields.map((field) => [field.id, field.fieldKey]));
  const scopes = rows("operationScopeBindings").filter(
    (binding) =>
      binding.status !== "deprecated" &&
      binding.targetPlane === registration.plane,
  );
  const links = rows("operationPermissions").filter(
    (binding) =>
      binding.status !== "deprecated" &&
      binding.targetPlane === registration.plane,
  );
  const operations = Object.fromEntries(
    rows("operations")
      .filter((operation) => operation.status !== "deprecated")
      .map((operation) => {
        const bound = links.filter(
          (link) => link.entityOperationId === operation.id,
        );
        if (bound.length > 1)
          throw Error(
            `NATIVE_PROJECTION_PERMISSION_AMBIGUOUS:${operation.operationKey}`,
          );
        const permission = input.permissions.filter(
          (permission) => permission.code === bound[0]?.permissionCode,
        );
        if (bound.length && permission.length !== 1)
          throw Error(
            `NATIVE_PROJECTION_CATALOG_REQUIRED:${bound[0]!.permissionCode}`,
          );
        const required = scopes.filter(
          (binding) => binding.entityOperationId === operation.id,
        );
        if (
          !required.length ||
          required.some(
            (binding) =>
              permission[0] &&
              !permission[0].scopeKinds.includes(binding.scopeKind),
          )
        )
          throw Error(
            `NATIVE_PROJECTION_SCOPE_MISMATCH:${operation.operationKey}`,
          );
        return [
          operation.operationKey,
          {
            code: operation.operationKey,
            ...(permission[0] ? { permissionCode: permission[0].code } : {}),
            authorizationMode: "bound_operation",
          },
        ];
      }),
  );
  const searchProfiles = new Set(
    rows("searchProfiles")
      .filter((profile) => profile.status !== "deprecated")
      .map((profile) => profile.id),
  );
  const searchableFields = new Set(
    rows("searchFields")
      .filter((field) => searchProfiles.has(field.entitySearchProfileId))
      .map((field) => field.entityFieldId),
  );
  const listSurfaces = rows("surfaces").filter(
    (surface) =>
      surface.surfaceKind === "list" && surface.status !== "deprecated",
  );
  const defaultSurface =
    listSurfaces.find((surface) => surface.isDefault) ?? listSurfaces[0];
  const presentationFields = rows("surfaceFieldBindings").filter(
    (binding) =>
      binding.status !== "deprecated" &&
      binding.entitySurfaceId === defaultSurface?.id,
  );
  const detailSurfaces = rows("surfaces").filter(
    (surface) =>
      surface.surfaceKind === "detail" && surface.status !== "deprecated",
  );
  const detailDefaults = detailSurfaces.filter((surface) => surface.isDefault);
  if (
    detailDefaults.length > 1 ||
    (detailSurfaces.length > 1 && detailDefaults.length !== 1)
  )
    throw Error("NATIVE_PROJECTION_DETAIL_SURFACE_AMBIGUOUS");
  const detailSurface = detailDefaults[0] ?? detailSurfaces[0];
  const detailBindings = rows("surfaceFieldBindings").filter(
    (binding) =>
      binding.status !== "deprecated" &&
      binding.entitySurfaceId === detailSurface?.id,
  );
  const intakeFlows = compileEntityIntakeFlows(native);
  const intakeSurfaces = compileEntityIntakeSurfaces(native);
  const runtimeInputs = new Set(
    intakeSurfaces.flatMap((s) =>
      s.sections.flatMap((section) => section.fields.map((f) => f.key)),
    ),
  );
  const descriptor = {
    ...(commonReference
      ? { referenceCapability: COMMON_REFERENCE_VIEW_PERMISSION }
      : {}),
    schema: liveRead
      ? "athyper.entity-runtime-descriptor/1.1"
      : "athyper.entity-runtime-descriptor/1.0",
    ...(liveRead ? { liveReadContract: liveRead.contract } : {}),
    entityCode: registration.entityCode,
    planeKey: registration.plane,
    storage: registration.storage,
    ...(registration.detailRouteTemplate
      ? { detailRouteTemplate: registration.detailRouteTemplate }
      : {}),
    fields: fields
      .filter(
        (field) =>
          !(
            field.valueOrigin === "runtime" && runtimeInputs.has(field.fieldKey)
          ),
      )
      .map((field) => {
        if (!registration.columns.includes(field.storagePath))
          throw Error(
            `NATIVE_PROJECTION_STORAGE_COLUMN_MISSING:${field.fieldKey}`,
          );
        const policy = (authorization.fieldPolicies as Row[]).find((policy) =>
          policy.fields.includes(field.fieldKey),
        );
        if (!policy)
          throw Error(
            `NATIVE_PROJECTION_FIELD_POLICY_REQUIRED:${field.fieldKey}`,
          );
        const binding = presentationFields.find(
          (binding) => fieldIds.get(binding.entityFieldId) === field.fieldKey,
        );
        const display =
          registration.fieldPresentationDefaults?.[field.fieldKey];
        const choices = projectNativeFieldChoices(
          binding?.displayConfig,
          field.dataType,
        );
        const constraints = Object.fromEntries(
          Object.entries({
            minLength: field.typeConfig?.min_length,
            maxLength: field.typeConfig?.max_length,
            pattern: field.typeConfig?.pattern,
            minimum: field.typeConfig?.minimum,
            maximum: field.typeConfig?.maximum,
          }).filter(([, value]) => value !== undefined),
        );
        const references = rows("fieldReferenceBindings").filter(
          (ref) =>
            ref.entityFieldId === field.id &&
            ref.status !== "deprecated" &&
            ref.referenceKind === "entity_relation",
        );
        if (references.length > 1)
          throw Error("NATIVE_PROJECTION_AMBIGUOUS_REFERENCE");
        const reference = references[0];
        const keyReference =
          field.typeConfig?.keyReference === undefined
            ? undefined
            : parseEntityKeyReference(
                field.typeConfig.keyReference,
                field.fieldKey,
              );
        const selected = field.typeConfig?.relationReference;
        let canonicalReference = false;
        if (selected !== undefined) {
          const relations = rows("relations").filter(
            (r) =>
              r.relationKey === selected.relationKey &&
              r.status !== "deprecated",
          );
          const targets =
            relations.length === 1
              ? rows("relationTargets").filter(
                  (t) => t.entityRelationId === relations[0]!.id,
                )
              : [];
          const mappings =
            targets.length === 1
              ? rows("relationFields")
                  .filter((m) => m.entityRelationTargetId === targets[0]!.id)
                  .sort((a, b) => a.position - b.position)
              : [];
          canonicalReference = Boolean(
            keyReference &&
            !reference &&
            targets.length === 1 &&
            targets[0]!.targetEntityCode === keyReference.targetEntity &&
            selected.labelField === keyReference.labelField &&
            mappings.length > 0 &&
            mappings.length === keyReference.fields.length &&
            mappings.every(
              (m, i) =>
                m.position === i + 1 &&
                fields.find((f) => f.id === m.sourceFieldId)?.fieldKey ===
                  keyReference.fields[i]?.source &&
                m.targetFieldKey === keyReference.fields[i]?.target,
            ),
          );
          if (!canonicalReference)
            throw Error("NATIVE_PROJECTION_REFERENCE_MAPPING_INVALID");
        }
        if (
          keyReference &&
          ((!reference && !canonicalReference) ||
            (reference &&
              reference.targetEntityCode !== keyReference.targetEntity) ||
            keyReference.fields.some(
              (mapping) =>
                !fields.some((source) => source.fieldKey === mapping.source),
            ))
        )
          throw Error("NATIVE_PROJECTION_REFERENCE_MAPPING_INVALID");
        if (
          reference &&
          (!reference.targetEntityCode ||
            (!keyReference && !["uuid", "reference"].includes(field.dataType)))
        )
          throw Error("NATIVE_PROJECTION_REFERENCE_ADAPTER_REQUIRED");
        const detailMatches = detailBindings.filter(
          (binding) => binding.entityFieldId === field.id,
        );
        if (detailMatches.length > 1)
          throw Error("NATIVE_PROJECTION_DETAIL_BINDING_AMBIGUOUS");
        const detailDisplay = detailMatches[0]?.displayConfig as
          Record<string, unknown> | undefined;
        const detailRenderer = detailDisplay?.rendererKey;
        return {
          ...(detailRenderer === undefined
            ? {}
            : { detail: { rendererKey: detailRenderer } }),
          ...(keyReference ? { keyReference } : {}),
          ...(reference || canonicalReference
            ? {
                referenceTargetEntity:
                  reference?.targetEntityCode ?? keyReference!.targetEntity,
              }
            : {}),
          ...choices,
          ...(Object.keys(constraints).length
            ? { validation: { ...choices.validation, ...constraints } }
            : {}),
          key: field.fieldKey,
          storagePath: field.storagePath,
          type: field.dataType,
          required:
            field.writeMode !== "read_only" && field.cardinality === "one",
          writableOn: projectStoredFieldWrites(
            field,
            policy,
            rows("operations"),
          ),
          // Keep `public` too. Export admission is fail-closed and therefore
          // cannot distinguish an explicitly public field from an omitted
          // classification if the projection drops it.
          classification: field.dataClassification,
          ...projectFieldQueryAccess(
            policy.queryUses,
            searchableFields.has(field.id),
          ),
          list: {
            ...choices.list,
            label: binding?.labelOverride ?? display?.label ?? field.fieldKey,
            defaultOrder: binding?.position ?? display?.defaultOrder ?? 9999,
            defaultVisible: binding
              ? binding.displayConfig?.defaultVisible !== false
              : defaultSurface
                ? false
                : (display?.defaultVisible ?? false),
          },
        };
      }),
    operations,
    ...(intakeFlows.length ? { intakeFlows } : {}),
    ...(intakeSurfaces.length ? { intakeSurfaces } : {}),
    authorization,
    ...Object.fromEntries(
      ["listPresentation", "recordPresentation", "directoryScope"]
        .filter((key) => registration.presentationDefaults?.[key] !== undefined)
        .map((key) => [key, registration.presentationDefaults![key]]),
    ),
    ...Object.fromEntries(
      [
        "ownerAccess",
        "recordPredicates",
        "mutationPolicy",
        "authorizationRuntime",
        "listPresentation",
        "recordPresentation",
        "formPresentation",
        "directoryScope",
        "collectionRelationship",
        "ai",
      ]
        .filter((key) => native[key] !== undefined)
        .map((key) => [
          key,
          key === "listPresentation"
            ? projectListPresentation(
                object(native[key]),
                registration.presentationDefaults?.[key] as Row | undefined,
              )
            : native[key],
        ]),
    ),
  };
  // Invoke the real runtime parser before an artifact can be staged or signed.
  if (commonReference)
    assertCommonReferenceDescriptor(descriptor, registration.plane);
  const compiledHash = createHash("sha256")
    .update(JSON.stringify(descriptor))
    .digest("hex");
  parseEntityRuntimeDescriptor({
    entity_code: registration.entityCode,
    plane_code: registration.plane,
    release_id:
      liveRead?.source.releaseId ?? "00000000-0000-4000-8000-000000000001",
    release_no: 1,
    entity_contract_hash: liveRead?.source.contractHash ?? compiledHash,
    compiled_hash: compiledHash,
    compiled_json: descriptor,
  });
  return descriptor;
}
