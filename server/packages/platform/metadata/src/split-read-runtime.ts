import { parseEntityRuntimeDescriptor } from "./descriptor-parser.js";

type Source = Readonly<Record<string, any>>;
/** Server lowering for explicitly authored shared read contracts. Non-read
 * operations are reported, never dropped from or marked qualified for a release. */
export function prepareSplitReadRuntime(core: Source, operations: Source) {
  if (
    core.entityCode !== operations.entityCode ||
    core.plane !== operations.plane ||
    core.storage?.genericWriteEnabled !== false ||
    !core.listPresentation ||
    !core.recordPresentation
  )
    throw Error("SPLIT_READ_SOURCE_INCOMPLETE");
  if (
    core.fieldAccess !== undefined ||
    (operations.policyBindings?.length ?? 0) > 0
  )
    throw Error("SPLIT_READ_POLICY_ADAPTER_REQUIRED");
  const entityCode = core.entityCode,
    planeKey = core.plane;
  const object = core.storage.readObject ?? core.storage.primaryObject;
  const parts = typeof object === "string" ? object.split(".") : [];
  if (
    parts.length !== 2 ||
    !parts.every((part) => /^[a-z][a-z0-9_]*$/.test(part))
  )
    throw Error("SPLIT_READ_STORAGE_INVALID");
  const bindings = ["list", "read"].map((key) => {
    const op = operations.operations?.find((op: Source) => op.key === key);
    if (
      !op ||
      op.execution?.handlerKey !== `entity.record.${key}.v1` ||
      op.scopeBinding?.resolverKey !== "tenant.record.v1"
    )
      throw Error(`SPLIT_READ_BINDING_REQUIRED:${key}`);
    // A partial adapter must reject controls it cannot preserve, rather than
    // lowering a richer operation into an unrestricted generic read.
    if (
      operations.operations.filter((candidate: Source) => candidate.key === key)
        .length !== 1 ||
      Object.keys(op).some(
        (property) =>
          ![
            "key",
            "permissionCode",
            "execution",
            "scopeBinding",
            "idempotency",
          ].includes(property),
      ) ||
      Object.keys(op.execution).some(
        (property) => !["handlerKey", "registryRequired"].includes(property),
      ) ||
      Object.keys(op.scopeBinding).some(
        (property) =>
          !["scopeSource", "resolverKey", "denyUnresolved"].includes(property),
      ) ||
      op.execution.registryRequired !== true ||
      op.scopeBinding.denyUnresolved !== true ||
      op.scopeBinding.scopeSource !==
        "persisted_record_or_validated_create_input" ||
      op.idempotency !== "not_applicable"
    )
      throw Error(`SPLIT_READ_OPERATION_ADAPTER_REQUIRED:${key}`);
    return {
      key,
      ...(op.permissionCode === undefined
        ? {}
        : { permissionCode: op.permissionCode }),
      scope: "tenant.record.v1",
      target: key === "list" ? "collection" : "existing",
      effect: "read",
      requiresParentRead: false,
      requiresPreflight: false,
    };
  });
  if (!Array.isArray(core.fields) || !core.fields.length)
    throw Error("SPLIT_READ_FIELDS_REQUIRED");
  const queryFields = (key: string) =>
    new Set((core.query?.[key] ?? []).map((entry: Source) => entry.fieldKey));
  const search = queryFields("search"),
    filters = queryFields("filters"),
    sorts = queryFields("sorts");
  const policies: Source[] = [];
  const fields = core.fields.map((field: Source) => {
    if (
      field.binding?.sourceObject !== object ||
      typeof field.binding?.column !== "string" ||
      !["authorized_projection", "masked_only"].includes(field.readPolicy)
    )
      throw Error(`SPLIT_READ_FIELD_BINDING_REQUIRED:${field.key}`);
    const masked = field.protection?.normalProjection?.mode === "masked";
    if (field.readPolicy === "masked_only" && !masked)
      throw Error("SPLIT_READ_MASKING_REQUIRED");
    const queryUses = [
      ...(search.has(field.key) ? ["search"] : []),
      ...(filters.has(field.key) ? ["filter"] : []),
      ...(sorts.has(field.key) ? ["sort"] : []),
    ];
    if (masked && queryUses.length)
      throw Error("SPLIT_READ_MASKED_QUERY_FORBIDDEN");
    policies.push({
      key: field.key,
      fields: [field.key],
      readOperation: "read",
      representation: masked ? "masked" : "plain",
      writeOperations: [],
      queryUses,
    });
    const options = field.display?.lookup?.options;
    return {
      ...(field.readPermissionCode === undefined
        ? {}
        : { readPermissionCode: field.readPermissionCode }),
      key: field.key,
      storagePath: field.binding.column,
      type: field.dataType,
      required: field.nullable === false,
      writableOn: [],
      filterable: filters.has(field.key),
      sortable: sorts.has(field.key),
      searchable: search.has(field.key),
      ...(field.structuredProjection
        ? { structuredProjection: field.structuredProjection }
        : {}),
      ...(Array.isArray(options)
        ? {
            validation: {
              options: options.map((option: Source) => option.value),
              optionLabels: Object.fromEntries(
                options.map((option: Source) => [
                  option.value,
                  option.label.defaultText,
                ]),
              ),
            },
          }
        : {}),
      list: {
        label: field.label?.defaultText,
        defaultVisible: core.listPresentation.defaultColumns.includes(
          field.key,
        ),
      },
    };
  });
  const presentation = core.recordPresentation;
  for (const key of [
    core.listPresentation.identityField,
    presentation.titleField,
    ...core.listPresentation.defaultColumns,
  ]) {
    const field = fields.find((field: Source) => field.key === key);
    if (!field || ["uuid", "json"].includes(field.type))
      throw Error(`SPLIT_READ_READABLE_IDENTITY_REQUIRED:${key}`);
  }
  if (!presentation.navigation) throw Error("SPLIT_READ_NAVIGATION_REQUIRED");
  const descriptor = {
    schema: "athyper.entity-runtime-descriptor/1.0",
    entityCode,
    planeKey,
    storage: {
      schema: parts[0],
      object: parts[1],
      idField: core.storage.idField,
      tenantField: core.storage.tenantField,
      ...(core.storage.versionField
        ? { versionField: core.storage.versionField }
        : {}),
      ...(core.storage.statusField
        ? { statusField: core.storage.statusField }
        : {}),
    },
    fields,
    operations: Object.fromEntries(
      bindings.map((binding) => [
        binding.key,
        {
          code: binding.key,
          ...(binding.permissionCode === undefined
            ? {}
            : { permissionCode: binding.permissionCode }),
          authorizationMode: "bound_operation",
        },
      ]),
    ),
    authorization: {
      schemaVersion: 1,
      entityCode,
      planeKey,
      ownership: "tenant.record.v1",
      directory: { operation: "list", population: "tenant" },
      recordReadOperation: "read",
      operations: bindings,
      fieldPolicies: policies,
      surfaces: [],
      relationships: [],
    },
    authorizationRuntime: {
      schemaVersion: 1,
      runtimeVersion: "entity-authorization.v1",
      bindings: bindings.map((binding) => ({
        operation: binding.key,
        handler: `entity.record.${binding.key}.v1`,
        resolver: "tenant.record.v1",
      })),
    },
    ...(core.directoryScope ? { directoryScope: core.directoryScope } : {}),
    listPresentation: core.listPresentation,
    recordPresentation: {
      ...presentation,
      ...(core.entityRelationships
        ? { entityRelationships: core.entityRelationships }
        : {}),
    },
    detailRouteTemplate: `/app/entity/${entityCode}/:recordId`,
  };
  parseEntityRuntimeDescriptor({
    entity_code: entityCode,
    plane_code: planeKey,
    release_id: "00000000-0000-4000-8000-000000000001",
    release_no: 1,
    entity_contract_hash: "a".repeat(64),
    compiled_hash: "a".repeat(64),
    compiled_json: descriptor,
  });
  return {
    descriptor,
    remainingOperations: operations.operations
      .filter((op: Source) => !["list", "read"].includes(op.key))
      .map((op: Source) => op.key),
    publicationReady: false as const,
  };
}
