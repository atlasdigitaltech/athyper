export type EntityRenderer = "simple" | "master" | "document" | "ledger";

export type MutationBindingKind =
  | "generic"
  | "workspace"
  | "write_facade"
  | "handler"
  | "lifecycle"
  | "disabled";

export interface MutationBinding {
  enabled: boolean;
  kind: MutationBindingKind;
  permissionCode?: string;
  handler?: string;
  disabledReason?: string;
}

export interface CompiledFieldWriteDecision {
  name: string;
  columnName: string;
  dataType: string;
  origin: string | null;
  writable: { create: boolean; update: boolean };
  required: { create: boolean; update: boolean };
  computed: boolean;
  readOnly: boolean;
  systemManaged: boolean;
  systemOrigin: boolean;
  writeOnce: boolean;
  statusLimited: boolean;
  editableInStatuses: string[];
}

export interface CompiledWriteProjection {
  entityVersionId: string;
  fields: CompiledFieldWriteDecision[];
}

export interface CompiledLifecycleState {
  isEditable: boolean;
  isCommitted: boolean;
  isTerminal: boolean;
  isDeletable: boolean;
  isReversible: boolean;
}

export interface CompiledLifecycleSemantics {
  enabled: boolean;
  statusField: string;
  editableStatuses: string[];
  states: Record<string, CompiledLifecycleState>;
}

export interface CompiledCollectionBinding {
  name: string;
  targetEntity: string;
  ownership: "foreign_key" | "polymorphic" | "handler";
  foreignKey?: string;
  handler?: string;
  mutationOwner: "generic" | "workspace" | "handler" | "read_only";
  versionStrategy: "none" | "parent_version" | "row_version";
  allowedActions: {
    create: boolean;
    update: boolean;
    delete: boolean;
    replace: boolean;
  };
}

const DOCUMENT_WORKSPACE_AGGREGATE_HANDLER = "DocumentWorkspaceAggregateHandler";

export interface EntityCapabilityManifest {
  entityCode: string;
  renderer: EntityRenderer;
  mutation: {
    create: MutationBinding;
    update: MutationBinding;
    delete: MutationBinding;
    aggregate?: MutationBinding;
  };
  deletionMode:
    | "hard_delete"
    | "soft_delete"
    | "archive"
    | "retire"
    | "lifecycle_only"
    | "prohibited";
  deletionPolicy: {
    retentionDays?: number;
    legalHoldEligible: boolean;
    referenceCheck: boolean;
  };
  lifecycle?: CompiledLifecycleSemantics;
  collections: CompiledCollectionBinding[];
  handlers: {
    mutationHandler?: string;
    writeFacade?: string;
    lifecycleHandler?: string;
    attachmentProvider?: string;
  };
  write: CompiledWriteProjection;
}

export interface CapabilityHandlerManifest {
  mutationHandlers?: readonly string[];
  writeFacades?: readonly string[];
  lifecycleHandlers?: readonly string[];
  attachmentProviders?: readonly string[];
  collectionHandlers?: readonly string[];
}

export interface CapabilityFieldInput {
  name: string;
  column_name: string;
  data_type: string;
  origin: string | null;
  is_required: boolean;
  is_read_only: boolean;
  is_computed: boolean;
  is_write_once: boolean;
  editability: unknown;
}

export interface CapabilityOperationInput {
  permissionCode: string;
  enabled: boolean;
  permissionRegistered?: boolean;
}

export interface CapabilityLifecycleStateInput {
  code: string;
  isInitial: boolean;
  isTerminal: boolean;
  stateFlags: Record<string, unknown>;
}

export interface CompileCapabilityManifestInput {
  entityCode: string;
  entityVersionId: string;
  renderer: EntityRenderer;
  backingType: string;
  mutability: string;
  featureFlags: Record<string, unknown>;
  displayConfig: Record<string, unknown>;
  dataPolicy?: Record<string, unknown>;
  fields: CapabilityFieldInput[];
  relations: Array<Record<string, unknown>>;
  operations: CapabilityOperationInput[];
  hasDocumentRuntime: boolean;
  lifecycleStates?: CapabilityLifecycleStateInput[];
  handlerManifest?: CapabilityHandlerManifest;
}

const SYSTEM_COLUMNS = new Set([
  "id", "tenant_id", "created_at", "created_by", "updated_at", "updated_by",
  "deleted_at", "deleted_by", "is_active", "is_deleted", "row_version",
  "status_changed_at", "status_changed_by",
]);

const ACTION_TOKENS = {
  create: new Set(["create", "new", "insert", "add"]),
  update: new Set(["edit", "update", "write", "save", "patch"]),
  delete: new Set(["delete", "remove", "destroy"]),
} as const;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function bool(source: Record<string, unknown>, key: string): boolean {
  return source[key] === true;
}

function editableStatuses(value: unknown): string[] {
  const editability = record(value);
  const raw = editability["editable_in_status"]
    ?? editability["editableInStatus"]
    ?? editability["editable_in"]
    ?? editability["editableInStatuses"];
  return Array.isArray(raw)
    ? [...new Set(raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim().toLowerCase()))].sort()
    : [];
}

function hasStatusLimit(value: unknown): boolean {
  const editability = record(value);
  return ["editable_in_status", "editableInStatus", "editable_in", "editableInStatuses"]
    .some((key) => Object.prototype.hasOwnProperty.call(editability, key));
}

function storageColumn(columnName: string): string {
  const dot = columnName.indexOf(".");
  return dot > 0 ? columnName.slice(0, dot) : columnName;
}

function compileWriteProjection(
  versionId: string,
  fields: CapabilityFieldInput[],
): CompiledWriteProjection {
  return {
    entityVersionId: versionId,
    fields: fields.map((field) => {
      const editability = record(field.editability);
      const statuses = editableStatuses(field.editability);
      const statusLimited = hasStatusLimit(field.editability);
      const explicitlyLocked = editability["editable"] === false
        || editability["readonly"] === true
        || editability["read_only"] === true
        || editability["mode"] === "readonly"
        || editability["mode"] === "read_only";
      const systemManaged = SYSTEM_COLUMNS.has(storageColumn(field.column_name))
        || field.is_read_only
        || field.is_computed
        || (field.origin === "system" && field.name !== "status");
      const createWritable = !systemManaged && !explicitlyLocked;
      const updateWritable = createWritable && !field.is_write_once && (!statusLimited || statuses.length > 0);
      const draftWritable = !statusLimited || statuses.includes("draft");
      return {
        name: field.name,
        columnName: field.column_name,
        dataType: field.data_type,
        origin: field.origin,
        writable: { create: createWritable, update: updateWritable },
        required: { create: field.is_required && createWritable && draftWritable, update: false },
        computed: field.is_computed,
        readOnly: field.is_read_only || explicitlyLocked,
        systemManaged,
        systemOrigin: field.origin === "system",
        writeOnce: field.is_write_once,
        statusLimited,
        editableInStatuses: statuses,
      };
    }),
  };
}

function operationFor(
  operations: CapabilityOperationInput[],
  action: keyof typeof ACTION_TOKENS,
): CapabilityOperationInput | undefined {
  const matches = operations.filter((operation) => {
    const tokens = operation.permissionCode.toLowerCase().replace(/[^a-z0-9]+/g, "_").split("_");
    return tokens.some((token) => ACTION_TOKENS[action].has(token as never));
  });
  return matches.find((operation) => operation.enabled) ?? matches[0];
}

function registered(name: string, values: readonly string[] | undefined): boolean {
  return values?.includes(name) === true;
}

function named(source: Record<string, unknown>, key: string): string | undefined {
  return text(source[key]);
}

function compileLifecycleStates(
  input: CompileCapabilityManifestInput,
  editable: readonly string[],
  issues: string[],
): Record<string, CompiledLifecycleState> {
  const result: Record<string, CompiledLifecycleState> = {};
  for (const state of input.lifecycleStates ?? []) {
    const code = state.code.trim().toLowerCase();
    if (!code) continue;
    const flags = state.stateFlags;
    const isEditable = flags["is_editable"] === true || flags["is_mutable"] === true || editable.includes(code);
    const isCommitted = flags["is_committed"] === true
      || (input.renderer === "document" && !state.isInitial && !isEditable);
    const compiled = {
      isEditable,
      isCommitted,
      isTerminal: state.isTerminal || flags["is_terminal"] === true,
      isDeletable: flags["is_deletable"] === true
        || (state.isInitial && !isCommitted && !state.isTerminal),
      isReversible: flags["is_reversible"] === true,
    };
    if (typeof flags["is_terminal"] === "boolean" && flags["is_terminal"] !== state.isTerminal) {
      issues.push(`lifecycle state '${code}' terminal flag contradicts is_terminal`);
    }
    if (compiled.isCommitted && compiled.isEditable) {
      issues.push(`lifecycle state '${code}' cannot be both committed and editable`);
    }
    if (compiled.isTerminal && compiled.isEditable) {
      issues.push(`lifecycle state '${code}' cannot be both terminal and editable`);
    }
    if (compiled.isTerminal && compiled.isDeletable) {
      issues.push(`lifecycle state '${code}' cannot be both terminal and deletable`);
    }
    if (compiled.isReversible && !compiled.isCommitted) {
      issues.push(`lifecycle state '${code}' cannot be reversible without being committed`);
    }
    if ((input.renderer === "document" || input.renderer === "ledger")
      && compiled.isCommitted && compiled.isDeletable) {
      issues.push(`committed ${input.renderer} state '${code}' cannot be deletable`);
    }
    if (input.renderer === "ledger" && compiled.isDeletable) {
      issues.push(`ledger state '${code}' cannot be deletable`);
    }
    result[code] = compiled;
  }
  return result;
}

export class EntityCapabilityCompilationError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join("; "));
    this.name = "EntityCapabilityCompilationError";
  }
}

export function compileEntityCapabilityManifest(
  input: CompileCapabilityManifestInput,
): EntityCapabilityManifest {
  const issues: string[] = [];
  const handlers = {
    mutationHandler: named(input.featureFlags, "mutation_handler"),
    writeFacade: named(input.featureFlags, "write_facade"),
    lifecycleHandler: named(input.featureFlags, "lifecycle_handler"),
    attachmentProvider: named(input.featureFlags, "attachment_provider"),
  };
  const readOnly = input.renderer === "ledger"
    || bool(input.featureFlags, "is_readonly")
    || ["immutable", "locked"].includes(input.mutability.toLowerCase());
  const lifecycleEnabled = bool(input.featureFlags, "has_lifecycle")
    || Array.isArray(input.displayConfig["lifecycle_stages"]);
  const explicitDeletion = named(input.featureFlags, "deletion_mode");
  const hardDelete = bool(input.featureFlags, "generic_hard_delete_enabled")
    || bool(input.featureFlags, "hard_delete_enabled")
    || bool(input.featureFlags, "allow_hard_delete");
  const transient = input.mutability.toLowerCase() === "transient"
    || bool(input.featureFlags, "is_transient");
  const deletionMode = (explicitDeletion && [
    "hard_delete", "soft_delete", "archive", "retire", "lifecycle_only", "prohibited",
  ].includes(explicitDeletion) ? explicitDeletion : undefined)
    ?? (hardDelete ? "hard_delete"
      : input.renderer === "ledger" ? "prohibited"
      : input.renderer === "document" ? "lifecycle_only"
      : input.renderer === "master" ? "retire"
      : transient ? "hard_delete"
      : "soft_delete");
  if (explicitDeletion && ![
    "hard_delete", "soft_delete", "archive", "retire", "lifecycle_only", "prohibited",
  ].includes(explicitDeletion)) {
    issues.push(`unknown deletion mode '${explicitDeletion}'`);
  }

  if (input.renderer === "document" && !input.hasDocumentRuntime) {
    issues.push("document renderer requires a compiled document runtime");
  }
  if (input.renderer === "ledger" && (hardDelete || handlers.writeFacade || handlers.mutationHandler)) {
    issues.push("ledger renderer cannot expose generic mutation or write handlers");
  }
  if (input.renderer === "ledger" && deletionMode !== "prohibited") {
    issues.push("ledger renderer requires prohibited deletion mode");
  }
  if (input.renderer === "document" && deletionMode === "hard_delete") {
    issues.push("document renderer cannot expose hard delete; use lifecycle cancellation or soft delete");
  }
  if (input.renderer === "ledger" && input.operations.some((operation) => operation.enabled
    && (["create", "update", "delete"] as const).some((action) => operationFor([operation], action) !== undefined))) {
    issues.push("ledger renderer cannot expose enabled generic mutation operations");
  }
  if (deletionMode !== "hard_delete" && hardDelete) {
    issues.push(`${deletionMode.replaceAll("_", "-")} entity cannot expose hard delete`);
  }
  const storageColumns = new Set(input.fields.map((field) => storageColumn(field.column_name)));
  if (deletionMode === "soft_delete"
    && !["is_deleted", "deleted_at", "is_active"].some((column) => storageColumns.has(column))) {
    issues.push("soft-delete entity requires is_deleted, deleted_at, or is_active storage");
  }
  if (deletionMode === "archive"
    && !["archived_at", "status", "is_active"].some((column) => storageColumns.has(column))) {
    issues.push("archive entity requires archived_at, status, or is_active storage");
  }
  if (deletionMode === "retire"
    && !["retired_at", "status", "is_active"].some((column) => storageColumns.has(column))) {
    issues.push("retire entity requires retired_at, status, or is_active storage");
  }
  if (input.operations.some((operation) => operation.enabled && !operation.permissionCode.trim())) {
    issues.push("enabled operation has no permission");
  }
  for (const operation of input.operations) {
    if (operation.enabled && operation.permissionRegistered === false) {
      issues.push(`enabled operation references unknown permission '${operation.permissionCode}'`);
    }
  }
  if (input.handlerManifest && handlers.writeFacade && !registered(handlers.writeFacade, input.handlerManifest.writeFacades)) {
    issues.push(`write facade '${handlers.writeFacade}' is not registered`);
  }
  if (input.handlerManifest && handlers.mutationHandler && !registered(handlers.mutationHandler, input.handlerManifest.mutationHandlers)) {
    issues.push(`mutation handler '${handlers.mutationHandler}' is not registered`);
  }
  if (input.handlerManifest && handlers.lifecycleHandler && !registered(handlers.lifecycleHandler, input.handlerManifest.lifecycleHandlers)) {
    issues.push(`lifecycle handler '${handlers.lifecycleHandler}' is not registered`);
  }
  if (input.handlerManifest && handlers.attachmentProvider && !registered(handlers.attachmentProvider, input.handlerManifest.attachmentProviders)) {
    issues.push(`attachment provider '${handlers.attachmentProvider}' is not registered`);
  }
  if (input.renderer === "document" && input.handlerManifest
    && !registered(handlers.mutationHandler ?? DOCUMENT_WORKSPACE_AGGREGATE_HANDLER, input.handlerManifest.mutationHandlers)) {
    issues.push(`aggregate handler '${handlers.mutationHandler ?? DOCUMENT_WORKSPACE_AGGREGATE_HANDLER}' is not registered`);
  }

  const collections: CompiledCollectionBinding[] = [];
  for (const relation of input.relations) {
    const kind = text(relation["relation_kind"]);
    if (kind !== "has_many" && kind !== "m2m") continue;
    const ui = record(relation["ui_behavior"]);
    const runtimeRole = text(relation["runtime_role"]);
    const mutationOwner = text(ui["mutation_owner"]);
    const declaredCollection = runtimeRole === "line_items"
      || runtimeRole === "child_collection"
      || mutationOwner !== undefined;
    if (!declaredCollection) continue;
    const fk = text(relation["fk_field"]);
    const polymorphic = text(relation["source_id_field"]) && text(relation["source_type_field"]);
    const handler = text(ui["mutation_handler"]);
    const mutationPolicy = record(ui["mutation_policy"]);
    const versionStrategyValue = text(ui["version_strategy"]);
    const versionStrategy = versionStrategyValue === "none" || versionStrategyValue === "row_version"
      ? versionStrategyValue
      : "parent_version";
    if (!fk && !polymorphic && !handler) {
      issues.push(`child collection '${text(relation["name"]) ?? "unknown"}' has no ownership/FK strategy`);
      continue;
    }
    if (input.handlerManifest && handler && !registered(handler, input.handlerManifest.collectionHandlers)) {
      issues.push(`collection handler '${handler}' is not registered`);
    }
    collections.push({
      name: text(relation["name"]) ?? "collection",
      targetEntity: text(relation["target_entity"]) ?? "unknown",
      ownership: fk ? "foreign_key" : polymorphic ? "polymorphic" : "handler",
      ...(fk ? { foreignKey: fk } : {}),
      ...(handler ? { handler } : {}),
      mutationOwner: mutationOwner === "workspace" || mutationOwner === "handler" || mutationOwner === "read_only"
        ? mutationOwner
        : "generic",
      versionStrategy,
      allowedActions: {
        create: mutationOwner !== "read_only" && mutationPolicy["create"] !== false,
        update: mutationOwner !== "read_only" && mutationPolicy["update"] !== false,
        delete: mutationOwner !== "read_only" && mutationPolicy["delete"] !== false,
        replace: mutationOwner !== "read_only" && mutationPolicy["replace"] === true,
      },
    });
  }

  const binding = (action: "create" | "update" | "delete"): MutationBinding => {
    const operation = operationFor(input.operations, action);
    const enabled = operation?.enabled === true && !readOnly
      && !(action === "delete" && deletionMode === "prohibited");
    if (operation?.enabled && !operation.permissionCode.trim()) {
      issues.push(`enabled ${action} operation has no permission`);
    }
    const kind: MutationBindingKind = !enabled
      ? "disabled"
      : handlers.writeFacade && action === "create"
        ? "write_facade"
        : handlers.mutationHandler
          ? "handler"
        : action === "delete" && deletionMode === "lifecycle_only"
          ? "lifecycle"
        : input.renderer === "document" && action !== "delete"
            ? "workspace"
            : "generic";
    return {
      enabled,
      kind,
      ...(operation?.permissionCode ? { permissionCode: operation.permissionCode } : {}),
      ...(kind === "write_facade" ? { handler: handlers.writeFacade } : {}),
      ...(kind === "handler" ? { handler: handlers.mutationHandler } : {}),
      ...(!enabled ? { disabledReason: readOnly ? "entity_read_only" : operation ? "operation_disabled" : "operation_missing" } : {}),
    };
  };

  const lifecycleEditableStatuses = record(input.displayConfig["document_header"])["editable_statuses"] instanceof Array
    ? (record(input.displayConfig["document_header"])["editable_statuses"] as unknown[])
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.toLowerCase())
    : [];
  const lifecycleStates = compileLifecycleStates(input, lifecycleEditableStatuses, issues);
  const retentionDaysValue = Number(input.dataPolicy?.["retention_days"]);
  const manifest: EntityCapabilityManifest = {
    entityCode: input.entityCode,
    renderer: input.renderer,
    mutation: {
      create: binding("create"),
      update: binding("update"),
      delete: binding("delete"),
      ...(input.renderer === "document" ? {
        aggregate: {
          enabled: true,
          kind: "workspace" as const,
          handler: handlers.mutationHandler ?? DOCUMENT_WORKSPACE_AGGREGATE_HANDLER,
        },
      } : {}),
    },
    deletionMode: deletionMode as EntityCapabilityManifest["deletionMode"],
    deletionPolicy: {
      ...(Number.isInteger(retentionDaysValue) && retentionDaysValue > 0 ? { retentionDays: retentionDaysValue } : {}),
      legalHoldEligible: input.dataPolicy?.["legal_hold_eligible"] === true,
      referenceCheck: input.dataPolicy?.["reference_check"] !== false,
    },
    ...(lifecycleEnabled ? {
      lifecycle: {
        enabled: true,
        statusField: text(Array.isArray(input.displayConfig["status_field_names"])
          ? input.displayConfig["status_field_names"][0]
          : undefined) ?? "status",
        editableStatuses: lifecycleEditableStatuses,
        states: lifecycleStates,
      },
    } : {}),
    collections,
    handlers: Object.fromEntries(Object.entries(handlers).filter(([, value]) => value !== undefined)),
    write: compileWriteProjection(input.entityVersionId, input.fields),
  };

  if (issues.length > 0) throw new EntityCapabilityCompilationError(issues);
  return manifest;
}
