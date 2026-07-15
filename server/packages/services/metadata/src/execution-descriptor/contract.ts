import { z } from "zod";

const IdentifierSchema = z.string().regex(/^[a-z_][a-z0-9_]*$/, "invalid physical identifier");
const PhysicalPathSchema = z.string().regex(/^[a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)*$/, "invalid physical field path");
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/i, "expected SHA-256 hex digest");
const JsonRecordSchema = z.record(z.string(), z.unknown());

const MutationBindingSchema = z.object({
  enabled: z.boolean(),
  kind: z.enum(["generic", "workspace", "write_facade", "handler", "lifecycle", "disabled"]),
  permissionCode: z.string().min(1).optional(),
  handler: z.string().min(1).optional(),
  disabledReason: z.string().min(1).optional(),
}).strict();

export const SerializedExecutionFieldSchema = z.object({
  name: z.string().min(1),
  column: PhysicalPathSchema,
  projectionAliasOf: IdentifierSchema.optional(),
  dataType: z.string().min(1),
  coercion: z.enum(["scalar", "array", "json"]),
  required: z.boolean(),
  searchable: z.boolean(),
  filterable: z.boolean(),
  sortable: z.boolean(),
  computed: z.boolean(),
  readOnly: z.boolean(),
  writeOnce: z.boolean(),
  systemManaged: z.boolean(),
  createWritable: z.boolean(),
  updateWritable: z.boolean(),
  createRequired: z.boolean(),
  editableInStatuses: z.array(z.string()),
  defaultValue: z.unknown().optional(),
}).strict();

export const SerializedRelationPlanSchema = z.object({
  name: z.string().min(1),
  targetEntity: z.string().min(1),
  kind: z.string().min(1),
  ownership: z.enum(["foreign_key", "polymorphic", "handler", "read_only"]),
  foreignKey: IdentifierSchema.optional(),
  targetKey: IdentifierSchema.optional(),
  sourceTypeField: IdentifierSchema.optional(),
  sourceIdField: IdentifierSchema.optional(),
  handler: z.string().min(1).optional(),
  mutationOwner: z.enum(["generic", "workspace", "handler", "read_only"]),
  versionStrategy: z.enum(["none", "parent_version", "row_version"]),
  allowedActions: z.object({
    create: z.boolean(), update: z.boolean(), delete: z.boolean(), replace: z.boolean(),
  }).strict(),
}).strict();

export const SerializedExecutionDescriptorV1Schema = z.object({
  schemaVersion: z.literal(1),
  identity: z.object({
    entityCode: z.string().min(1),
    entityVersionId: z.string().min(1),
    versionHash: z.string().min(1),
    compiledHash: HashSchema,
    entityClass: z.string().min(1),
  }).strict(),
  storage: z.object({
    schema: IdentifierSchema,
    table: IdentifierSchema,
    primaryKey: IdentifierSchema,
    tenantColumn: IdentifierSchema.nullable(),
    readCapability: z.enum(["generic", "facade", "projection"]),
    writeCapability: z.enum(["none", "generic", "facade", "append_only"]),
    rowVersionColumn: IdentifierSchema.optional(),
    backingType: z.enum(["table", "view", "materialized_view"]),
  }).strict(),
  fields: z.array(SerializedExecutionFieldSchema),
  read: z.object({
    projection: z.array(z.string().min(1)),
    searchableFields: z.array(z.string().min(1)),
    filterableFields: z.array(z.string().min(1)),
    defaultSort: z.array(z.object({
      field: z.string().min(1),
      direction: z.enum(["asc", "desc"]),
      nulls: z.enum(["first", "last"]),
    }).strict()).min(1),
    stableTieBreaker: z.string().min(1),
    naturalKeyFields: z.array(z.string().min(1)),
  }).strict(),
  write: z.object({
    create: z.object({
      mode: z.enum(["FORM_ONLY", "EARLY_DRAFT", "DIRECT_CREATE", "SOURCE_DOCUMENT_CREATE"]),
      idempotencyRequired: z.boolean(),
      numberingStrategy: z.string().min(1),
    }).strict(),
    mutations: z.object({
      create: MutationBindingSchema,
      update: MutationBindingSchema,
      delete: MutationBindingSchema,
      aggregate: MutationBindingSchema.optional(),
    }).strict(),
    arrayFields: z.array(z.string().min(1)),
    jsonFields: z.array(z.string().min(1)),
    concurrency: z.object({
      strategy: z.enum(["none", "version", "lease_plus_version"]),
      rollout: z.enum(["observe", "optional", "enforced"]),
      rowVersionField: z.string().min(1).optional(),
      lockRequired: z.boolean(),
    }).strict(),
    deletionMode: z.enum(["hard_delete", "soft_delete", "archive", "retire", "lifecycle_only", "prohibited"]),
  }).strict(),
  relations: z.array(SerializedRelationPlanSchema),
  lifecycle: z.object({
    statusField: z.string().min(1),
    editableStatuses: z.array(z.string()),
    states: z.record(z.string(), z.object({
      isEditable: z.boolean(), isCommitted: z.boolean(), isTerminal: z.boolean(),
      isDeletable: z.boolean(), isReversible: z.boolean(),
    }).strict()),
    commandHandler: z.string().min(1).optional(),
  }).strict().optional(),
  policy: z.object({
    governanceLevel: z.string().min(1),
    securityTier: z.string().min(1),
    mutability: z.string().min(1),
    accessMode: z.string().min(1).optional(),
    companyScopeMode: z.string().min(1).optional(),
    auditMode: z.string().min(1).optional(),
    dataPolicy: JsonRecordSchema,
    tenantOverlayHash: z.string().min(1).optional(),
    degradedFeatures: z.array(z.object({
      code: z.string().min(1), path: z.string().min(1), message: z.string().min(1),
    }).strict()),
  }).strict(),
  handlers: z.object({
    mutationHandler: z.string().min(1).optional(),
    writeFacade: z.string().min(1).optional(),
    lifecycleHandler: z.string().min(1).optional(),
    attachmentProvider: z.string().min(1).optional(),
    collectionHandlers: z.array(z.string().min(1)),
    domainHooks: z.array(z.string().min(1)),
  }).strict(),
}).strict();

export type SerializedExecutionDescriptorV1 = z.infer<typeof SerializedExecutionDescriptorV1Schema>;
export type CompiledExecutionField = z.infer<typeof SerializedExecutionFieldSchema>;
export type CompiledRelationPlan = z.infer<typeof SerializedRelationPlanSchema>;
export type CompiledReadPlan = SerializedExecutionDescriptorV1["read"];
export type CompiledWritePlan = SerializedExecutionDescriptorV1["write"];
export type CompiledLifecyclePlan = NonNullable<SerializedExecutionDescriptorV1["lifecycle"]>;
export type CompiledEntityPolicy = SerializedExecutionDescriptorV1["policy"];
export type CompiledHandlerReferences = SerializedExecutionDescriptorV1["handlers"];

export interface ExecutionDescriptorV1 {
  readonly schemaVersion: 1;
  readonly identity: Readonly<SerializedExecutionDescriptorV1["identity"]>;
  readonly storage: Readonly<SerializedExecutionDescriptorV1["storage"]>;
  readonly fields: ReadonlyMap<string, Readonly<CompiledExecutionField>>;
  readonly read: Readonly<CompiledReadPlan>;
  readonly write: Readonly<CompiledWritePlan>;
  readonly relations: ReadonlyMap<string, Readonly<CompiledRelationPlan>>;
  readonly lifecycle?: Readonly<CompiledLifecyclePlan>;
  readonly policy: Readonly<CompiledEntityPolicy>;
  readonly handlers: Readonly<CompiledHandlerReferences>;
}

class ImmutableReadonlyMap<K, V> implements ReadonlyMap<K, V> {
  readonly #values: Map<K, V>;
  constructor(entries: Iterable<readonly [K, V]>) { this.#values = new Map(entries); Object.freeze(this); }
  get size(): number { return this.#values.size; }
  get(key: K): V | undefined { return this.#values.get(key); }
  has(key: K): boolean { return this.#values.has(key); }
  forEach(callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown): void {
    this.#values.forEach((value, key) => callbackfn.call(thisArg, value, key, this));
  }
  entries(): MapIterator<[K, V]> { return this.#values.entries(); }
  keys(): MapIterator<K> { return this.#values.keys(); }
  values(): MapIterator<V> { return this.#values.values(); }
  [Symbol.iterator](): MapIterator<[K, V]> { return this.#values[Symbol.iterator](); }
  get [Symbol.toStringTag](): string { return "ImmutableReadonlyMap"; }
}

export function hydrateExecutionDescriptor(serialized: unknown): ExecutionDescriptorV1 {
  const parsed = SerializedExecutionDescriptorV1Schema.parse(serialized);
  const fields = parsed.fields.map((field) => [field.name, deepFreeze(field)] as const);
  const relations = parsed.relations.map((relation) => [relation.name, deepFreeze(relation)] as const);
  return Object.freeze({
    schemaVersion: 1 as const,
    identity: deepFreeze(parsed.identity),
    storage: deepFreeze(parsed.storage),
    fields: new ImmutableReadonlyMap(fields),
    read: deepFreeze(parsed.read),
    write: deepFreeze(parsed.write),
    relations: new ImmutableReadonlyMap(relations),
    ...(parsed.lifecycle ? { lifecycle: deepFreeze(parsed.lifecycle) } : {}),
    policy: deepFreeze(parsed.policy),
    handlers: deepFreeze(parsed.handlers),
  });
}

export function serializeExecutionDescriptor(descriptor: ExecutionDescriptorV1): SerializedExecutionDescriptorV1 {
  return SerializedExecutionDescriptorV1Schema.parse({
    schemaVersion: descriptor.schemaVersion,
    identity: descriptor.identity,
    storage: descriptor.storage,
    fields: [...descriptor.fields.values()].sort((a, b) => a.name.localeCompare(b.name)),
    read: descriptor.read,
    write: descriptor.write,
    relations: [...descriptor.relations.values()].sort((a, b) => a.name.localeCompare(b.name)),
    ...(descriptor.lifecycle ? { lifecycle: descriptor.lifecycle } : {}),
    policy: descriptor.policy,
    handlers: descriptor.handlers,
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
