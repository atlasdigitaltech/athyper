/**
 * @athyper/api-contracts — Metadata Schemas
 *
 * Types for the compiled entity runtime read path.
 * Mirrors structures from:
 *   snapshot.entity_compiled       (compiled_json)
 *   control.entity_field           (field definitions)
 *   control.entity_operation       (UI action registrations)
 *   control.entity_lifecycle       (lifecycle bindings)
 *   snapshot.status_route          (compiled status transitions)
 *   control.field_group            (UI field groupings)
 *   control.lookup_domain/value    (dropdown options)
 *
 * CI RULE: Shape changes in server/framework/core/meta/types or
 * entity engine DDL must revalidate these schemas. See docs/api/contract-sync.md.
 */
import { z } from "zod";
import { UuidSchema } from "./common";

// ═══════════════════════════════════════════════════════════════
// ENTITY CLASS — determines rendering runtime
// ═══════════════════════════════════════════════════════════════

export const EntityClassSchema = z.enum([
  "REFERENCE", "MASTER", "CONTROL",
  "DOCUMENT", "DOCUMENT_RELATION",
  "LEDGER", "LOG", "AGGREGATE",
  "DIMENSION", "RELATION",
]);
export type EntityClass = z.infer<typeof EntityClassSchema>;

/** Entity class → route prefix mapping for navigation/runtime-router. */
export const ENTITY_CLASS_TO_RUNTIME: Record<EntityClass, "/master/" | "/document/" | "/ledger/"> = {
  REFERENCE: "/master/", MASTER: "/master/", CONTROL: "/master/",
  DOCUMENT: "/document/", DOCUMENT_RELATION: "/document/",
  LEDGER: "/ledger/", LOG: "/ledger/", AGGREGATE: "/ledger/",
  DIMENSION: "/master/", RELATION: "/master/",
};

// ═══════════════════════════════════════════════════════════════
// FIELD DATA TYPES — drives field renderer registry
// Source: control.lookup_value WHERE domain_code = 'entity_field.data_type'
// ═══════════════════════════════════════════════════════════════

export const FieldDataTypeSchema = z.enum([
  "string", "text", "integer", "bigint", "decimal", "numeric",
  "boolean", "uuid", "date", "datetime", "timestamptz",
  "json", "jsonb", "enum", "reference", "money", "tsvector",
  "text_array", "uuid_array", "int_array", "jsonb_array",
]);
export type FieldDataType = z.infer<typeof FieldDataTypeSchema>;

export const FieldCardinalitySchema = z.enum(["one", "many", "zero_or_one"]);
export const FieldOriginSchema = z.enum(["system", "standard", "business"]);

// ═══════════════════════════════════════════════════════════════
// ENTITY FIELD — from control.entity_field DDL
// ═══════════════════════════════════════════════════════════════

export const EntityFieldSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  column_name: z.string(),
  label: z.string().nullable(),
  description: z.string().nullable(),

  data_type: FieldDataTypeSchema,
  ui_type: z.string().nullable(),
  format: z.string().nullable(),
  unit: z.string().nullable(),

  cardinality: FieldCardinalitySchema,
  origin: FieldOriginSchema,

  is_required: z.boolean(),
  is_readonly: z.boolean(),
  is_unique: z.boolean(),
  is_searchable: z.boolean(),
  is_filterable: z.boolean(),
  is_sortable: z.boolean(),
  is_groupable: z.boolean(),
  is_aggregatable: z.boolean(),
  is_pii: z.boolean(),

  default_value: z.unknown().nullable(),
  validation_rules: z.record(z.string(), z.unknown()).nullable(),
  enum_domain_code: z.string().nullable(),

  reference_config: z.object({
    target_entity: z.string(),
    target_field: z.string().optional(),
    display_field: z.string().optional(),
  }).nullable(),

  sort_order: z.number().int(),
  group_key: z.string().nullable(),
  i18n_key: z.string().nullable(),
});
export type EntityField = z.infer<typeof EntityFieldSchema>;

// ═══════════════════════════════════════════════════════════════
// FIELD GROUP — from control.field_group DDL
// ═══════════════════════════════════════════════════════════════

export const FieldGroupSchema = z.object({
  group_key: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  sort_order: z.number().int(),
  fields: z.array(z.string()),
});
export type FieldGroup = z.infer<typeof FieldGroupSchema>;

// ═══════════════════════════════════════════════════════════════
// COMPILED ENTITY — from snapshot.entity_compiled.compiled_json
// Primary source for all three rendering runtimes.
// ═══════════════════════════════════════════════════════════════

export const CompiledEntitySchema = z.object({
  entity_id: UuidSchema,
  entity_code: z.string(),
  entity_name: z.string(),
  entity_class: EntityClassSchema,

  table_schema: z.string(),
  table_name: z.string(),

  version_no: z.number().int(),
  version_hash: z.string(),

  fields: z.array(EntityFieldSchema),
  field_groups: z.array(FieldGroupSchema),

  display_config: z.object({
    title_field: z.string().optional(),
    subtitle_field: z.string().optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
    default_sort_field: z.string().optional(),
    default_sort_order: z.enum(["asc", "desc"]).optional(),
    list_columns: z.array(z.string()).optional(),
    search_fields: z.array(z.string()).optional(),
  }),

  feature_flags: z.object({
    has_attachments: z.boolean().optional(),
    has_comments: z.boolean().optional(),
    has_activity_log: z.boolean().optional(),
    has_workflow: z.boolean().optional(),
    has_lifecycle: z.boolean().optional(),
    has_versioning: z.boolean().optional(),
    is_importable: z.boolean().optional(),
    is_exportable: z.boolean().optional(),
    is_bulk_editable: z.boolean().optional(),
  }),

  governance_level: z.string(),
  security_tier: z.string(),
  compiled_at: z.string().datetime(),
  compiled_hash: z.string(),
});
export type CompiledEntity = z.infer<typeof CompiledEntitySchema>;

// ═══════════════════════════════════════════════════════════════
// ENTITY OPERATION — from control.entity_operation DDL
// ═══════════════════════════════════════════════════════════════

export const OperationSurfaceSchema = z.enum(["LIST", "DETAIL", "BOTH", "PALETTE_ONLY", "HIDDEN"]);
export const OperationPlacementSchema = z.enum(["PRIMARY", "TOOLBAR", "OVERFLOW", "CONTEXT", "COMMAND"]);
export const OperationHandlerTypeSchema = z.enum(["NAVIGATE", "API", "MODAL", "INLINE"]);

export const EntityOperationSchema = z.object({
  id: UuidSchema,
  entity_name: z.string(),
  permission_code: z.string(),
  surface: OperationSurfaceSchema,
  placement: OperationPlacementSchema,
  handler_type: OperationHandlerTypeSchema,
  handler_target: z.string().nullable(),
  is_record_required: z.boolean(),
  sort_order: z.number().int(),
  label_override: z.string().nullable(),
  icon_override: z.string().nullable(),
  is_enabled: z.boolean(),
});
export type EntityOperation = z.infer<typeof EntityOperationSchema>;

// ═══════════════════════════════════════════════════════════════
// STATUS ROUTE — from snapshot.status_route.compiled_json
// ═══════════════════════════════════════════════════════════════

export const StatusRouteSchema = z.object({
  entity_name: z.string(),
  initial_state: z.string(),
  all_states: z.array(z.string()),
  terminal_states: z.array(z.string()),
  deletable_states: z.array(z.string()),
  allowed_transitions: z.record(z.string(), z.array(z.string())),
});
export type StatusRoute = z.infer<typeof StatusRouteSchema>;

// ═══════════════════════════════════════════════════════════════
// LIFECYCLE BINDING — from control.entity_lifecycle
// ═══════════════════════════════════════════════════════════════

export const EntityLifecycleBindingSchema = z.object({
  id: UuidSchema,
  entity_name: z.string(),
  lifecycle_id: UuidSchema,
  conditions: z.record(z.string(), z.unknown()).nullable(),
  priority: z.number().int(),
});
export type EntityLifecycleBinding = z.infer<typeof EntityLifecycleBindingSchema>;

// ═══════════════════════════════════════════════════════════════
// COMPILED OVERLAY — from snapshot.entity_compiled_overlay
// ═══════════════════════════════════════════════════════════════

export const CompiledOverlaySchema = z.object({
  entity_version_id: UuidSchema,
  overlay_set: z.array(UuidSchema),
  compiled_json: z.record(z.string(), z.unknown()),
  compiled_hash: z.string(),
});
export type CompiledOverlay = z.infer<typeof CompiledOverlaySchema>;

// ═══════════════════════════════════════════════════════════════
// LOOKUP DOMAIN + VALUE — dropdown resolution
// ═══════════════════════════════════════════════════════════════

export const LookupDomainSchema = z.object({
  id: UuidSchema,
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  source_schema: z.string(),
  is_extensible: z.boolean(),
  status: z.enum(["active", "deprecated"]),
});
export type LookupDomain = z.infer<typeof LookupDomainSchema>;

export const LookupValueSchema = z.object({
  id: UuidSchema,
  code: z.string(),
  name: z.string(),
  domain_code: z.string(),
  description: z.string().nullable(),
  sort_order: z.number().int(),
  is_system: z.boolean(),
  is_default: z.boolean(),
  parent_code: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  status: z.enum(["active", "deprecated"]),
});
export type LookupValue = z.infer<typeof LookupValueSchema>;

export const LookupDomainBundleSchema = z.object({
  domain: LookupDomainSchema,
  values: z.array(LookupValueSchema),
});
export type LookupDomainBundle = z.infer<typeof LookupDomainBundleSchema>;

// ═══════════════════════════════════════════════════════════════
// CAPABILITY — tenant/entity feature flags
// ═══════════════════════════════════════════════════════════════

export const EntityCapabilitySchema = z.object({
  entity_name: z.string(),
  capability_code: z.string(),
  is_enabled: z.boolean(),
  config: z.record(z.string(), z.unknown()).nullable(),
});
export type EntityCapability = z.infer<typeof EntityCapabilitySchema>;
