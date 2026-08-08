import { z } from "zod";
import {
  EntityListCachePolicySchema,
  PLATFORM_DEFAULT_ENTITY_LIST_CACHE_POLICY,
} from "./entity-cache-policy";

/**
 * Meta Entity Contract v2.
 *
 * This is the authored contract.  It is deliberately separate from the
 * legacy metadata response schema: a response may contain derived fields for
 * older clients, but a v2 contract may only contain the owners below.
 */

const IdentifierSchema = z.string().regex(/^[a-z_][a-z0-9_]*$/);
const CodeSchema = z.string().min(1).regex(/^[a-z][a-z0-9_]*$/);
const IconKeySchema = z.string().min(1).regex(/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/);
const DomainCodeSchema = z.string().min(1).regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/);
const SemanticRoleSchema = z.string().min(1).regex(/^[a-z_][a-z0-9_]*(?:[.-][a-z0-9_]+)*$/);
const IdSchema = z.string().min(1);
const DateTimeSchema = z.string().datetime({ offset: true });

const AuditSchema = z.object({
  created_at: DateTimeSchema,
  created_by: IdSchema,
  updated_at: DateTimeSchema.nullable().optional(),
  updated_by: IdSchema.nullable().optional(),
}).strict();

export const MetaEntityCatalogSchema = z.object({
  id: IdSchema,
  tenant_id: IdSchema.nullable(),
  module_id: CodeSchema,
  entity_code: CodeSchema,
  slug: z.string().min(1).regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
  entity_class: z.string().min(1),
  ownership_model: z.enum(["system", "tenant", "package", "overlay"]),
  label_singular: z.string().min(1),
  label_plural: z.string().min(1),
  description: z.string().nullable().optional(),
  icon_key: IconKeySchema.nullable().optional(),
  color_token: CodeSchema.nullable().optional(),
  plane_eligibility: z.array(z.enum(["neon", "admin", "mesh"])).min(1),
  status: z.enum(["DRAFT", "ACTIVE", "DEPRECATED", "RETIRED"]),
  is_active: z.boolean(),
  status_changed_at: DateTimeSchema.nullable().optional(),
  status_changed_by: IdSchema.nullable().optional(),
}).strict();
export type MetaEntityCatalog = z.infer<typeof MetaEntityCatalogSchema>;

const IdentityConfigSchema = z.object({
  primary_key_field: IdentifierSchema,
  business_key_fields: z.array(IdentifierSchema),
  natural_key_fields: z.array(IdentifierSchema),
  display_identity: z.object({
    title_field: IdentifierSchema,
    subtitle_field: IdentifierSchema.nullable(),
  }).strict(),
  parent: z.object({ relation: CodeSchema }).nullable(),
  identity_via: CodeSchema.nullable(),
  list_entity_code: CodeSchema.nullable(),
  duplicate_check: z.object({
    enabled: z.boolean().default(false),
    fields: z.array(IdentifierSchema).default([]),
    scope: z.enum(["tenant", "company", "global"]).default("tenant"),
  }).strict(),
  replacement: z.object({
    entity_code: CodeSchema,
    reason_field: IdentifierSchema.nullable().optional(),
  }).strict().nullable(),
}).strict();
export const MetaEntityIdentityConfigSchema = IdentityConfigSchema;
export type MetaEntityIdentityConfig = z.infer<typeof IdentityConfigSchema>;

const SearchConfigSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(["server", "client", "both"]),
  fields: z.array(z.object({
    field: IdentifierSchema,
    weight: z.number().int().min(1).max(100),
  }).strict()),
  minimum_query_length: z.number().int().min(0).max(128),
  operator: z.enum(["contains", "prefix", "exact"]),
}).strict();
export const MetaEntitySearchConfigSchema = SearchConfigSchema;
export type MetaEntitySearchConfig = z.infer<typeof SearchConfigSchema>;

const DataPolicySchema = z.object({
  classification: z.enum(["public", "internal", "confidential", "restricted"]),
  retention: z.object({
    days: z.number().int().positive().nullable(),
    legal_hold_eligible: z.boolean(),
  }).strict(),
  deletion: z.object({
    anonymize: z.boolean(),
  }).strict(),
  pii_fields: z.array(IdentifierSchema),
}).strict();
export const MetaEntityDataPolicySchema = DataPolicySchema;
export type MetaEntityDataPolicy = z.infer<typeof DataPolicySchema>;

const ConcurrencyConfigSchema = z.object({
  strategy: z.enum(["none", "version", "lease_plus_version"]),
  rollout: z.enum(["observe", "optional", "enforced"]),
  row_version_field: IdentifierSchema.nullable(),
  lock_required: z.boolean(),
}).strict();

const StorageConfigSchema = z.object({
  discriminator: z.object({
    column: IdentifierSchema,
    value: z.string().min(1),
  }).nullable(),
  partition: z.object({
    parent_entity: CodeSchema,
    key: IdentifierSchema,
  }).nullable(),
  external_source: z.object({
    provider: CodeSchema,
    resource: z.string().min(1),
    read_handler: z.string().min(1).nullable().optional(),
  }).strict().nullable(),
  indexes: z.array(z.object({
    name: IdentifierSchema,
    columns: z.array(IdentifierSchema).min(1),
    unique: z.boolean().default(false),
    method: z.enum(["btree", "gin", "gist", "hash"]).default("btree"),
    where: z.string().min(1).nullable().optional(),
  }).strict()),
}).strict();

export const MetaEntityVersionContractSchema = z.object({
  id: IdSchema,
  tenant_id: IdSchema.nullable(),
  entity_version_id: IdSchema,
  runtime_enabled: z.boolean(),
  api_exposure: z.enum(["NONE", "CATALOG_ONLY", "API"]),
  backing_type: z.enum(["table", "view", "materialized_view", "external", "virtual"]),
  table_schema: IdentifierSchema,
  table_name: IdentifierSchema,
  primary_key: IdentifierSchema,
  tenant_column: IdentifierSchema.nullable(),
  read_capability: z.enum(["none", "generic", "facade", "projection"]),
  write_capability: z.enum(["none", "generic", "facade", "append_only"]),
  create_mode: z.enum(["FORM_ONLY", "EARLY_DRAFT", "DIRECT_CREATE", "SOURCE_DOCUMENT_CREATE"]),
  draft_ttl_hours: z.number().int().positive().nullable(),
  governance_level: z.string().min(1),
  security_tier: z.string().min(1),
  mutability: z.string().min(1),
  read_handler: z.string().min(1).nullable().optional(),
  write_handler: z.string().min(1).nullable().optional(),
  source_kind: z.enum(["explicit", "derived", "overlay"]),
  contract_hash: z.string().regex(/^[a-f0-9]{64}$/i).nullable().optional(),
  identity_config: IdentityConfigSchema,
  search_config: SearchConfigSchema,
  data_policy: DataPolicySchema,
  concurrency_config: ConcurrencyConfigSchema,
  storage_config: StorageConfigSchema,
}).strict();
export type MetaEntityVersionContract = z.infer<typeof MetaEntityVersionContractSchema>;

const TypeConfigScalarSchema = z.object({
  kind: z.literal("scalar"),
  format: z.string().min(1).nullable().optional(),
  unit: z.string().min(1).nullable().optional(),
}).strict();
const TypeConfigReferenceSchema = z.object({
  kind: z.literal("reference"),
  relation: CodeSchema,
  display: z.object({
    label_field: IdentifierSchema,
    code_field: IdentifierSchema.nullable().optional(),
    description_field: IdentifierSchema.nullable().optional(),
    format: z.enum(["label", "label_code", "code_label", "label_description"]).default("label"),
  }).strict(),
}).strict();
const TypeConfigMoneySchema = z.object({
  kind: z.literal("money"),
  currency: z.object({
    source: z.enum(["field", "constant"]),
    field: IdentifierSchema.nullable().optional(),
    code: z.string().min(1).nullable().optional(),
  }).strict(),
  minor_units: z.number().int().min(0).max(9),
}).strict();
const TypeConfigEnumSchema = z.object({
  kind: z.literal("enum"),
  domain_code: DomainCodeSchema,
}).strict();
const TypeConfigTemporalSchema = z.object({
  kind: z.literal("temporal"),
  temporal_kind: z.enum(["businessDate", "instant", "zonedDateTime"]),
  display_mode: z.enum(["date", "dateTime"]),
  affects_posting_period: z.boolean(),
}).strict();
const TypeConfigJsonSchema = z.object({
  kind: z.literal("json"),
  schema_key: CodeSchema,
}).strict();
export const MetaEntityFieldTypeConfigSchema = z.discriminatedUnion("kind", [
  TypeConfigScalarSchema,
  TypeConfigReferenceSchema,
  TypeConfigMoneySchema,
  TypeConfigEnumSchema,
  TypeConfigTemporalSchema,
  TypeConfigJsonSchema,
]);
export type MetaEntityFieldTypeConfig = z.infer<typeof MetaEntityFieldTypeConfigSchema>;

export const MetaEntityFieldSchema = z.object({
  id: IdSchema,
  tenant_id: IdSchema.nullable(),
  entity_version_id: IdSchema,
  name: IdentifierSchema,
  column_name: IdentifierSchema,
  projection_alias_of: IdentifierSchema.nullable().optional(),
  label: z.string().min(1),
  description: z.string().nullable().optional(),
  data_type: z.string().min(1),
  cardinality: z.enum(["one", "many", "zero_or_one"]),
  origin: z.enum(["system", "standard", "business"]),
  is_required: z.boolean(),
  is_unique: z.boolean(),
  unique_scope: z.enum(["global", "tenant", "entity_instance"]).nullable(),
  is_read_only: z.boolean(),
  is_deprecated: z.boolean(),
  is_computed: z.boolean(),
  is_write_once: z.boolean(),
  runtime_enabled: z.boolean(),
  compute_mode: z.string().min(1).nullable().optional(),
  compute_expr: z.record(z.string(), z.unknown()).nullable().optional(),
  default_value: z.unknown().optional(),
  defaults: z.record(z.string(), z.unknown()).nullable().optional(),
  is_filterable: z.boolean(),
  is_sortable: z.boolean(),
  is_groupable: z.boolean(),
  is_aggregatable: z.boolean(),
  semantic_roles: z.array(SemanticRoleSchema),
  type_config: MetaEntityFieldTypeConfigSchema,
}).strict();
export type MetaEntityField = z.infer<typeof MetaEntityFieldSchema>;

export const MetaEntityRelationSchema = z.object({
  id: IdSchema,
  tenant_id: IdSchema.nullable(),
  entity_version_id: IdSchema,
  relation_code: CodeSchema,
  relation_kind: z.enum(["belongs_to", "has_many", "m2m"]),
  target_entity_code: CodeSchema,
  resolution_kind: z.enum(["fk", "polymorphic", "join", "array_fk"]),
  source_field: IdentifierSchema.nullable(),
  target_field: IdentifierSchema,
  polymorphic_type_field: IdentifierSchema.nullable().optional(),
  polymorphic_type_value: z.string().min(1).nullable().optional(),
  polymorphic_id_field: IdentifierSchema.nullable().optional(),
  source_line_field: IdentifierSchema.nullable().optional(),
  runtime_role: CodeSchema.nullable().optional(),
  on_delete: z.enum(["restrict", "cascade", "set_null", "set_default", "no_action"]),
  record_filter: z.record(z.string(), z.unknown()),
  mutation_owner: z.enum(["generic", "workspace", "handler", "read_only"]),
  mutation_permissions: z.array(CodeSchema),
}).strict();
export type MetaEntityRelation = z.infer<typeof MetaEntityRelationSchema>;

const SurfaceModeSchema = z.enum(["list", "compact_card", "spreadsheet", "detail", "create", "edit", "picker", "print", "line_editor", "child_collection", "header"]);
const SurfaceKindSchema = z.enum(["TABLE", "CARDS", "FORM", "DETAIL", "PICKER", "PRINT", "COLLECTION", "HEADER", "CUSTOM"]);

export const MetaEntitySurfaceSchema = z.object({
  id: IdSchema,
  tenant_id: IdSchema.nullable(),
  entity_version_id: IdSchema,
  surface_key: CodeSchema,
  mode: SurfaceModeSchema,
  kind: SurfaceKindSchema,
  renderer_key: CodeSchema,
  label: z.string().min(1).nullable().optional(),
  is_enabled: z.boolean(),
  config: z.object({
    default_surface: CodeSchema.nullable().optional(),
    available_surfaces: z.array(CodeSchema).optional(),
    features: z.object({
      saved_views: z.boolean().optional(),
      column_customization: z.boolean().optional(),
      grouping: z.boolean().optional(),
      multi_sort: z.boolean().optional(),
      max_sort_levels: z.number().int().min(1).max(10).optional(),
      max_page_size: z.number().int().min(1).max(1000).optional(),
    }).strict().optional(),
    renderer_config: z.record(z.string(), z.unknown()).optional(),
  }).strict(),
}).strict();
export type MetaEntitySurface = z.infer<typeof MetaEntitySurfaceSchema>;

export const MetaEntityFieldSurfaceSchema = z.object({
  id: IdSchema,
  tenant_id: IdSchema.nullable(),
  entity_surface_id: IdSchema,
  entity_field_id: IdSchema,
  visible: z.boolean(),
  required_override: z.boolean().nullable(),
  readonly_override: z.boolean().nullable(),
  sort_order: z.number().int().nullable(),
  column_span: z.number().int().min(1).max(12).nullable(),
  density: z.enum(["compact", "comfortable", "document"]).nullable(),
  renderer_key: CodeSchema.nullable().optional(),
  editor_key: CodeSchema.nullable().optional(),
  visibility_expr: z.record(z.string(), z.unknown()).nullable().optional(),
  editability_expr: z.record(z.string(), z.unknown()).nullable().optional(),
  renderer_config: z.record(z.string(), z.unknown()),
}).strict();
export type MetaEntityFieldSurface = z.infer<typeof MetaEntityFieldSurfaceSchema>;

export const MetaEntityOperationSchema = z.object({
  id: IdSchema,
  tenant_id: IdSchema.nullable(),
  entity_version_id: IdSchema,
  operation_code: CodeSchema,
  permission_code: CodeSchema,
  surface: z.enum(["list", "detail", "both", "picker", "hidden"]),
  placement: z.enum(["primary", "toolbar", "overflow", "context", "command"]),
  handler_type: z.enum(["navigate", "api", "modal", "inline"]),
  handler_target: z.string().min(1).nullable().optional(),
  execution_target: z.string().min(1).nullable().optional(),
  record_required: z.boolean(),
  label: z.string().min(1),
  icon: IconKeySchema.nullable().optional(),
  intent: z.enum(["neutral", "success", "warning", "danger"]),
  confirmation: z.object({
    required: z.boolean(),
    code: CodeSchema.nullable(),
    message: z.string().min(1).nullable().optional(),
  }).strict(),
  reason_required: z.boolean(),
  selection_config: z.record(z.string(), z.unknown()).nullable().optional(),
  sort_order: z.number().int(),
  enabled: z.boolean(),
}).strict();
export type MetaEntityOperation = z.infer<typeof MetaEntityOperationSchema>;

const LifecycleStateSchema = z.object({
  label: z.string().min(1),
  badge: CodeSchema.nullable().optional(),
  icon: CodeSchema.nullable().optional(),
  color: CodeSchema.nullable().optional(),
  is_initial: z.boolean(),
  is_terminal: z.boolean(),
  is_editable: z.boolean(),
  is_deletable: z.boolean(),
  is_reversible: z.boolean(),
}).strict();
export const MetaEntityLifecycleSchema = z.object({
  status_field: IdentifierSchema,
  states: z.record(CodeSchema, LifecycleStateSchema),
  allowed_transitions: z.record(CodeSchema, z.array(CodeSchema)),
  command_handler: z.string().min(1).nullable().optional(),
}).strict();
export type MetaEntityLifecycle = z.infer<typeof MetaEntityLifecycleSchema>;

export const MetaEntityNumberingSchema = z.object({
  id: IdSchema,
  entity_id: IdSchema,
  number_field: IdentifierSchema,
  company_code_id: IdSchema.nullable().optional(),
  prefix: z.string(),
  prefix_configurable: z.boolean().default(true),
  separator: z.string(),
  segments: z.array(z.object({
    kind: z.enum(["tenant_code", "company_code", "branch_code", "year", "fiscal_year", "period", "quarter", "sequence", "static"]),
    value: z.string().min(1).nullable().optional(),
    width: z.number().int().positive().optional(),
  }).strict()),
  reset_strategy: z.enum(["never", "yearly", "fiscal_yearly", "monthly", "quarterly"]),
  uniqueness_scope: z.enum(["tenant", "company", "global"]),
  max_length: z.number().int().positive().nullable().optional(),
  allowed_chars: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).default({}),
  status: z.enum(["active", "inactive"]),
}).strict();
export type MetaEntityNumbering = z.infer<typeof MetaEntityNumberingSchema>;

export const MetaEntityPolicySchema = z.object({
  access_mode: z.enum(["default_deny", "default_allow", "explicit"]),
  company_scope_mode: z.enum(["none", "single", "subtree", "full"]),
  audit_mode: z.enum(["enabled", "disabled", "sampling"]),
  retention_policy: z.record(z.string(), z.unknown()),
  default_filters: z.record(z.string(), z.unknown()),
  cache_flags: z.record(z.string(), z.unknown()).default({}),
  cache_policy: EntityListCachePolicySchema.default({
    ...PLATFORM_DEFAULT_ENTITY_LIST_CACHE_POLICY,
    source: "platform",
  }),
}).strict();
export type MetaEntityPolicy = z.infer<typeof MetaEntityPolicySchema>;

const MetaEntityContractV2Shape = z.object({
  contract_version: z.literal(2),
  catalog: MetaEntityCatalogSchema,
  version_contract: MetaEntityVersionContractSchema,
  fields: z.array(MetaEntityFieldSchema),
  relations: z.array(MetaEntityRelationSchema),
  surfaces: z.array(z.object({
    surface: MetaEntitySurfaceSchema,
    fields: z.array(MetaEntityFieldSurfaceSchema),
  }).strict()),
  operations: z.array(MetaEntityOperationSchema),
  lifecycle: MetaEntityLifecycleSchema.nullable(),
  numbering: MetaEntityNumberingSchema.nullable(),
  policy: MetaEntityPolicySchema,
  flows: z.array(z.object({
    flow_code: CodeSchema,
    entry_operation: CodeSchema.nullable(),
    create_graph: z.array(CodeSchema),
  }).strict()),
}).strict();
export const MetaEntityContractV2Schema = MetaEntityContractV2Shape.superRefine((contract, ctx) => {
  const fieldsById = new Map<string, number>();
  const fieldsByName = new Map<string, number>();
  for (const [index, field] of contract.fields.entries()) {
    if (fieldsById.has(field.id)) ctx.addIssue({ code: "custom", path: ["fields", index, "id"], message: "Field ids must be unique within a contract." });
    if (fieldsByName.has(field.name)) ctx.addIssue({ code: "custom", path: ["fields", index, "name"], message: "Field names must be unique within a version." });
    if (new Set(field.semantic_roles).size !== field.semantic_roles.length) ctx.addIssue({ code: "custom", path: ["fields", index, "semantic_roles"], message: "Semantic roles must not be duplicated." });
    fieldsById.set(field.id, index);
    fieldsByName.set(field.name, index);
    if (field.entity_version_id !== contract.version_contract.entity_version_id) {
      ctx.addIssue({ code: "custom", path: ["fields", index, "entity_version_id"], message: "Field must belong to version_contract.entity_version_id." });
    }
  }

  const requireField = (fieldName: string | null | undefined, path: (string | number)[], label: string) => {
    if (fieldName && !fieldsByName.has(fieldName)) {
      ctx.addIssue({ code: "custom", path, message: `${label} '${fieldName}' must reference a field in this version.` });
    }
  };
  for (const [index, fieldName] of contract.version_contract.identity_config.business_key_fields.entries()) {
    requireField(fieldName, ["version_contract", "identity_config", "business_key_fields", index], "Business key field");
  }
  for (const [index, fieldName] of contract.version_contract.identity_config.natural_key_fields.entries()) {
    requireField(fieldName, ["version_contract", "identity_config", "natural_key_fields", index], "Natural key field");
  }
  for (const [index, fieldName] of contract.version_contract.identity_config.duplicate_check.fields.entries()) {
    requireField(fieldName, ["version_contract", "identity_config", "duplicate_check", "fields", index], "Duplicate check field");
  }
  const declaredRelationCodes = new Set(contract.relations.map((relation) => relation.relation_code));
  const parentRelation = contract.version_contract.identity_config.parent?.relation;
  if (parentRelation && !declaredRelationCodes.has(parentRelation)) {
    ctx.addIssue({ code: "custom", path: ["version_contract", "identity_config", "parent", "relation"], message: `Parent relation '${parentRelation}' must be declared in relations.` });
  }
  for (const [index, field] of contract.fields.entries()) {
    if (field.type_config.kind === "reference" && !declaredRelationCodes.has(field.type_config.relation)) {
      ctx.addIssue({ code: "custom", path: ["fields", index, "type_config", "relation"], message: `Reference relation '${field.type_config.relation}' must be declared in relations.` });
    }
  }
  requireField(contract.version_contract.identity_config.primary_key_field, ["version_contract", "identity_config", "primary_key_field"], "Primary key field");
  requireField(contract.version_contract.identity_config.display_identity.title_field, ["version_contract", "identity_config", "display_identity", "title_field"], "Display title field");
  requireField(contract.version_contract.identity_config.display_identity.subtitle_field, ["version_contract", "identity_config", "display_identity", "subtitle_field"], "Display subtitle field");
  requireField(contract.version_contract.concurrency_config.row_version_field, ["version_contract", "concurrency_config", "row_version_field"], "Row version field");
  if (contract.lifecycle) requireField(contract.lifecycle.status_field, ["lifecycle", "status_field"], "Lifecycle status field");
  if (contract.lifecycle) {
    const stateCodes = new Set(Object.keys(contract.lifecycle.states));
    for (const [from, targets] of Object.entries(contract.lifecycle.allowed_transitions)) {
      if (!stateCodes.has(from)) ctx.addIssue({ code: "custom", path: ["lifecycle", "allowed_transitions", from], message: "Transition source must be a declared lifecycle state." });
      for (const [targetIndex, target] of targets.entries()) {
        if (!stateCodes.has(target)) ctx.addIssue({ code: "custom", path: ["lifecycle", "allowed_transitions", from, targetIndex], message: `Transition target '${target}' must be a declared lifecycle state.` });
      }
    }
  }
  for (const [index, item] of contract.version_contract.search_config.fields.entries()) {
    requireField(item.field, ["version_contract", "search_config", "fields", index, "field"], "Search field");
  }
  if (new Set(contract.version_contract.search_config.fields.map((item) => item.field)).size !== contract.version_contract.search_config.fields.length) {
    ctx.addIssue({ code: "custom", path: ["version_contract", "search_config", "fields"], message: "Search fields must not be duplicated." });
  }
  for (const [index, fieldName] of contract.version_contract.data_policy.pii_fields.entries()) {
    requireField(fieldName, ["version_contract", "data_policy", "pii_fields", index], "PII field");
  }

  const relationCodes = new Set<string>();
  for (const [index, relation] of contract.relations.entries()) {
    if (relationCodes.has(relation.relation_code)) ctx.addIssue({ code: "custom", path: ["relations", index, "relation_code"], message: "Relation codes must be unique within a version." });
    relationCodes.add(relation.relation_code);
    if (relation.entity_version_id !== contract.version_contract.entity_version_id) {
      ctx.addIssue({ code: "custom", path: ["relations", index, "entity_version_id"], message: "Relation must belong to version_contract.entity_version_id." });
    }
    // For belongs_to, source_field is a field on this entity version. For
    // has_many/m2m it belongs to the target or junction projection and must
    // not be incorrectly required in the current entity's field registry.
    if (relation.relation_kind === "belongs_to") {
      requireField(relation.source_field, ["relations", index, "source_field"], "Relation source field");
    }
    if (relation.resolution_kind === "polymorphic" && (!relation.polymorphic_type_field || !relation.polymorphic_id_field)) {
      ctx.addIssue({ code: "custom", path: ["relations", index, "resolution_kind"], message: "Polymorphic relations require type and id fields." });
    }
  }

  const surfaceKeys = new Set<string>();
  for (const [surfaceIndex, surface] of contract.surfaces.entries()) {
    const surfaceDefinition = surface.surface;
    const surfaceIdentity = `${surfaceDefinition.mode}:${surfaceDefinition.surface_key}`;
    if (surfaceKeys.has(surfaceIdentity)) ctx.addIssue({ code: "custom", path: ["surfaces", surfaceIndex, "surface", "surface_key"], message: "Surface keys must be unique within a mode." });
    surfaceKeys.add(surfaceIdentity);
    if (surfaceDefinition.entity_version_id !== contract.version_contract.entity_version_id) {
      ctx.addIssue({ code: "custom", path: ["surfaces", surfaceIndex, "surface", "entity_version_id"], message: "Surface must belong to version_contract.entity_version_id." });
    }
    const bindingIds = new Set<string>();
    for (const [bindingIndex, binding] of surface.fields.entries()) {
      if (bindingIds.has(binding.entity_field_id)) ctx.addIssue({ code: "custom", path: ["surfaces", surfaceIndex, "fields", bindingIndex, "entity_field_id"], message: "A field may be bound only once per surface." });
      bindingIds.add(binding.entity_field_id);
      if (!fieldsById.has(binding.entity_field_id)) ctx.addIssue({ code: "custom", path: ["surfaces", surfaceIndex, "fields", bindingIndex, "entity_field_id"], message: "Surface field binding must reference a field in this version." });
      if (binding.entity_surface_id !== surfaceDefinition.id) ctx.addIssue({ code: "custom", path: ["surfaces", surfaceIndex, "fields", bindingIndex, "entity_surface_id"], message: "Surface field binding must reference its containing surface." });
    }
  }

  const operationCodes = new Set<string>();
  for (const [index, operation] of contract.operations.entries()) {
    if (operationCodes.has(operation.operation_code)) ctx.addIssue({ code: "custom", path: ["operations", index, "operation_code"], message: "Operation codes must be unique within a version." });
    operationCodes.add(operation.operation_code);
    if (operation.entity_version_id !== contract.version_contract.entity_version_id) {
      ctx.addIssue({ code: "custom", path: ["operations", index, "entity_version_id"], message: "Operation must belong to version_contract.entity_version_id." });
    }
  }

  if (contract.numbering) {
    requireField(contract.numbering.number_field, ["numbering", "number_field"], "Numbering field");
    const numberingField = contract.fields.find((field) => field.name === contract.numbering?.number_field);
    // Numbering is written by the numbering service, not by the generic form
    // writer. A UI-read-only number field is therefore valid, provided the
    // field remains active, runtime-enabled, and non-computed.
    if (numberingField && (!numberingField.runtime_enabled || numberingField.is_computed || numberingField.is_deprecated)) {
      ctx.addIssue({ code: "custom", path: ["numbering", "number_field"], message: "Numbering field must be runtime-enabled, active, and non-computed." });
    }
  }
  const operationCodesForFlow = new Set(contract.operations.map((operation) => operation.operation_code));
  for (const [index, flow] of contract.flows.entries()) {
    if (flow.entry_operation && !operationCodesForFlow.has(flow.entry_operation)) ctx.addIssue({ code: "custom", path: ["flows", index, "entry_operation"], message: "Flow entry_operation must reference an operation." });
    for (const [graphIndex, operationCode] of flow.create_graph.entries()) {
      if (!operationCodesForFlow.has(operationCode)) ctx.addIssue({ code: "custom", path: ["flows", index, "create_graph", graphIndex], message: "Flow create_graph must reference an operation." });
    }
  }
});
export type MetaEntityContractV2 = z.infer<typeof MetaEntityContractV2Schema>;

export type MetaEntityContractOwner =
  | "catalog"
  | "version_contract"
  | "fields"
  | "relations"
  | "surfaces"
  | "operations"
  | "lifecycle"
  | "numbering"
  | "policy"
  | "flows";

export interface MetaEntityContractPropertyDefinition {
  path: string;
  owner: MetaEntityContractOwner;
  required: boolean;
  default_value: string;
  runtime_consumer: string;
  ui_consumer: string;
  authorization: string;
  precedence: string;
  validation: string;
  deprecation: "none" | "derived_only" | "deleted";
}

/** The property-by-property approval registry used by Studio and CI. */
export const META_ENTITY_CONTRACT_V2_PROPERTY_REGISTRY: readonly MetaEntityContractPropertyDefinition[] = [
  ["catalog.id", "catalog", true, "uuidv7", "catalog loader", "Studio entity header", "catalog read permission", "catalog", "stable identifier", "none"],
  ["catalog.tenant_id", "catalog", true, "null", "tenant overlay resolver", "Studio scope", "tenant metadata permission", "catalog", "id or null", "none"],
  ["catalog.entity_code", "catalog", true, "none", "all runtime resolvers", "Studio entity header", "catalog read permission", "catalog", "lower snake_case and unique per tenant", "none"],
  ["catalog.slug", "catalog", true, "derived", "route resolver", "Studio entity header", "catalog read permission", "catalog", "kebab-case", "none"],
  ["catalog.label_singular", "catalog", true, "none", "catalog/list/detail", "Studio labels", "catalog read permission", "catalog", "non-empty", "none"],
  ["catalog.label_plural", "catalog", true, "none", "catalog/list", "Studio labels", "catalog read permission", "catalog", "non-empty", "none"],
  ["catalog.entity_class", "catalog", true, "MASTER", "compiler class profile", "Studio classification", "admin metadata permission", "catalog", "registered class", "none"],
  ["catalog.ownership_model", "catalog", true, "system", "provisioner", "Studio ownership", "admin metadata permission", "catalog", "registered ownership", "none"],
  ["catalog.description", "catalog", false, "null", "catalog loader", "Studio description", "catalog read permission", "catalog", "text or null", "none"],
  ["catalog.icon_key", "catalog", false, "null", "surface renderer", "Studio icon picker", "catalog read permission", "catalog", "code or null", "none"],
  ["catalog.color_token", "catalog", false, "null", "surface renderer", "Studio color picker", "catalog read permission", "catalog", "token or null", "none"],
  ["catalog.plane_eligibility", "catalog", true, "[neon]", "plane guard", "Studio plane selector", "plane authorization", "server authorization", "non-empty subset of neon/admin/mesh", "none"],
  ["catalog.status", "catalog", true, "DRAFT", "publish state", "Studio version workflow", "publish permission", "publish state", "valid catalog status", "none"],
  ["catalog.is_active", "catalog", true, "true", "catalog loader", "Studio activation", "publish permission", "catalog", "boolean", "none"],
  ["catalog.status_changed_at", "catalog", false, "null", "audit reader", "Studio audit", "catalog read permission", "catalog", "datetime or null", "none"],
  ["catalog.status_changed_by", "catalog", false, "null", "audit reader", "Studio audit", "catalog read permission", "catalog", "id or null", "none"],
  ["version_contract.id", "version_contract", true, "uuidv7", "version loader", "Studio version header", "metadata read permission", "version contract", "stable identifier", "none"],
  ["version_contract.tenant_id", "version_contract", true, "null", "tenant overlay resolver", "Studio scope", "tenant metadata permission", "version contract", "id or null", "none"],
  ["version_contract.entity_version_id", "version_contract", true, "none", "version loader", "Studio version header", "metadata read permission", "version contract", "must match route", "none"],
  ["version_contract.runtime_enabled", "version_contract", true, "false", "execution eligibility", "Studio runtime switch", "server authorization", "version contract", "must be true before API execution", "none"],
  ["version_contract.api_exposure", "version_contract", true, "NONE", "route exposure", "Studio exposure selector", "server authorization", "version contract", "API requires readable storage", "none"],
  ["version_contract.backing_type", "version_contract", true, "table", "storage adapter", "Studio storage tab", "server authorization", "version contract", "physical backing must exist", "none"],
  ["version_contract.table_schema", "version_contract", true, "none", "records query", "Studio storage tab", "server authorization", "version contract", "identifier and information_schema match", "none"],
  ["version_contract.table_name", "version_contract", true, "none", "records query", "Studio storage tab", "server authorization", "version contract", "identifier and information_schema match", "none"],
  ["version_contract.primary_key", "version_contract", true, "id", "record identity", "Studio storage tab", "server authorization", "version contract", "identifier and physical column", "none"],
  ["version_contract.tenant_column", "version_contract", false, "null", "tenant predicate", "Studio storage tab", "server authorization", "version contract", "identifier or null", "none"],
  ["version_contract.read_capability", "version_contract", true, "none", "read kernel", "Studio capability selector", "server authorization", "version contract", "registered enum", "none"],
  ["version_contract.write_capability", "version_contract", true, "none", "write kernel", "Studio capability selector", "server authorization", "version contract", "registered enum", "none"],
  ["version_contract.create_mode", "version_contract", true, "FORM_ONLY", "create runtime", "Studio create tab", "write permission", "version contract", "registered enum", "none"],
  ["version_contract.draft_ttl_hours", "version_contract", false, "null", "draft reaper", "Studio create tab", "write permission", "version contract", "positive integer or null", "none"],
  ["version_contract.governance_level", "version_contract", true, "full", "governance compiler", "Studio governance tab", "server authorization", "version contract", "registered level", "none"],
  ["version_contract.security_tier", "version_contract", true, "config", "security compiler", "Studio security tab", "server authorization", "version contract", "registered tier", "none"],
  ["version_contract.mutability", "version_contract", true, "controlled", "write kernel", "Studio mutability tab", "write permission", "version contract", "registered mutability", "none"],
  ["version_contract.read_handler", "version_contract", false, "null", "read kernel", "Studio handler selector", "server authorization", "version contract", "handler or null", "none"],
  ["version_contract.write_handler", "version_contract", false, "null", "write kernel", "Studio handler selector", "server authorization", "version contract", "handler or null", "none"],
  ["version_contract.source_kind", "version_contract", true, "derived", "compiler provenance", "Studio provenance", "server authorization", "version contract", "explicit/derived/overlay", "none"],
  ["version_contract.contract_hash", "version_contract", false, "null", "cache identity", "Studio diagnostics", "server authorization", "version contract", "sha256 or null", "none"],
  ["version_contract.identity_config", "version_contract", true, "{}", "identity resolver", "Studio identity tab", "record read permission", "version contract", "strict identity schema", "none"],
  ["version_contract.search_config", "version_contract", true, "{}", "search planner", "Studio search tab", "record read permission", "version contract", "field names must exist", "none"],
  ["version_contract.data_policy", "version_contract", true, "internal", "policy compiler", "Studio governance tab", "server authorization", "version contract", "PII fields must exist", "none"],
  ["version_contract.concurrency_config", "version_contract", true, "none/observe", "write kernel", "Studio concurrency tab", "write permission", "version contract", "row-version field must exist", "none"],
  ["version_contract.storage_config", "version_contract", true, "empty", "provisioner", "Studio storage tab", "server authorization", "version contract", "strict storage schema", "none"],
  ["identity_config.primary_key_field", "version_contract", true, "id", "identity resolver", "Studio identity tab", "record read permission", "version contract", "field exists", "none"],
  ["identity_config.business_key_fields", "version_contract", true, "[]", "identity resolver", "Studio identity tab", "record read permission", "version contract", "fields exist", "none"],
  ["identity_config.natural_key_fields", "version_contract", true, "[]", "identity resolver", "Studio identity tab", "record read permission", "version contract", "fields exist", "none"],
  ["identity_config.display_identity", "version_contract", true, "title_field", "identity renderer", "Studio identity tab", "record read permission", "version contract", "title/subtitle fields exist", "none"],
  ["identity_config.parent", "version_contract", true, "null", "hierarchy resolver", "Studio identity tab", "record read permission", "version contract", "relation or null", "none"],
  ["identity_config.identity_via", "version_contract", false, "null", "identity resolver", "Studio identity tab", "record read permission", "version contract", "code or null", "none"],
  ["identity_config.list_entity_code", "version_contract", false, "null", "list resolver", "Studio identity tab", "record read permission", "version contract", "code or null", "none"],
  ["identity_config.duplicate_check", "version_contract", true, "disabled", "duplicate validator", "Studio identity tab", "write permission", "version contract", "strict duplicate schema", "none"],
  ["identity_config.replacement", "version_contract", true, "null", "replacement resolver", "Studio identity tab", "write permission", "version contract", "entity code or null", "none"],
  ["search_config.enabled", "version_contract", true, "true", "search planner", "Studio search tab", "record read permission", "version contract", "boolean", "none"],
  ["search_config.mode", "version_contract", true, "server", "search planner", "Studio search tab", "record read permission", "version contract", "server/client/both", "none"],
  ["search_config.fields", "version_contract", true, "[]", "search planner", "Studio search tab", "record read permission", "version contract", "unique existing fields with weights", "none"],
  ["search_config.minimum_query_length", "version_contract", true, "2", "search planner", "Studio search tab", "record read permission", "version contract", "0..128", "none"],
  ["search_config.operator", "version_contract", true, "contains", "search planner", "Studio search tab", "record read permission", "version contract", "contains/prefix/exact", "none"],
  ["data_policy.classification", "version_contract", true, "internal", "policy compiler", "Studio governance tab", "server authorization", "version contract", "registered classification", "none"],
  ["data_policy.retention", "version_contract", true, "null", "retention worker", "Studio governance tab", "server authorization", "version contract", "strict retention schema", "none"],
  ["data_policy.deletion", "version_contract", true, "false", "delete kernel", "Studio governance tab", "server authorization", "version contract", "strict deletion schema", "none"],
  ["data_policy.pii_fields", "version_contract", true, "[]", "masking compiler", "Studio governance tab", "server authorization", "version contract", "existing fields only", "none"],
  ["concurrency_config.strategy", "version_contract", true, "none", "write kernel", "Studio concurrency tab", "write permission", "version contract", "registered strategy", "none"],
  ["concurrency_config.rollout", "version_contract", true, "observe", "write kernel", "Studio concurrency tab", "write permission", "version contract", "registered rollout", "none"],
  ["concurrency_config.row_version_field", "version_contract", false, "null", "write kernel", "Studio concurrency tab", "write permission", "version contract", "existing field or null", "none"],
  ["concurrency_config.lock_required", "version_contract", true, "false", "write kernel", "Studio concurrency tab", "write permission", "version contract", "boolean", "none"],
  ["storage_config.discriminator", "version_contract", true, "null", "storage adapter", "Studio storage tab", "server authorization", "version contract", "strict object or null", "none"],
  ["storage_config.partition", "version_contract", true, "null", "storage adapter", "Studio storage tab", "server authorization", "version contract", "strict object or null", "none"],
  ["storage_config.external_source", "version_contract", true, "null", "storage adapter", "Studio storage tab", "server authorization", "version contract", "strict object or null", "none"],
  ["storage_config.indexes", "version_contract", true, "[]", "storage provisioner", "Studio storage tab", "server authorization", "version contract", "strict index list", "none"],
  ["fields.name", "fields", true, "none", "field resolver", "Studio field editor", "field read permission", "fields", "unique per version", "none"],
  ["fields.id", "fields", true, "uuidv7", "field resolver", "Studio field editor", "field read permission", "fields", "stable identifier", "none"],
  ["fields.tenant_id", "fields", true, "null", "tenant overlay resolver", "Studio field scope", "tenant metadata permission", "fields", "id or null", "none"],
  ["fields.entity_version_id", "fields", true, "none", "field resolver", "Studio field editor", "server authorization", "fields", "must match version", "none"],
  ["fields.column_name", "fields", true, "none", "projection builder", "Studio field editor", "server authorization", "fields", "physical identifier", "none"],
  ["fields.projection_alias_of", "fields", false, "null", "projection builder", "Studio field editor", "server authorization", "fields", "field or null", "none"],
  ["fields.label", "fields", true, "none", "surface renderer", "Studio field editor", "field read permission", "fields", "non-empty", "none"],
  ["fields.description", "fields", false, "null", "surface renderer", "Studio field editor", "field read permission", "fields", "text or null", "none"],
  ["fields.data_type", "fields", true, "string", "coercion/validation", "Studio type selector", "server authorization", "fields", "registered data type", "none"],
  ["fields.cardinality", "fields", true, "one", "collection resolver", "Studio field rules", "server authorization", "fields", "one/many/zero_or_one", "none"],
  ["fields.origin", "fields", true, "business", "provisioner", "Studio field ownership", "server authorization", "fields", "system/standard/business", "none"],
  ["fields.is_required", "fields", true, "false", "write validation", "Studio field rules", "write permission", "fields", "boolean", "none"],
  ["fields.is_unique", "fields", true, "false", "write validation", "Studio field rules", "write permission", "fields", "boolean", "none"],
  ["fields.unique_scope", "fields", true, "null", "write validation", "Studio field rules", "write permission", "fields", "registered scope or null", "none"],
  ["fields.is_read_only", "fields", true, "false", "write validation", "Studio field rules", "write permission", "fields", "boolean", "none"],
  ["fields.is_deprecated", "fields", true, "false", "field resolver", "Studio field lifecycle", "metadata write permission", "fields", "boolean", "none"],
  ["fields.is_computed", "fields", true, "false", "value compiler", "Studio field rules", "server authorization", "fields", "boolean", "none"],
  ["fields.is_write_once", "fields", true, "false", "write kernel", "Studio field rules", "write permission", "fields", "boolean", "none"],
  ["fields.runtime_enabled", "fields", true, "true", "execution eligibility", "Studio field runtime switch", "server authorization", "fields", "boolean", "none"],
  ["fields.compute_mode", "fields", false, "null", "value compiler", "Studio computed field", "server authorization", "fields", "mode or null", "none"],
  ["fields.compute_expr", "fields", false, "null", "value compiler", "Studio computed field", "server authorization", "fields", "strict object or null", "none"],
  ["fields.default_value", "fields", false, "null", "write kernel", "Studio field defaults", "write permission", "fields", "any JSON", "none"],
  ["fields.defaults", "fields", false, "null", "write kernel", "Studio field defaults", "write permission", "fields", "strict object or null", "none"],
  ["fields.is_filterable", "fields", true, "false", "query planner", "Studio query capabilities", "read permission", "fields", "boolean", "none"],
  ["fields.is_sortable", "fields", true, "false", "query planner", "Studio query capabilities", "read permission", "fields", "boolean", "none"],
  ["fields.is_groupable", "fields", true, "false", "query planner", "Studio query capabilities", "read permission", "fields", "boolean", "none"],
  ["fields.is_aggregatable", "fields", true, "false", "query planner", "Studio query capabilities", "read permission", "fields", "boolean", "none"],
  ["fields.semantic_roles", "fields", true, "[]", "amount/currency/lifecycle resolvers", "Studio semantic role picker", "field read permission", "fields", "registered role and no duplicate role", "none"],
  ["fields.type_config", "fields", true, "kind-specific", "value coercion", "Studio type configuration", "field read permission", "fields", "discriminated strict schema", "none"],
  ["relations.relation_code", "relations", true, "none", "relation resolver", "Studio relation editor", "relation read permission", "relations", "unique per version", "none"],
  ["relations.id", "relations", true, "uuidv7", "relation resolver", "Studio relation editor", "relation read permission", "relations", "stable identifier", "none"],
  ["relations.tenant_id", "relations", true, "null", "tenant overlay resolver", "Studio relation scope", "tenant metadata permission", "relations", "id or null", "none"],
  ["relations.entity_version_id", "relations", true, "none", "relation resolver", "Studio relation editor", "server authorization", "relations", "must match version", "none"],
  ["relations.target_entity_code", "relations", true, "none", "relation resolver", "Studio relation picker", "relation read permission", "relations", "registered entity", "none"],
  ["relations.relation_kind", "relations", true, "belongs_to", "relation resolver", "Studio relation editor", "server authorization", "relations", "belongs_to/has_many/m2m", "none"],
  ["relations.resolution_kind", "relations", true, "fk", "relation resolver", "Studio relation editor", "server authorization", "relations", "fk/polymorphic/join/array_fk", "none"],
  ["relations.source_field", "relations", false, "null", "relation resolver", "Studio relation editor", "server authorization", "relations", "field exists when present", "none"],
  ["relations.target_field", "relations", true, "id", "relation resolver", "Studio relation editor", "server authorization", "relations", "identifier", "none"],
  ["relations.polymorphic_type_field", "relations", false, "null", "relation resolver", "Studio relation editor", "server authorization", "relations", "field or null", "none"],
  ["relations.polymorphic_type_value", "relations", false, "null", "relation resolver", "Studio relation editor", "server authorization", "relations", "text or null", "none"],
  ["relations.polymorphic_id_field", "relations", false, "null", "relation resolver", "Studio relation editor", "server authorization", "relations", "field or null", "none"],
  ["relations.source_line_field", "relations", false, "null", "relation resolver", "Studio relation editor", "server authorization", "relations", "field or null", "none"],
  ["relations.runtime_role", "relations", false, "null", "relation resolver", "Studio relation editor", "server authorization", "relations", "code or null", "none"],
  ["relations.on_delete", "relations", true, "restrict", "relation resolver", "Studio relation editor", "server authorization", "relations", "registered delete behavior", "none"],
  ["relations.record_filter", "relations", true, "{}", "relation resolver", "Studio relation editor", "server authorization", "relations", "strict object", "none"],
  ["relations.mutation_owner", "relations", true, "read_only", "collection write kernel", "Studio relation permissions", "write permission", "relations", "registered owner", "none"],
  ["relations.mutation_permissions", "relations", true, "[]", "collection write kernel", "Studio relation permissions", "write permission", "relations", "registered permissions", "none"],
  ["surfaces.surface", "surfaces", true, "default_list", "surface resolver", "Studio surface builder", "surface permission", "surface", "one key per mode", "none"],
  ["surfaces.surface.id", "surfaces", true, "uuidv7", "surface resolver", "Studio surface builder", "surface permission", "surface", "stable identifier", "none"],
  ["surfaces.surface.entity_version_id", "surfaces", true, "none", "surface resolver", "Studio surface builder", "server authorization", "surface", "must match version", "none"],
  ["surfaces.surface.mode", "surfaces", true, "list", "surface resolver", "Studio surface builder", "surface permission", "surface", "registered surface mode", "none"],
  ["surfaces.surface.kind", "surfaces", true, "TABLE", "surface resolver", "Studio surface builder", "surface permission", "surface", "registered surface kind", "none"],
  ["surfaces.surface.renderer_key", "surfaces", true, "runtime_default", "surface renderer", "Studio surface builder", "surface permission", "surface", "registered renderer", "none"],
  ["surfaces.surface.label", "surfaces", false, "null", "surface renderer", "Studio surface builder", "surface permission", "surface", "text or null", "none"],
  ["surfaces.surface.is_enabled", "surfaces", true, "true", "surface resolver", "Studio surface builder", "surface permission", "surface", "boolean", "none"],
  ["surfaces.surface.config", "surfaces", true, "{}", "surface renderer", "Studio surface builder", "surface permission", "surface", "strict surface config", "none"],
  ["surfaces.fields", "surfaces", true, "[]", "field placement resolver", "Studio drag/drop field layout", "surface permission", "field surface", "field must belong to version", "none"],
  ["surfaces.fields.visible", "surfaces", true, "true", "field placement resolver", "Studio drag/drop field layout", "surface permission", "field surface", "boolean", "none"],
  ["surfaces.fields.required_override", "surfaces", true, "null", "field placement resolver", "Studio field layout", "surface permission", "field surface", "boolean or null", "none"],
  ["surfaces.fields.readonly_override", "surfaces", true, "null", "field placement resolver", "Studio field layout", "surface permission", "field surface", "boolean or null", "none"],
  ["surfaces.fields.sort_order", "surfaces", true, "null", "field placement resolver", "Studio drag/drop field layout", "surface permission", "field surface", "integer or null", "none"],
  ["surfaces.fields.column_span", "surfaces", true, "null", "field placement resolver", "Studio drag/drop field layout", "surface permission", "field surface", "1..12 or null", "none"],
  ["surfaces.fields.density", "surfaces", true, "null", "surface renderer", "Studio field layout", "surface permission", "field surface", "registered density or null", "none"],
  ["surfaces.fields.renderer_key", "surfaces", false, "null", "surface renderer", "Studio field layout", "surface permission", "field surface", "renderer or null", "none"],
  ["surfaces.fields.editor_key", "surfaces", false, "null", "surface editor", "Studio field layout", "surface permission", "field surface", "editor or null", "none"],
  ["surfaces.fields.visibility_expr", "surfaces", false, "null", "surface resolver", "Studio field layout", "surface permission", "field surface", "strict object or null", "none"],
  ["surfaces.fields.editability_expr", "surfaces", false, "null", "surface resolver", "Studio field layout", "surface permission", "field surface", "strict object or null", "none"],
  ["surfaces.fields.renderer_config", "surfaces", true, "{}", "surface renderer", "Studio field layout", "surface permission", "field surface", "strict object", "none"],
  ["operations.operation_code", "operations", true, "none", "operation resolver", "Studio operation editor", "operation permission", "operations", "unique per version", "none"],
  ["operations.id", "operations", true, "uuidv7", "operation resolver", "Studio operation editor", "operation permission", "operations", "stable identifier", "none"],
  ["operations.tenant_id", "operations", true, "null", "tenant overlay resolver", "Studio operation scope", "tenant metadata permission", "operations", "id or null", "none"],
  ["operations.entity_version_id", "operations", true, "none", "operation resolver", "Studio operation editor", "server authorization", "operations", "must match version", "none"],
  ["operations.permission_code", "operations", true, "none", "authorization", "Studio permission picker", "admin metadata permission", "server authorization", "registered permission", "none"],
  ["operations.surface", "operations", true, "both", "operation resolver", "Studio operation editor", "operation permission", "operations", "list/detail/both/picker/hidden", "none"],
  ["operations.placement", "operations", true, "toolbar", "operation resolver", "Studio operation editor", "operation permission", "operations", "registered placement", "none"],
  ["operations.handler_type", "operations", true, "api", "operation resolver", "Studio operation editor", "operation permission", "operations", "registered handler", "none"],
  ["operations.handler_target", "operations", false, "null", "operation resolver", "Studio operation editor", "operation permission", "operations", "target or null", "none"],
  ["operations.execution_target", "operations", false, "null", "operation kernel", "Studio operation editor", "server authorization", "operations", "command or null", "none"],
  ["operations.record_required", "operations", true, "false", "operation resolver", "Studio operation editor", "operation permission", "operations", "boolean", "none"],
  ["operations.label", "operations", true, "permission label", "operation renderer", "Studio operation editor", "operation permission", "operations", "non-empty", "none"],
  ["operations.icon", "operations", false, "null", "operation renderer", "Studio operation editor", "operation permission", "operations", "code or null", "none"],
  ["operations.intent", "operations", true, "neutral", "operation renderer", "Studio operation editor", "operation permission", "operations", "registered intent", "none"],
  ["operations.confirmation", "operations", true, "false", "operation resolver", "Studio action editor", "operation permission", "operations", "strict confirmation schema", "none"],
  ["operations.reason_required", "operations", true, "false", "operation resolver", "Studio operation editor", "operation permission", "operations", "boolean", "none"],
  ["operations.selection_config", "operations", false, "null", "operation resolver", "Studio operation editor", "operation permission", "operations", "strict object or null", "none"],
  ["operations.sort_order", "operations", true, "0", "operation renderer", "Studio operation editor", "operation permission", "operations", "integer", "none"],
  ["operations.enabled", "operations", true, "true", "operation resolver", "Studio operation editor", "operation permission", "operations", "boolean", "none"],
  ["lifecycle.status_field", "lifecycle", false, "null", "lifecycle resolver", "Studio lifecycle editor", "lifecycle permission", "lifecycle", "field exists when present", "none"],
  ["lifecycle.states", "lifecycle", false, "{}", "lifecycle resolver", "Studio lifecycle editor", "lifecycle permission", "lifecycle", "strict state map", "none"],
  ["lifecycle.allowed_transitions", "lifecycle", false, "{}", "lifecycle resolver", "Studio lifecycle editor", "lifecycle permission", "lifecycle", "state targets exist", "none"],
  ["lifecycle.command_handler", "lifecycle", false, "null", "lifecycle kernel", "Studio lifecycle editor", "lifecycle permission", "lifecycle", "handler or null", "none"],
  ["numbering.number_field", "numbering", true, "none", "numbering service", "Studio numbering editor", "write permission", "numbering", "field exists and writable", "none"],
  ["numbering.id", "numbering", true, "uuidv7", "numbering service", "Studio numbering editor", "write permission", "numbering", "stable identifier", "none"],
  ["numbering.entity_id", "numbering", true, "none", "numbering service", "Studio numbering editor", "write permission", "numbering", "catalog entity id", "none"],
  ["numbering.company_code_id", "numbering", false, "null", "numbering service", "Studio numbering editor", "write permission", "numbering", "company id or null", "none"],
  ["numbering.prefix", "numbering", true, "", "numbering service", "Studio numbering editor", "write permission", "numbering", "text", "none"],
  ["numbering.prefix_configurable", "numbering", true, "true", "numbering service", "Studio numbering editor", "write permission", "numbering", "boolean", "none"],
  ["numbering.separator", "numbering", true, "-", "numbering service", "Studio numbering editor", "write permission", "numbering", "text", "none"],
  ["numbering.segments", "numbering", true, "[]", "numbering service", "Studio numbering editor", "write permission", "numbering", "strict segment list", "none"],
  ["numbering.reset_strategy", "numbering", true, "yearly", "numbering service", "Studio numbering editor", "write permission", "numbering", "registered reset strategy", "none"],
  ["numbering.uniqueness_scope", "numbering", true, "tenant", "numbering service", "Studio numbering editor", "write permission", "numbering", "registered uniqueness scope", "none"],
  ["numbering.max_length", "numbering", false, "null", "numbering service", "Studio numbering editor", "write permission", "numbering", "positive integer or null", "none"],
  ["numbering.allowed_chars", "numbering", true, "upper_alnum_dash", "numbering service", "Studio numbering editor", "write permission", "numbering", "named set or regex", "none"],
  ["numbering.metadata", "numbering", true, "{}", "numbering service", "Studio numbering editor", "write permission", "numbering", "object", "none"],
  ["numbering.status", "numbering", true, "active", "numbering service", "Studio numbering editor", "write permission", "numbering", "active/inactive", "none"],
  ["policy.access_mode", "policy", true, "default_deny", "policy compiler", "Studio policy tab", "server authorization", "policy", "registered enum", "none"],
  ["policy.company_scope_mode", "policy", true, "none", "policy compiler", "Studio policy tab", "server authorization", "policy", "registered enum", "none"],
  ["policy.audit_mode", "policy", true, "enabled", "policy compiler", "Studio policy tab", "server authorization", "policy", "registered enum", "none"],
  ["policy.retention_policy", "policy", true, "{}", "policy compiler", "Studio policy tab", "server authorization", "policy", "strict object", "none"],
  ["policy.default_filters", "policy", true, "{}", "policy compiler", "Studio policy tab", "server authorization", "policy", "strict object", "none"],
  ["policy.cache_flags", "policy", true, "{}", "policy compiler", "Studio policy tab", "server authorization", "policy", "object", "none"],
  ["policy.cache_policy", "policy", true, "platform default", "metadata compiler", "Studio policy tab", "server authorization", "policy", "typed entity list cache policy", "none"],
  ["flows.flow_code", "flows", true, "none", "flow engine", "Studio flow editor", "operation permission", "flows", "registered flow", "none"],
  ["flows.entry_operation", "flows", false, "null", "flow engine", "Studio flow editor", "operation permission", "flows", "operation or null", "none"],
  ["flows.create_graph", "flows", true, "[]", "flow engine", "Studio flow editor", "operation permission", "flows", "registered graph", "none"],
  ["display_config", "catalog", false, "derived", "compatibility projection only", "not shown", "none", "surface", "must not be authored in v2", "derived_only"],
  ["feature_flags", "catalog", false, "derived", "compatibility projection only", "not shown", "none", "capabilities", "must not be authored in v2", "deleted"],
  ["fields.is_searchable", "fields", false, "derived", "search_config.fields", "not shown", "none", "search_config", "must not be authored in v2", "derived_only"],
  ["fields.is_pii", "version_contract", false, "derived", "data_policy.pii_fields", "not shown", "server authorization", "data_policy", "must not be authored in v2", "derived_only"],
  ["fields.is_primary_amount", "fields", false, "derived", "semantic_roles", "not shown", "none", "fields", "must be derived from semantic_roles", "deleted"],
  ["fields.is_primary_currency", "fields", false, "derived", "semantic_roles", "not shown", "none", "fields", "must be derived from semantic_roles", "deleted"],
  ["fields.reference_config", "fields", false, "derived", "type_config + relations", "not shown", "none", "relations", "must not be authored in v2", "deleted"],
  ["fields.money_config", "fields", false, "derived", "type_config", "not shown", "none", "fields", "must not be authored in v2", "deleted"],
  ["fields.enum_config", "fields", false, "derived", "type_config", "not shown", "none", "fields", "must not be authored in v2", "deleted"],
  ["fields.datetime_config", "fields", false, "derived", "type_config", "not shown", "none", "fields", "must not be authored in v2", "deleted"],
].map(([path, owner, required, default_value, runtime_consumer, ui_consumer, authorization, precedence, validation, deprecation]) => ({
  path,
  owner,
  required,
  default_value,
  runtime_consumer,
  ui_consumer,
  authorization,
  precedence,
  validation,
  deprecation,
})) as readonly MetaEntityContractPropertyDefinition[];

const OWNER_PATHS = new Set(META_ENTITY_CONTRACT_V2_PROPERTY_REGISTRY.map((entry) => `${entry.owner}:${entry.path}`));
if (OWNER_PATHS.size !== META_ENTITY_CONTRACT_V2_PROPERTY_REGISTRY.length) {
  throw new Error("Meta Entity Contract v2 property registry contains duplicate entries.");
}

export function parseMetaEntityContractV2(input: unknown): MetaEntityContractV2 {
  return MetaEntityContractV2Schema.parse(input);
}

export function safeParseMetaEntityContractV2(input: unknown) {
  return MetaEntityContractV2Schema.safeParse(input);
}

