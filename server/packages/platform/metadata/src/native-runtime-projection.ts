import { compileEntityIntakeSurfaces } from "./intake-surface-projection.js";
import { compileEntityIntakeFlows } from "./intake-projection.js";
import { createHash } from "node:crypto";
import { parseEntityRuntimeDescriptor } from "./descriptor-parser.js";

type Row = Record<string, any>;

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
export function projectNativeFieldChoices(display: Row = {}, dataType?: string): Row {
  const list = Object.fromEntries(
    ["semanticRole", "filterOperators", "groupable", "defaultWidth", "rendererKey", "columnGroup"]
      .filter(key => display[key] !== undefined).map(key => [key, display[key]]),
  );
  const options = display.lookup?.options;
  return {
    list,
    ...(dataType === "enum" && Array.isArray(options) && options.length
      ? { validation: { options: options.map((option: Row) => option.value) } }
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
    tenantField: string;
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
}) {
  const { native, registration } = input;
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
        if (bound.length !== 1)
          throw Error(
            `NATIVE_PROJECTION_PERMISSION_REQUIRED:${operation.operationKey}`,
          );
        const permission = input.permissions.filter(
          (permission) => permission.code === bound[0]!.permissionCode,
        );
        if (permission.length !== 1)
          throw Error(
            `NATIVE_PROJECTION_CATALOG_REQUIRED:${bound[0]!.permissionCode}`,
          );
        const required = scopes.filter(
          (binding) => binding.entityOperationId === operation.id,
        );
        if (
          !required.length ||
          required.some(
            (binding) => !permission[0]!.scopeKinds.includes(binding.scopeKind),
          )
        )
          throw Error(
            `NATIVE_PROJECTION_SCOPE_MISMATCH:${operation.operationKey}`,
          );
        return [
          operation.operationKey,
          {
            code: operation.operationKey,
            permissionCode: permission[0]!.code,
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
  const intakeFlows = compileEntityIntakeFlows(native);
  const intakeSurfaces = compileEntityIntakeSurfaces(native);
  const runtimeInputs = new Set(intakeSurfaces.flatMap(s => s.sections.flatMap(section => section.fields.map(f => f.key))));
  const descriptor = {
    schema: "athyper.entity-runtime-descriptor/1.0",
    entityCode: registration.entityCode,
    planeKey: registration.plane,
    storage: registration.storage,
    ...(registration.detailRouteTemplate
      ? { detailRouteTemplate: registration.detailRouteTemplate }
      : {}),
    fields: fields.filter(field => !(field.valueOrigin === "runtime" && runtimeInputs.has(field.fieldKey))).map((field) => {
      if (field.valueOrigin !== "stored" || field.writeMode !== "read_only")
        throw Error(
          `NATIVE_PROJECTION_FIELD_ADAPTER_REQUIRED:${field.fieldKey}`,
        );
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
      const display = registration.fieldPresentationDefaults?.[field.fieldKey];
      const choices = projectNativeFieldChoices(binding?.displayConfig, field.dataType);
      return {
        ...choices,
        key: field.fieldKey,
        storagePath: field.storagePath,
        type: field.dataType,
        required: false,
        writableOn: [],
        sortable: policy.queryUses.includes("sort"),
        filterable: policy.queryUses.includes("filter"),
        searchable:
          policy.queryUses.includes("filter") && searchableFields.has(field.id),
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
    ...(intakeFlows.length ? {intakeFlows} : {}),
    ...(intakeSurfaces.length ? {intakeSurfaces} : {}),
    authorization,
    ...Object.fromEntries(
      ["listPresentation", "recordPresentation", "directoryScope"]
        .filter((key) => registration.presentationDefaults?.[key] !== undefined)
        .map((key) => [key, registration.presentationDefaults![key]]),
    ),
    ...Object.fromEntries(
      [
        "authorizationRuntime",
        "listPresentation",
        "recordPresentation",
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
  const compiledHash = createHash("sha256")
    .update(JSON.stringify(descriptor))
    .digest("hex");
  parseEntityRuntimeDescriptor({
    entity_code: registration.entityCode,
    plane_code: registration.plane,
    release_id: "00000000-0000-4000-8000-000000000001",
    release_no: 1,
    entity_contract_hash: compiledHash,
    compiled_hash: compiledHash,
    compiled_json: descriptor,
  });
  return descriptor;
}
