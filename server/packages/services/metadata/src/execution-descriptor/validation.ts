import { SerializedExecutionDescriptorV1Schema, type SerializedExecutionDescriptorV1 } from "./contract.js";

export type ExecutionDescriptorDiagnosticSeverity = "error" | "degradation";
export interface ExecutionDescriptorDiagnostic {
  severity: ExecutionDescriptorDiagnosticSeverity;
  code: string;
  path: string;
  message: string;
}

export interface ExecutionHandlerRegistry {
  mutationHandlers?: readonly string[];
  writeFacades?: readonly string[];
  lifecycleHandlers?: readonly string[];
  attachmentProviders?: readonly string[];
  collectionHandlers?: readonly string[];
  domainHooks?: readonly string[];
}

export class ExecutionDescriptorActivationError extends Error {
  constructor(readonly entityCode: string, readonly diagnostics: readonly ExecutionDescriptorDiagnostic[]) {
    super(diagnostics.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
    this.name = "ExecutionDescriptorActivationError";
  }
}

const PROHIBITED_SHARED_KEYS = new Set([
  "principalId", "principal_id", "accountGrantId", "account_grant_id",
  "profileHash", "profile_hash", "authEpoch", "auth_epoch", "permissionDecision", "permission_decision",
  "allowedPermissions", "deniedPermissions",
]);

export function validateSerializedExecutionDescriptor(
  descriptor: unknown,
  registry: ExecutionHandlerRegistry = {},
  optionalReferences: ReadonlySet<string> = new Set(),
): ExecutionDescriptorDiagnostic[] {
  const diagnostics: ExecutionDescriptorDiagnostic[] = [];
  const parsed = SerializedExecutionDescriptorV1Schema.safeParse(descriptor);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      diagnostics.push({
        severity: "error",
        code: "EXEC_DESCRIPTOR_SCHEMA_INVALID",
        path: issue.path.map(String).join(".") || "$",
        message: issue.message,
      });
    }
    return diagnostics;
  }
  const value = parsed.data;
  const fields = new Map(value.fields.map((field) => [field.name, field]));
  const columns = new Set(value.fields.map((field) => field.column));

  required(fields.size === value.fields.length, "EXEC_DUPLICATE_FIELD_NAME", "fields",
    "compiled field names must be unique");
  if (value.storage.backingType === "table") {
    required(columns.size === value.fields.length, "EXEC_DUPLICATE_FIELD_COLUMN", "fields",
      "compiled physical field columns must be unique for table-backed entities");
  } else {
    for (const field of value.fields) {
      const duplicate = value.fields.filter((candidate) => candidate.column === field.column);
      if (duplicate.length > 1) {
        required(Boolean(field.projectionAliasOf), "EXEC_VIEW_ALIAS_REQUIRED", `fields.${field.name}.projectionAliasOf`,
          `view/projection field '${field.name}' shares physical column '${field.column}' and requires an explicit alias`);
        if (field.projectionAliasOf) {
          const target = fields.get(field.projectionAliasOf);
          required(Boolean(target), "EXEC_VIEW_ALIAS_TARGET_MISSING", `fields.${field.name}.projectionAliasOf`,
            `projection alias target '${field.projectionAliasOf}' is not compiled`);
          required(Boolean(target && target.column === field.column), "EXEC_VIEW_ALIAS_TARGET_MISMATCH", `fields.${field.name}.projectionAliasOf`,
            `projection alias target '${field.projectionAliasOf}' must use the same physical column`);
        }
      }
    }
  }

  required(value.storage.readCapability !== undefined, "EXEC_READ_CAPABILITY_MISSING", "storage.readCapability",
    "runtime descriptors require an explicit read capability");
  required(value.storage.writeCapability !== undefined, "EXEC_WRITE_CAPABILITY_MISSING", "storage.writeCapability",
    "runtime descriptors require an explicit write capability");

  required(columns.has(value.storage.primaryKey), "EXEC_PRIMARY_KEY_MISSING", "storage.primaryKey",
    `primary key column '${value.storage.primaryKey}' is not present in the compiled field map`);
  if (value.storage.tenantColumn !== null) {
    required(columns.has(value.storage.tenantColumn), "EXEC_TENANT_COLUMN_MISSING", "storage.tenantColumn",
      `tenant column '${value.storage.tenantColumn}' is not present in the compiled field map`);
  }
  if (value.storage.rowVersionColumn) {
    required(columns.has(value.storage.rowVersionColumn), "EXEC_ROW_VERSION_MISSING", "storage.rowVersionColumn",
      `row-version column '${value.storage.rowVersionColumn}' is not present in the compiled field map`);
  }
  required(value.read.stableTieBreaker === value.storage.primaryKey, "EXEC_UNSTABLE_PAGINATION", "read.stableTieBreaker",
    "stable pagination tie-breaker must be the physical primary key");
  required(value.read.defaultSort.at(-1)?.field === value.read.stableTieBreaker, "EXEC_UNSTABLE_PAGINATION", "read.defaultSort",
    `default sort must end with '${value.read.stableTieBreaker}'`);
  for (const sort of value.read.defaultSort) {
    required(fields.has(sort.field), "EXEC_SORT_FIELD_MISSING", "read.defaultSort", `sort field '${sort.field}' is not compiled`);
  }
  if (value.write.concurrency.strategy !== "none") {
    required(Boolean(value.write.concurrency.rowVersionField), "EXEC_CONCURRENCY_VERSION_MISSING", "write.concurrency",
      `${value.write.concurrency.strategy} requires a row-version field`);
  }
  const mutations = Object.values(value.write.mutations).filter((binding): binding is NonNullable<typeof binding> => Boolean(binding));
  const enabledMutations = mutations.filter((binding) => binding.enabled);
  if (value.storage.writeCapability === "none") {
    required(enabledMutations.length === 0, "EXEC_READ_ONLY_WRITE_FORBIDDEN", "write.mutations",
      "read-only runtime capability cannot expose enabled mutations");
  }
  if (value.storage.writeCapability === "facade") {
    required(Boolean(value.handlers.writeFacade), "EXEC_WRITE_FACADE_REQUIRED", "handlers.writeFacade",
      "facade write capability requires a registered write facade");
    required(enabledMutations.every((binding) => binding.kind !== "generic"), "EXEC_FACADE_GENERIC_WRITE_FORBIDDEN", "write.mutations",
      "facade write capability cannot expose generic mutations");
  }
  if (value.storage.writeCapability === "append_only") {
    required(value.write.mutations.create.enabled, "EXEC_APPEND_ONLY_CREATE_REQUIRED", "write.mutations.create",
      "append-only runtime capability requires create");
    required(!value.write.mutations.update.enabled && !value.write.mutations.delete.enabled,
      "EXEC_APPEND_ONLY_MUTATION_FORBIDDEN", "write.mutations", "append-only runtime capability forbids update and delete");
  }
  if (value.storage.backingType !== "table") {
    required(value.storage.writeCapability === "none" || value.storage.writeCapability === "facade",
      "EXEC_VIEW_WRITE_MODE_INVALID", "storage.writeCapability", "view/projection writes must be none or facade");
  }
  if (value.write.mutations.delete.kind === "lifecycle") {
    required(Boolean(value.lifecycle), "EXEC_LIFECYCLE_REQUIRED", "lifecycle", "lifecycle deletion requires a lifecycle plan");
  }
  if (value.lifecycle) {
    required(fields.has(value.lifecycle.statusField), "EXEC_LIFECYCLE_STATUS_FIELD_MISSING", "lifecycle.statusField",
      `lifecycle status field '${value.lifecycle.statusField}' is not compiled`);
  }

  checkReference("mutationHandler", value.handlers.mutationHandler, registry.mutationHandlers);
  checkReference("writeFacade", value.handlers.writeFacade, registry.writeFacades);
  checkReference("lifecycleHandler", value.handlers.lifecycleHandler, registry.lifecycleHandlers);
  checkReference("attachmentProvider", value.handlers.attachmentProvider, registry.attachmentProviders);
  for (const handler of value.handlers.collectionHandlers) checkReference(`collectionHandlers.${handler}`, handler, registry.collectionHandlers);
  for (const hook of value.handlers.domainHooks) checkReference(`domainHooks.${hook}`, hook, registry.domainHooks);
  for (const relation of value.relations) {
    if (relation.ownership === "foreign_key") {
      required(Boolean(relation.foreignKey), "EXEC_RELATION_FK_REQUIRED", `relations.${relation.name}.foreignKey`,
        "foreign-key ownership requires a physical foreign key");
    }
    if (relation.ownership === "handler") {
      required(Boolean(relation.handler), "EXEC_RELATION_HANDLER_REQUIRED", `relations.${relation.name}.handler`,
        "handler ownership requires a collection handler");
    }
  }
  scanProhibitedKeys(value, "$", diagnostics);
  return diagnostics;

  function required(condition: boolean, code: string, path: string, message: string): void {
    if (!condition) diagnostics.push({ severity: "error", code, path, message });
  }

  function checkReference(path: string, name: string | undefined, registered: readonly string[] | undefined): void {
    if (!name || registered?.includes(name)) return;
    const optional = optionalReferences.has(name) || optionalReferences.has(path);
    diagnostics.push({
      severity: optional ? "degradation" : "error",
      code: optional ? "EXEC_OPTIONAL_REFERENCE_MISSING" : "EXEC_REQUIRED_REFERENCE_MISSING",
      path: `handlers.${path}`,
      message: `${optional ? "optional" : "required"} execution reference '${name}' is not registered`,
    });
  }
}

export function assertExecutionDescriptorActivatable(
  descriptor: unknown,
  entityCode: string,
  registry: ExecutionHandlerRegistry = {},
  optionalReferences: ReadonlySet<string> = new Set(),
): ExecutionDescriptorDiagnostic[] {
  const diagnostics = validateSerializedExecutionDescriptor(descriptor, registry, optionalReferences);
  const errors = diagnostics.filter((issue) => issue.severity === "error");
  if (errors.length > 0) throw new ExecutionDescriptorActivationError(entityCode, errors);
  return diagnostics;
}

function scanProhibitedKeys(value: unknown, path: string, diagnostics: ExecutionDescriptorDiagnostic[]): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanProhibitedKeys(item, `${path}[${index}]`, diagnostics));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (PROHIBITED_SHARED_KEYS.has(key)) {
      diagnostics.push({
        severity: "error",
        code: "EXEC_PRINCIPAL_DATA_FORBIDDEN",
        path: `${path}.${key}`,
        message: `principal-specific key '${key}' cannot be serialized into a shared execution descriptor`,
      });
    }
    scanProhibitedKeys(child, `${path}.${key}`, diagnostics);
  }
}

export function degradationsForPolicy(diagnostics: readonly ExecutionDescriptorDiagnostic[]) {
  return diagnostics.filter((issue) => issue.severity === "degradation").map(({ code, path, message }) => ({ code, path, message }));
}
