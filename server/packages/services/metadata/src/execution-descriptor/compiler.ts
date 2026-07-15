import { createHash } from "node:crypto";

import type { CompiledEntity } from "../entity-compiler.service.js";
import {
  hydrateExecutionDescriptor,
  serializeExecutionDescriptor,
  type CompiledExecutionField,
  type CompiledRelationPlan,
  type ExecutionDescriptorV1,
  type SerializedExecutionDescriptorV1,
} from "./contract.js";
import {
  assertExecutionDescriptorActivatable,
  degradationsForPolicy,
  type ExecutionDescriptorDiagnostic,
  type ExecutionHandlerRegistry,
} from "./validation.js";

export interface EffectiveTenantExecutionOverlay {
  readonly tenantId: string;
  readonly compiledHash: string;
  readonly policy?: {
    accessMode?: string;
    companyScopeMode?: string;
    auditMode?: string;
    dataPolicy?: Record<string, unknown>;
  };
  readonly defaultSort?: ReadonlyArray<{ field: string; direction: "asc" | "desc"; nulls?: "first" | "last" }>;
  readonly fieldOverrides?: Readonly<Record<string, {
    searchable?: boolean; filterable?: boolean; sortable?: boolean;
    createWritable?: boolean; updateWritable?: boolean; defaultValue?: unknown;
  }>>;
  readonly optionalExecutionReferences?: readonly string[];
}

export interface CompileExecutionDescriptorInput {
  readonly compiledEntity: ExecutionCompiledEntitySource;
  readonly tenantOverlay?: EffectiveTenantExecutionOverlay;
  readonly handlerRegistry?: ExecutionHandlerRegistry;
}

export type ExecutionCompiledEntitySource = Omit<
  CompiledEntity,
  "execution_descriptor" | "execution_diagnostics"
>;

export interface CompileExecutionDescriptorResult {
  readonly descriptor: ExecutionDescriptorV1;
  readonly serialized: SerializedExecutionDescriptorV1;
  readonly diagnostics: readonly ExecutionDescriptorDiagnostic[];
}

export function compileExecutionDescriptor(input: CompileExecutionDescriptorInput): CompileExecutionDescriptorResult {
  const entity = input.compiledEntity;
  const capability = entity.capability_manifest;
  const overlay = input.tenantOverlay;
  const writeByName = new Map(capability.write.fields.map((field) => [field.name, field]));
  const fields: CompiledExecutionField[] = entity.fields.map((field) => {
    const write = writeByName.get(field.name);
    const override = overlay?.fieldOverrides?.[field.name];
    return {
      name: field.name,
      column: field.column_name,
      ...(field.projection_alias_of ? { projectionAliasOf: field.projection_alias_of } : {}),
      dataType: field.data_type,
      coercion: fieldCoercion(field),
      required: field.is_required,
      searchable: override?.searchable ?? field.is_searchable,
      filterable: override?.filterable ?? field.is_filterable,
      sortable: override?.sortable ?? field.is_sortable,
      computed: write?.computed ?? field.is_computed,
      readOnly: write?.readOnly ?? field.is_readonly,
      writeOnce: write?.writeOnce ?? field.is_write_once,
      systemManaged: write?.systemManaged ?? (field.is_readonly || field.is_computed),
      createWritable: override?.createWritable ?? write?.writable.create ?? false,
      updateWritable: override?.updateWritable ?? write?.writable.update ?? false,
      createRequired: write?.required.create ?? false,
      editableInStatuses: [...(write?.editableInStatuses ?? [])].sort(),
      ...((override && Object.prototype.hasOwnProperty.call(override, "defaultValue"))
        ? { defaultValue: override.defaultValue }
        : field.default_value !== undefined ? { defaultValue: field.default_value } : {}),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const primaryKey = text(entity.identity_config["primary_key"]);
  if (!primaryKey) {
    throw new Error(`Runtime entity '${entity.entity_code}' is missing an explicit primary_key contract.`);
  }
  const tenantColumn = text(entity.identity_config["tenant_column"]) ?? null;
  const readCapability = normalizeReadCapability(entity.read_capability);
  const writeCapability = normalizeWriteCapability(entity.write_capability);
  const concurrency = compileConcurrency(entity);
  const naturalKeyFields = strings(entity.identity_config["natural_key_fields"]);
  const defaultSort = compileDefaultSort(entity, overlay, fields, primaryKey);
  const collections = new Map(capability.collections.map((collection) => [collection.name, collection]));
  const relations = entity.relations.map((relation): CompiledRelationPlan => {
    const name = text(relation["name"]) ?? "relation";
    const collection = collections.get(name);
    const handler = collection?.handler ?? text(record(relation["ui_behavior"])["mutation_handler"]);
    const foreignKey = collection?.foreignKey ?? text(relation["fk_field"]);
    const sourceTypeField = text(relation["source_type_field"]);
    const sourceIdField = text(relation["source_id_field"]);
    const ownership = collection?.ownership
      ?? (foreignKey ? "foreign_key" : sourceTypeField && sourceIdField ? "polymorphic" : handler ? "handler" : "read_only");
    return {
      name,
      targetEntity: text(relation["target_entity"]) ?? "unknown",
      kind: text(relation["relation_kind"]) ?? "reference",
      ownership,
      ...(foreignKey ? { foreignKey: storageColumn(foreignKey) } : {}),
      ...(text(relation["target_key"]) ? { targetKey: storageColumn(text(relation["target_key"])!) } : {}),
      ...(sourceTypeField ? { sourceTypeField: storageColumn(sourceTypeField) } : {}),
      ...(sourceIdField ? { sourceIdField: storageColumn(sourceIdField) } : {}),
      ...(handler ? { handler } : {}),
      mutationOwner: collection?.mutationOwner ?? "read_only",
      versionStrategy: collection?.versionStrategy ?? "none",
      allowedActions: collection?.allowedActions
        ?? { create: false, update: false, delete: false, replace: false },
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const collectionHandlers = [...new Set(relations.flatMap((relation) => relation.handler ? [relation.handler] : []))].sort();
  const domainHooks = strings(entity.feature_flags["domain_hooks"] ?? entity.feature_flags["domain_hook"]).sort();
  const mutationHandler = capability.handlers.mutationHandler
    ?? capability.mutation.aggregate?.handler
    ?? Object.values(capability.mutation).find((binding) => binding?.kind === "handler")?.handler;
  const writeFacade = capability.handlers.writeFacade
    ?? Object.values(capability.mutation).find((binding) => binding?.kind === "write_facade")?.handler;
  const optionalReferences = new Set([
    ...strings(entity.feature_flags["optional_execution_references"]),
    ...(overlay?.optionalExecutionReferences ?? []),
  ]);
  const unsigned: SerializedExecutionDescriptorV1 = {
    schemaVersion: 1,
    identity: {
      entityCode: entity.entity_code,
      entityVersionId: entity.version_id,
      versionHash: entity.version_hash,
      compiledHash: "0".repeat(64),
      entityClass: entity.entity_class,
    },
    storage: {
      schema: entity.table_schema,
      table: entity.table_name,
      primaryKey,
      tenantColumn,
      readCapability,
      writeCapability,
      ...(concurrency.rowVersionField ? { rowVersionColumn: storageColumn(concurrency.rowVersionField) } : {}),
      backingType: normalizeBackingType(entity.backing_type),
    },
    fields,
    read: {
      projection: fields.map((field) => field.name),
      searchableFields: fields.filter((field) => field.searchable).map((field) => field.name),
      filterableFields: fields.filter((field) => field.filterable).map((field) => field.name),
      defaultSort,
      stableTieBreaker: primaryKey,
      naturalKeyFields,
    },
    write: {
      create: {
        mode: normalizeCreateMode(entity.create_mode),
        idempotencyRequired: entity.create_mode === "DIRECT_CREATE" || capability.renderer === "document",
        numberingStrategy: entity.numbering_strategy ?? "none",
      },
      mutations: capability.mutation,
      arrayFields: fields.filter((field) => field.coercion === "array").map((field) => field.name),
      jsonFields: fields.filter((field) => field.coercion === "json").map((field) => field.name),
      concurrency,
      deletionMode: capability.deletionMode,
    },
    relations,
    ...(capability.lifecycle ? {
      lifecycle: {
        statusField: capability.lifecycle.statusField,
        editableStatuses: [...capability.lifecycle.editableStatuses].sort(),
        states: sortRecord(capability.lifecycle.states),
        ...(capability.handlers.lifecycleHandler ? { commandHandler: capability.handlers.lifecycleHandler } : {}),
      },
    } : {}),
    policy: {
      governanceLevel: entity.governance_level,
      securityTier: entity.security_tier,
      mutability: entity.mutability,
      ...(text(overlay?.policy?.accessMode) ? { accessMode: text(overlay?.policy?.accessMode)! } : {}),
      ...(text(overlay?.policy?.companyScopeMode) ? { companyScopeMode: text(overlay?.policy?.companyScopeMode)! } : {}),
      ...(text(overlay?.policy?.auditMode) ? { auditMode: text(overlay?.policy?.auditMode)! } : {}),
      dataPolicy: { ...entity.data_policy, ...(overlay?.policy?.dataPolicy ?? {}) },
      ...(overlay ? { tenantOverlayHash: overlay.compiledHash } : {}),
      degradedFeatures: [],
    },
    handlers: {
      ...capability.handlers,
      ...(mutationHandler ? { mutationHandler } : {}),
      ...(writeFacade ? { writeFacade } : {}),
      collectionHandlers,
      domainHooks,
    },
  };

  let diagnostics = assertExecutionDescriptorActivatable(unsigned, entity.entity_code, input.handlerRegistry, optionalReferences);
  unsigned.policy.degradedFeatures = degradationsForPolicy(diagnostics);
  unsigned.identity.compiledHash = executionDescriptorHash(unsigned);
  diagnostics = assertExecutionDescriptorActivatable(unsigned, entity.entity_code, input.handlerRegistry, optionalReferences);
  const serialized = structuredClone(unsigned);
  const descriptor = hydrateExecutionDescriptor(serialized);
  return { descriptor, serialized: serializeExecutionDescriptor(descriptor), diagnostics };
}

export function executionDescriptorHash(descriptor: SerializedExecutionDescriptorV1): string {
  const material = structuredClone(descriptor);
  material.identity.compiledHash = "0".repeat(64);
  return createHash("sha256").update(canonicalJson(material)).digest("hex");
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function compileDefaultSort(
  entity: ExecutionCompiledEntitySource,
  overlay: EffectiveTenantExecutionOverlay | undefined,
  fields: readonly CompiledExecutionField[],
  primaryKey: string,
): SerializedExecutionDescriptorV1["read"]["defaultSort"] {
  const names = new Set(fields.map((field) => field.name));
  const configured = overlay?.defaultSort
    ?? (text(entity.display_config["default_sort_field"])
      ? [{
          field: text(entity.display_config["default_sort_field"])!,
          direction: entity.display_config["default_sort_order"] === "asc" ? "asc" as const : "desc" as const,
          nulls: "last" as const,
        }]
      : []);
  const result = configured.filter((sort) => names.has(sort.field)).map((sort) => ({
    field: sort.field, direction: sort.direction, nulls: sort.nulls ?? "last" as const,
  }));
  if (result.length === 0) {
    const fallback = fields.find((field) => field.name === "created_at")
      ?? fields.find((field) => strings(entity.identity_config["natural_key_fields"]).includes(field.name));
    if (fallback && fallback.name !== primaryKey) result.push({ field: fallback.name, direction: "desc", nulls: "last" });
  }
  if (!names.has(primaryKey)) {
    // Validation owns the actionable activation error; retain the requested
    // physical key so the diagnostic points to the missing binding.
    result.push({ field: primaryKey, direction: "asc", nulls: "last" });
  } else if (result.at(-1)?.field !== primaryKey) {
    result.push({ field: primaryKey, direction: "asc", nulls: "last" });
  }
  return result;
}

function compileConcurrency(entity: ExecutionCompiledEntitySource): SerializedExecutionDescriptorV1["write"]["concurrency"] {
  const policy = record(entity.concurrency_policy);
  const rawStrategy = text(policy["strategy"]);
  const rowVersion = text(policy["row_version_field"] ?? policy["rowVersionField"])
    ?? (entity.fields.some((field) => storageColumn(field.column_name) === "row_version") ? "row_version" : undefined);
  const strategy = rawStrategy === "lease_plus_version" ? "lease_plus_version"
    : rawStrategy === "version" || rowVersion ? "version" : "none";
  const rawRollout = text(policy["rollout"]);
  const rollout = rawRollout === "enforced" || rawRollout === "optional" ? rawRollout : "observe";
  return {
    strategy,
    rollout,
    ...(strategy !== "none" && rowVersion ? { rowVersionField: rowVersion } : {}),
    lockRequired: strategy === "lease_plus_version" && rollout === "enforced",
  };
}

function fieldCoercion(field: ExecutionCompiledEntitySource["fields"][number]): "scalar" | "array" | "json" {
  if (field.cardinality !== "one" || field.data_type.endsWith("[]") || field.data_type === "array") return "array";
  if (["json", "jsonb", "object"].includes(field.data_type) || field.json_config) return "json";
  return "scalar";
}

function storageColumn(value: string): string { return value.includes(".") ? value.slice(0, value.indexOf(".")) : value; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function normalizeReadCapability(value: string): "generic" | "facade" | "projection" {
  if (value === "generic" || value === "facade" || value === "projection") return value;
  throw new Error(`Runtime entity has invalid read capability '${value}'.`);
}
function normalizeWriteCapability(value: string): "none" | "generic" | "facade" | "append_only" {
  if (value === "none" || value === "generic" || value === "facade" || value === "append_only") return value;
  throw new Error(`Runtime entity has invalid write capability '${value}'.`);
}
function strings(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()))].sort() : [];
}
function sortRecord<T>(value: Record<string, T>): Record<string, T> { return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))); }
function normalizeBackingType(value: string): "table" | "view" | "materialized_view" {
  if (value === "table" || value === "view" || value === "materialized_view") return value;
  throw new Error(`Runtime entity has invalid backing type '${value}'.`);
}
function normalizeCreateMode(value: string | undefined): SerializedExecutionDescriptorV1["write"]["create"]["mode"] {
  return value === "EARLY_DRAFT" || value === "DIRECT_CREATE" || value === "SOURCE_DOCUMENT_CREATE" ? value : "FORM_ONLY";
}
