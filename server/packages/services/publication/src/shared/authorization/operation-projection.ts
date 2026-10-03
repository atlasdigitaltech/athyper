type Row = Record<string, unknown>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hash = /^[a-f0-9]{64}$/;
function check(value: unknown, message: string): asserts value {
  if (!value) throw Error(`PUBLICATION_OPERATION_${message}`);
}
function row(value: unknown): Row {
  check(value && typeof value === "object" && !Array.isArray(value), "OBJECT_REQUIRED");
  return value as Row;
}
function rows(value: unknown): Row[] {
  check(Array.isArray(value), "ROWS_REQUIRED");
  return value.map(row);
}
const isId = (v: unknown) => typeof v === "string" && uuid.test(v);
const scopeKinds = new Set(["tenant", "workspace", "module", "company_code", "legal_entity", "operating_organization", "network_account", "network_relationship", "resource"]);

/** New publication admission, not a historical artifact rewrite. Every bound
 * operation must carry its reviewed, source-pinned IAM projection. */
export function assertOperationProjection(descriptor: Row): void {
  const operations = row(descriptor.operations);
  const bound = Object.entries(operations).filter(([, op]) => row(op).authorizationMode !== "permission_only" && row(op).permissionCode !== undefined);
  const bindings = rows(descriptor.operation_scope_bindings ?? []);
  if (!bound.length && !bindings.length) return;
  const source = row(descriptor.source);
  check(isId(source.entity_id) && typeof source.release_hash === "string" && hash.test(source.release_hash), "SOURCE_INVALID");
  const seen = new Set<string>(), scopeIds = new Set<unknown>();
  const operationIds = new Map<unknown, unknown>();
  const bindingIds = new Map<unknown, unknown>();
  for (const b of bindings) {
    const op = bound.find(([key]) => key === b.operationKey);
    check(op && b.entityCode === descriptor.entityCode && row(op[1]).permissionCode === b.permissionCode, "BINDING_MISMATCH");
    check([b.bindingId, b.scopeBindingId, b.sourceEntityOperationId, b.permissionId].every(isId), "IDENTITY_INVALID");
    check(b.permissionKind === "entity_operation" || b.permissionKind === "capability", "PERMISSION_KIND_INVALID");
    check(b.decisionMode === "collection" || b.decisionMode === "entity_resource", "DECISION_MODE_INVALID");
    check(scopeKinds.has(String(b.scopeKind)), "SCOPE_INVALID");
    check(!operationIds.has(b.sourceEntityOperationId) || operationIds.get(b.sourceEntityOperationId) === b.operationKey, "IDENTITY_AMBIGUOUS");
    operationIds.set(b.sourceEntityOperationId, b.operationKey);
    check(!bindingIds.has(b.bindingId) || bindingIds.get(b.bindingId) === b.operationKey, "IDENTITY_AMBIGUOUS");
    bindingIds.set(b.bindingId, b.operationKey);
    const key = `${b.operationKey}:${b.scopeKind}`;
    check(!seen.has(key) && !scopeIds.has(b.scopeBindingId), "SCOPE_AMBIGUOUS");
    seen.add(key); scopeIds.add(b.scopeBindingId);
    if (b.coordinateSource === "tenant_context") {
      check(b.scopeKind === "tenant" && b.coordinateKey == null && b.resolverKey == null, "COORDINATE_INVALID");
    } else if (b.coordinateSource === "relation_resolver") {
      check(typeof b.resolverKey === "string" && b.resolverKey.length > 0 && b.coordinateKey == null, "COORDINATE_INVALID");
    } else {
      check(["request_field", "record_field", "collection_field"].includes(String(b.coordinateSource)) &&
        typeof b.coordinateKey === "string" && b.coordinateKey.length > 0 && b.resolverKey == null, "COORDINATE_INVALID");
    }
  }
  for (const [key] of bound) {
    const matches = bindings.filter(b => b.operationKey === key);
    check(matches.length > 0, "BINDING_REQUIRED");
    check(new Set(matches.map(b => JSON.stringify([b.bindingId, b.sourceEntityOperationId, b.permissionId, b.permissionKind, b.decisionMode]))).size === 1, "BINDING_AMBIGUOUS");
  }
}

export interface OperationPermission {
  readonly id: string;
  readonly code: string;
  readonly kind: string;
  readonly scopeKinds: readonly string[];
}

/** Resolve IDs from the target catalog; never transplant source-plane permission
 * IDs. Source identity/hash must come from the approved authoring release. */
export function compileOperationProjection(input: {
  native: Row; descriptor: Row; plane: string; sourceEntityId: string; sourceReleaseHash: string;
  permissions: readonly OperationPermission[];
}) {
  const { native, descriptor, plane } = input;
  const active = (key: string) => rows(native[key] ?? []).filter(r => r.status !== "deprecated");
  const operations = active("operations");
  const links = active("operationPermissions").filter(b => b.targetPlane === plane);
  const scopes = active("operationScopeBindings").filter(b => b.targetPlane === plane);
  check([...links, ...scopes].every(b => operations.some(o => o.id === b.entityOperationId)), "ORPHAN_BINDING");
  const bindings = operations.flatMap(operation => {
    const linked = links.filter(b => b.entityOperationId === operation.id);
    check(linked.length <= 1, "PERMISSION_AMBIGUOUS");
    if (!linked.length) {
      const published = row(row(descriptor.operations)[String(operation.operationKey)]);
      check(published.permissionCode === undefined, "PERMISSION_REQUIRED");
      return [];
    }
    const link = linked[0]!;
    const catalog = input.permissions.filter(p => p.code === link.permissionCode && p.kind === link.permissionKind);
    check(catalog.length === 1, "CATALOG_REQUIRED");
    const permission = catalog[0]!;
    const required = scopes.filter(b => b.entityOperationId === operation.id);
    check(required.length > 0, "BINDING_REQUIRED");
    return required.map(scope => {
      check(scope.missingValueBehavior === "deny" && permission.scopeKinds.includes(String(scope.scopeKind)), "SCOPE_MISMATCH");
      return { bindingId: link.id, scopeBindingId: scope.id, sourceEntityOperationId: operation.id,
        entityCode: descriptor.entityCode, operationKey: operation.operationKey,
        permissionId: permission.id, permissionCode: permission.code, permissionKind: permission.kind,
        scopeKind: scope.scopeKind, decisionMode: scope.decisionMode, coordinateSource: scope.coordinateSource,
        coordinateKey: scope.coordinateKey ?? null, resolverKey: scope.resolverKey ?? null };
    });
  });
  const projection = { source: { entity_id: input.sourceEntityId, release_hash: input.sourceReleaseHash }, operation_scope_bindings: bindings };
  assertOperationProjection({ ...descriptor, ...projection });
  return projection;
}
