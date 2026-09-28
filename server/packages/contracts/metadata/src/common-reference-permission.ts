/** The only cross-plane permission namespace admitted by the reference capability.
 * Catalog identity is shared; membership, grants and evaluation remain plane-local.
 */
export const COMMON_REFERENCE_VIEW_PERMISSION = "common.platform.reference.view";

type Row = Record<string, any>;
const row = (value: unknown): Row => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("COMMON_REFERENCE_OBJECT_REQUIRED");
  return value as Row;
};
const rows = (value: unknown): Row[] => {
  if (!Array.isArray(value) || !value.length) throw new TypeError("COMMON_REFERENCE_ROWS_REQUIRED");
  return value.map(row);
};

/** Validate explicit authoring enrollment, not merely a schema name or prefix. */
export function assertCommonReferenceGraph(value: unknown, plane?: string): void {
  const graph = row(value), entity = row(graph.entity);
  const profiles = rows(graph.runtimeProfiles), profile = profiles[0]!;
  if (entity.entityClass !== "reference" || entity.ownershipModel !== "system" || profiles.length !== 1 ||
      profile.storageSchema !== "shared" || profile.backingKind !== "table" || profile.readMode !== "generic" ||
      profile.writeMode !== "none" || profile.tenantFieldKey || (plane && profile.storagePlane !== plane))
    throw new TypeError("COMMON_REFERENCE_READ_ONLY_PROFILE_REQUIRED");
  const enrolled = (graph.surfaces ?? []).filter((surface: Row) => surface.status !== "deprecated" && surface.layoutConfig?.referenceCapability === COMMON_REFERENCE_VIEW_PERMISSION);
  if (enrolled.length !== 1) throw new TypeError("COMMON_REFERENCE_ENROLLMENT_REQUIRED");
  for (const field of rows(graph.fields)) {
    if (field.status === "deprecated") continue;
    if (field.valueOrigin !== "stored" || field.writeMode !== "read_only" || field.dataClassification !== "public")
      throw new TypeError("COMMON_REFERENCE_PUBLIC_READ_ONLY_FIELDS_REQUIRED");
  }
  for (const operation of rows(graph.operations)) {
    if (operation.status === "deprecated") continue;
    if (!["list", "read", "view"].includes(operation.operationKey) || operation.operationKind !== "read")
      throw new TypeError("COMMON_REFERENCE_READ_OPERATIONS_ONLY");
    const permissions = (graph.operationPermissions ?? []).filter((p: Row) => p.entityOperationId === operation.id && p.status !== "deprecated");
    const scopes = (graph.operationScopeBindings ?? []).filter((s: Row) => s.entityOperationId === operation.id && s.status !== "deprecated");
    if (permissions.length !== 1 || permissions[0].permissionCode !== COMMON_REFERENCE_VIEW_PERMISSION || permissions[0].permissionKind !== "capability" || permissions[0].targetPlane !== profile.storagePlane ||
        scopes.length !== 1 || scopes[0].targetPlane !== profile.storagePlane || scopes[0].scopeKind !== "tenant" || scopes[0].coordinateSource !== "tenant_context" || scopes[0].missingValueBehavior !== "deny")
      throw new TypeError("COMMON_REFERENCE_EXACT_TENANT_BINDING_REQUIRED");
  }
}

/** Runtime/signing boundary; no arbitrary common.* names or write bindings. */
export function assertCommonReferenceDescriptor(value: unknown, plane: string): void {
  const descriptor = row(value), storage = row(descriptor.storage);
  if (descriptor.referenceCapability !== COMMON_REFERENCE_VIEW_PERMISSION || descriptor.planeKey !== plane ||
      storage.schema !== "shared" || storage.tenantField)
    throw new TypeError("COMMON_REFERENCE_DESCRIPTOR_REQUIRED");
  for (const field of rows(descriptor.fields)) {
    if (!Array.isArray(field.writableOn) || field.writableOn.length !== 0)
      throw new TypeError("COMMON_REFERENCE_WRITES_FORBIDDEN");
  }
  const operations = Object.entries(row(descriptor.operations));
  if (!operations.length || operations.some(([key, value]) => !["list", "read", "view"].includes(key) || row(value).permissionCode !== COMMON_REFERENCE_VIEW_PERMISSION))
    throw new TypeError("COMMON_REFERENCE_READ_OPERATIONS_ONLY");
  const authorization = row(descriptor.authorization);
  for (const operation of rows(authorization.operations)) {
    if (operation.effect !== "read" || operation.permissionCode !== COMMON_REFERENCE_VIEW_PERMISSION || operation.scope !== "tenant.record.v1")
      throw new TypeError("COMMON_REFERENCE_AUTHORIZATION_REQUIRED");
  }
}
