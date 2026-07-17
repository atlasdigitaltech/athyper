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
import { SemanticIntentSchema, UuidSchema } from "./common";
import type { EntityClass } from "../enums";

// ═══════════════════════════════════════════════════════════════
// ENTITY CLASS — determines rendering runtime
// ═══════════════════════════════════════════════════════════════

export const EntityClassSchema = z.enum([
  "REFERENCE", "MASTER", "CONTROL",
  "DOCUMENT", "DOCUMENT_RELATION",
  "LEDGER", "LOG", "AGGREGATE",
  "DIMENSION", "RELATION",
]);
export type { EntityClass };

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
  "lifecycle_state",
]);
export type FieldDataType = z.infer<typeof FieldDataTypeSchema>;

export const FieldCardinalitySchema = z.enum(["one", "many", "zero_or_one"]);
export const FieldOriginSchema = z.enum(["system", "standard", "business"]);

export const ReferencePickerConfigSchema = z.object({
  /** Primary label in chooser rows, commonly "name". */
  label_field: z.string().nullable().optional(),
  /** Secondary code line in chooser rows, commonly "code". */
  code_field: z.string().nullable().optional(),
  /** Optional descriptive text line, commonly "description". */
  description_field: z.string().nullable().optional(),
  /** Field used to build /app/{entity}/{id}; falls back to code/id conventions. */
  navigation_field: z.string().nullable().optional(),
  /** Backward-compatible alias for navigation_field. */
  record_id_field: z.string().nullable().optional(),
  show_code: z.boolean().optional(),
  show_description: z.boolean().optional(),
  show_view_action: z.boolean().optional(),
  option_action_label: z.string().optional(),
  /** "advanced" enables the portal-based dense chooser display. */
  variant: z.enum(["standard", "advanced"]).optional(),
  /** Display density for the advanced chooser. */
  density: z.enum(["mini", "compact", "comfortable", "mobile"]).optional(),
  width: z.union([z.number(), z.string()]).optional(),
  max_list_height: z.union([z.number(), z.string()]).optional(),
  show_keyboard_hints: z.boolean().optional(),
  show_recently_used: z.boolean().optional(),
  recent_limit: z.number().optional(),
  /** Number of records fetched per advanced-picker request / Load more click. */
  page_size: z.number().int().positive().optional(),
  /** Initial advanced-picker search mode. Server search is the default. */
  default_search_mode: z.enum(["server", "instant"]).optional(),
  result_label: z.string().optional(),
  tree: z.object({
    enabled: z.boolean().optional(),
    default_enabled: z.boolean().optional(),
    parent_field: z.string(),
    value_field: z.string().optional(),
    level_field: z.string().optional(),
    sort_field: z.string().optional(),
    min_records: z.number().int().positive().optional(),
  }).optional(),
  controls: z.array(z.object({
    id: z.string().optional(),
    label: z.string(),
    value: z.string().optional(),
    field: z.string().optional(),
    match_value: z.string().optional(),
    search_param: z.string().optional(),
    count: z.number().optional(),
    disabled: z.boolean().optional(),
  })).optional(),
  sections: z.array(z.object({
    id: z.string().optional(),
    label: z.string(),
    value: z.string().optional(),
    field: z.string().optional(),
    match_value: z.string().optional(),
  })).optional(),
  badges: z.array(z.object({
    label: z.string().optional(),
    field: z.string().optional(),
    tone: z.enum(["default", "muted", "success", "warning", "destructive", "info"]).optional(),
    label_map: z.record(z.string(), z.string()).optional(),
    tone_map: z.record(z.string(), z.enum(["default", "muted", "success", "warning", "destructive", "info"])).optional(),
  })).optional(),
});

// ═══════════════════════════════════════════════════════════════
// ENTITY FIELD — from control.entity_field DDL
// ═══════════════════════════════════════════════════════════════

export const RuleExpressionSchema = z.record(z.string(), z.unknown());

export const FieldReferenceConfigSchema = z.object({
  target_entity: z.string(),
  target_field: z.string().optional(),
  display_field: z.string().optional(),
  label_field: z.string().nullable().optional(),
  code_field: z.string().nullable().optional(),
  description_field: z.string().nullable().optional(),
  navigation_field: z.string().nullable().optional(),
  record_id_field: z.string().nullable().optional(),
  show_code: z.boolean().optional(),
  show_description: z.boolean().optional(),
  show_view_action: z.boolean().optional(),
  picker: ReferencePickerConfigSchema.optional(),
}).passthrough();
export type FieldReferenceConfig = z.infer<typeof FieldReferenceConfigSchema>;

export const FieldMoneyConfigSchema = z.object({
  currency_source: z.enum(["field", "header", "constant", "tenant", "system"]).optional(),
  currency_field: z.string().optional(),
  currency_code: z.string().optional(),
  currency_code_position: z.enum(["prefix", "suffix", "hidden"]).optional(),
  minor_units: z.number().int().min(0).max(6).optional(),
  fallback_minor_units: z.number().int().min(0).max(6).optional(),
  constant_currency: z.string().optional(),
  code_position: z.enum(["prefix", "suffix", "hidden"]).optional(),
  currency_position: z.enum(["prefix", "suffix", "hidden"]).optional(),
}).passthrough();
export type FieldMoneyConfig = z.infer<typeof FieldMoneyConfigSchema>;

export const FieldFilterConfigSchema = z.object({
  section_key: z.string().optional(),
  section_label: z.string().optional(),
  section_order: z.number().int().optional(),
  kind: z.string().optional(),
  control_type: z.string().optional(),
  operators: z.array(z.string()).optional(),
  placeholder: z.string().optional(),
  quick_filter: z.boolean().optional(),
  quick_label: z.string().optional(),
  quick_order: z.number().int().optional(),
  value_label_map: z.record(z.string(), z.string()).optional(),
}).passthrough();
export type FieldFilterConfig = z.infer<typeof FieldFilterConfigSchema>;

export const FieldUiHintSchema = z.object({
  display: z.object({
    hide_in: z.array(z.string()).optional(),
    visible_when: RuleExpressionSchema.nullable().optional(),
  }).passthrough().optional(),
  copy: z.object({
    behavior: z.string().optional(),
  }).passthrough().optional(),
  copy_behavior: z.string().optional(),
  filter: z.record(z.string(), z.unknown()).optional(),
  group_key: z.string().optional(),
  visible_when: RuleExpressionSchema.nullable().optional(),
  placeholder: z.string().optional(),
  tooltip: z.string().optional(),
  rows: z.number().int().positive().optional(),
  variant: z.string().optional(),
  /** Density of a metadata-selected control such as `ui_type: "segmented"`. */
  size: z.enum(["sm", "md", "lg"]).optional(),
  /** Whether the control sizes to its content or fills its available width. */
  layout: z.enum(["content", "stretch"]).optional(),
  /** Controls secondary copy beneath segmented-control option labels. */
  show_option_descriptions: z.boolean().optional(),
  input_mode: z.string().optional(),
  pattern: z.string().optional(),
  icon: z.string().optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  hide_label: z.boolean().optional(),
  autocomplete: z.string().optional(),
  /**
   * Per-field opt-in for the line-item sheet footer summary strip.
   * When set, the field is included in the inline Net / Discount / Tax / Gross
   * style bar at the bottom of LineItemComposerSheet / LineItemEditorSheet.
   * The strip resolver reads field-level hints first, then falls back to
   * entity display_config.line_summary_strip, then to variant heuristics.
   */
  line_summary: z.object({
    label:    z.string().optional(),
    sign:     z.union([z.literal(1), z.literal(-1)]).optional(),
    bold:     z.boolean().optional(),
    divider:  z.boolean().optional(),
    order:    z.number().int().optional(),
  }).optional(),
}).passthrough();
export type FieldUiHint = z.infer<typeof FieldUiHintSchema>;

export const FieldVisibilitySchema = z.record(z.string(), z.unknown());
export type FieldVisibility = z.infer<typeof FieldVisibilitySchema>;

export const FieldEditabilitySchema = z.object({
  editable: z.boolean().optional(),
  editable_in: z.array(z.string()).optional(),
  editable_when: z.object({
    status_in: z.array(z.string()).optional(),
  }).passthrough().optional(),
}).passthrough();
export type FieldEditability = z.infer<typeof FieldEditabilitySchema>;

export const FieldLookupConfigSchema = z.object({
  filters: z.record(z.string(), z.unknown()).optional(),
  dependent_filter: z.object({
    source_field: z.string().optional(),
    target_field: z.string().optional(),
    empty_behavior: z.enum(["none", "all"]).optional(),
    through_entity: z.string().optional(),
    through_source_field: z.string().optional(),
    through_target_field: z.string().optional(),
    through_filters: z.record(z.string(), z.unknown()).optional(),
    sort_field: z.string().optional(),
    sort_direction: z.enum(["asc", "desc"]).optional(),
  }).passthrough().optional(),
  depends_on: z.unknown().optional(),
  dependency: z.unknown().optional(),
  value_case: z.enum(["preserve", "upper", "lower"]).optional(),
  value_label_map: z.record(z.string(), z.string()).optional(),
}).passthrough();
export type FieldLookupConfig = z.infer<typeof FieldLookupConfigSchema>;

export const FieldValidationRulesSchema = z.object({
  max_length: z.number().int().positive().optional(),
  min_length: z.number().int().nonnegative().optional(),
  min_value: z.number().optional(),
  max_value: z.number().optional(),
  pattern: z.string().optional(),
  allowed_values: z.array(z.unknown()).optional(),
  cross_field: z.array(z.record(z.string(), z.unknown())).optional(),
  ref_entity: z.string().optional(),
}).passthrough();
export type FieldValidationRules = z.infer<typeof FieldValidationRulesSchema>;

export const FieldEnumConfigSchema = z.object({
  values: z.array(z.unknown()).optional(),
  options: z.array(z.unknown()).optional(),
}).passthrough();
export type FieldEnumConfig = z.infer<typeof FieldEnumConfigSchema>;

export const FieldJsonConfigSchema = z.record(z.string(), z.unknown());
export type FieldJsonConfig = z.infer<typeof FieldJsonConfigSchema>;

export const FieldDatetimeConfigSchema = z.record(z.string(), z.unknown());
export type FieldDatetimeConfig = z.infer<typeof FieldDatetimeConfigSchema>;

export const FieldLookupProfileSchema = z.object({
  variant: z.string().optional(),
  density: z.string().optional(),
  max_items: z.number().int().positive().optional(),
}).passthrough();
export type FieldLookupProfile = z.infer<typeof FieldLookupProfileSchema>;

export const FieldCollectionBehaviorSchema = z.record(z.string(), z.unknown());
export type FieldCollectionBehavior = z.infer<typeof FieldCollectionBehaviorSchema>;

export const FieldConstraintsSchema = z.object({
  max_length: z.number().int().positive().optional(),
  min_length: z.number().int().nonnegative().optional(),
  min_value: z.number().optional(),
  max_value: z.number().optional(),
  pattern: z.string().optional(),
  allowed_values: z.array(z.unknown()).optional(),
  unique: z.boolean().optional(),
  not_null: z.boolean().optional(),
  check: z.string().optional(),
}).passthrough();
export type FieldConstraints = z.infer<typeof FieldConstraintsSchema>;

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
  unique_scope: z.enum(["global", "tenant", "entity_instance"]).nullable().optional(),
  is_searchable: z.boolean(),
  is_filterable: z.boolean(),
  is_sortable: z.boolean(),
  is_groupable: z.boolean(),
  is_aggregatable: z.boolean(),
  is_pii: z.boolean(),
  is_computed: z.boolean().optional(),
  is_write_once: z.boolean().optional(),
  /** P5 marker: entity's primary numeric-amount field (drives detectAmountField). */
  is_primary_amount: z.boolean().optional().default(false),
  /** P5 marker: entity's primary currency-code field (drives detectCurrencyField). */
  is_primary_currency: z.boolean().optional().default(false),

  default_value: z.unknown().nullable(),
  compute_expr: z.unknown().nullable().optional(),
  validation_rules: FieldValidationRulesSchema.nullable(),
  enum_config: FieldEnumConfigSchema.nullable().optional(),
  enum_domain_code: z.string().nullable(),

  reference_config: FieldReferenceConfigSchema.nullable(),
  money_config: FieldMoneyConfigSchema.nullable().optional(),
  json_config: FieldJsonConfigSchema.nullable().optional(),
  datetime_config: FieldDatetimeConfigSchema.nullable().optional(),

  sort_order: z.number().int(),
  group_key: z.string().nullable(),
  ui_hint: FieldUiHintSchema.nullable().optional(),
  visibility: FieldVisibilitySchema.nullable().optional(),
  editability: FieldEditabilitySchema.nullable().optional(),
  lookup_config: FieldLookupConfigSchema.nullable().optional(),
  lookup_profile: FieldLookupProfileSchema.nullable().optional(),
  filter_config: FieldFilterConfigSchema.nullable().optional(),
  collection_behavior: FieldCollectionBehaviorSchema.nullable().optional(),
  constraints: FieldConstraintsSchema.nullable().optional(),
  i18n_key: z.string().nullable(),
});
export type EntityField = z.infer<typeof EntityFieldSchema>;

// ═══════════════════════════════════════════════════════════════
// FIELD GROUP — from control.field_group DDL
// ═══════════════════════════════════════════════════════════════

export const FieldGroupSchema = z.object({
  group_key:   z.string(),
  label:       z.string(),
  description: z.string().nullable(),
  sort_order:  z.number().int(),
  /** Field grid column count within this section (1=single, 2=two-col, 3=three-col). */
  columns:     z.union([z.literal(1), z.literal(2), z.literal(3)]).default(3),
  /** In two_column print mode: 'half' participates in left/right split, 'full' spans the page. */
  page_span:   z.enum(["full", "half"]).default("half"),
  /**
   * P5 — presentational role for the shared line-item runtime. Drives section /
   * tab typing without a hardcoded convention table on the client. Nullable
   * because groups can exist without a line-item runtime role.
   */
  ui_intent:   z.enum([
    "what","how_much","where_it_costs","classify","tax","discount",
    "retention","charges","delivery","budget","reference_links","accounting",
  ]).nullable().optional(),
  fields:      z.array(z.string()),
});
export type FieldGroup = z.infer<typeof FieldGroupSchema>;

// ═══════════════════════════════════════════════════════════════
// MASTER CONFIG SUB-SCHEMAS
// ═══════════════════════════════════════════════════════════════

/** Config for the summary_cards_with_drawer tab renderer and child_list sections. */
const SummaryCardsConfigSchema = z.object({
  /** Field name rendered as each card's primary identity line. */
  title:          z.string(),
  /**
   * Optional high-density business presentation for child sections.
   * The value is metadata, not entity-code-driven: any child list can opt into
   * these reusable renderers when its field shape matches the view.
   */
  presentation:   z.enum([
    "cards",
    "scorecard",
    "timeline",
    "profile_cards",
    "policy_matrix",
    "ability_cards",
    "temporal_rules",
  ]).optional(),
  /**
   * Presentation-specific knobs. Kept intentionally open so SQL metadata can
   * evolve without TypeScript learning every business noun.
   */
  presentation_config: z.record(z.string(), z.unknown()).optional(),
  /** Ordered field names rendered as the card facts line. */
  facts:          z.array(z.string()).optional(),
  /** Badge evaluator keys (e.g. "primary", "status", "verified", "expiry"). */
  badges:         z.array(z.string()).optional(),
  /** Alert rule keys evaluated per record. */
  alertRules:     z.array(z.string()).optional(),
  /** Default sort order fragments. */
  defaultSort:    z.array(z.string()).optional(),
  /** Group cards by this field name (phase 2 rendering — schema-ready). */
  group_by_field: z.string().optional(),
  /** Ordered group key values for display; ungrouped keys sort to the end. */
  group_order:    z.array(z.string()).optional(),
  /** Human-readable labels for group keys. */
  group_labels:   z.record(z.string(), z.string()).optional(),
});
export type SummaryCardsConfig = z.infer<typeof SummaryCardsConfigSchema>;

// ── Visibility condition — controls tab/section rendering ─────────────────────

/**
 * Runtime condition that gates whether a tab or composite section is rendered.
 * Evaluated client-side via a lightweight child-entity existence check.
 */
export const VisibilityConditionSchema = z.object({
  /**
   * child_exists — section is shown only when the target child entity
   * has at least one record associated with this parent record.
   */
  type:               z.enum(["child_exists"]),
  entity_code:        z.string(),
  owner_type_filter:  z.string().optional(),
  party_type_filter:  z.string().optional(),
});
export type VisibilityCondition = z.infer<typeof VisibilityConditionSchema>;

/**
 * Section within a composite-renderer tab.
 *   fields     — read/edit field grid sourced from the parent entity's own fields.
 *   child      — single child entity record (e.g. supplier role).
 *   child_list — paginated card list of child entity records (e.g. certifications
 *                inside Trust & Compliance). Driven by config like summary_cards_with_drawer.
 */
const MasterTabSectionSchema = z.object({
  id:                   z.string(),
  label:                z.string(),
  type:                 z.enum(["fields", "child", "child_list"]),
  entity_code:          z.string().optional(),
  display_fields:       z.array(z.string()).optional(),
  add_href_template:    z.string().optional(),
  add_label:            z.string().optional(),
  owner_type_filter:    z.string().optional(),
  party_type_filter:    z.string().optional(),
  /**
   * When set, the child entity panel uses the value of this field from the parent
   * record as the parent_id for queries and creates, instead of the record's own id.
   * Use when child records are owned by a related entity (e.g. 'business_partner_id'
   * on the supplier page to query/create records owned by the business partner).
   */
  parent_id_field:      z.string().optional(),
  /**
   * When set, the records API performs a single-query two-hop:
   *   WHERE parentFkCol IN (SELECT id FROM throughTable WHERE throughParentFk = recordUuid)
   * The intermediary table and its parent field are resolved at runtime from control.entity,
   * so no entity-specific logic lives in TypeScript — only the entity_code lives here.
   * Example: business_partner page showing supplier-owned certifications passes
   *   through_entity="supplier"; backend reads supplier.identity_config.parent.field=
   *   "business_partner_id" and builds the subquery automatically.
   */
  through_entity:       z.string().optional(),
  empty_title:          z.string().optional(),
  empty_description:    z.string().optional(),
  /** Card config for type=child_list. Same shape as the tab-level config. */
  config:               SummaryCardsConfigSchema.optional(),
  /**
   * When set the section is gated: it is only rendered (and its nav pill shown)
   * when the condition evaluates to true at runtime.
   */
  visibility_condition: VisibilityConditionSchema.optional(),
});
export type MasterTabSection = z.infer<typeof MasterTabSectionSchema>;

// ── Completeness check — drives the Overview strip ───────────────────────────

/**
 * A single check entry in master_config.completeness_checks.
 * The Overview renderer evaluates each check against live data and surfaces
 * at most 3 severity-ordered items in the completeness strip.
 */
export const CompletenessCheckSchema = z.object({
  /** Stable key used for deduplication and React keying. */
  key:        z.string(),
  /**
   * Strip label. Supports the {date} placeholder for child_field_expiry,
   * which is replaced with the earliest expiring record's formatted date.
   */
  message:    z.string(),
  /** Tab id to navigate to when the user clicks this strip item. */
  tab_target: z.string().optional(),
  /** Visual severity. Ordering: blocking > warning > info. */
  severity:   z.enum(["blocking", "warning", "info"]),
  /**
   * When set the check is only evaluated when this role entity has
   * at least one record for the current parent (customer or supplier).
   */
  role_gate:    z.enum(["customer", "supplier"]).optional(),
  /**
   * Evaluation strategy:
   *   field_null        — parent record field is null or empty.
   *   child_missing     — child entity has no records (deferred: requires address entity).
   *   child_field_expiry — any child record has a date field expiring within threshold_days.
   *   child_any_match   — any child record has a field value matching one of the given values.
   */
  check_type:   z.enum(["field_null", "child_missing", "child_field_expiry", "child_any_match"]),
  /** Entity code to query for child_* check types. */
  child_entity: z.string().optional(),
  /**
   * Check-type-specific parameters:
   *   field_null:         { field: string }
   *   child_missing:      { owner_type_filter?: string }
   *   child_field_expiry: { field: string; threshold_days: number }
   *   child_any_match:    { field: string; values: string[] }
   */
  check_config: z.record(z.string(), z.unknown()).optional(),
});
export type CompletenessCheck = z.infer<typeof CompletenessCheckSchema>;

/** A single tab in a master entity's tab strip. */
const MasterTabSchema = z.object({
  id:      z.string(),
  label:   z.string(),
  renderer: z.enum([
    "overview",
    "fields",
    "child",
    "composite",
    "comments",
    "attachments",
    "activity",
    "blank",
    "summary_cards_with_drawer",
    "contacts_channel_accordion",
    "addresses_accordion",
    "supplier_cc_extension",
  ]),
  /** Required for renderer="child" or "summary_cards_with_drawer". */
  entity_code:         z.string().optional(),
  display_fields:      z.array(z.string()).optional(),
  add_href_template:   z.string().optional(),
  add_label:           z.string().optional(),
  owner_type_filter:   z.string().optional(),
  party_type_filter:   z.string().optional(),
  /**
   * When set, the child entity panel uses the value of this field from the parent
   * record as the parent_id for queries and creates, instead of the record's own id.
   * Use when child records are owned by a related entity (e.g. 'business_partner_id'
   * on the supplier page to query/create records owned by the business partner).
   */
  parent_id_field:     z.string().optional(),
  /**
   * When set, the records API performs a single-query two-hop:
   *   WHERE parentFkCol IN (SELECT id FROM throughTable WHERE throughParentFk = recordUuid)
   * The intermediary table and its parent field are resolved at runtime from control.entity,
   * so no entity-specific logic lives in TypeScript — only the entity_code lives here.
   * Example: business_partner page showing supplier-owned certifications passes
   *   through_entity="supplier"; backend reads supplier.identity_config.parent.field=
   *   "business_partner_id" and builds the subquery automatically.
   */
  through_entity:      z.string().optional(),
  empty_title:         z.string().optional(),
  empty_description:   z.string().optional(),
  blank_message:       z.string().optional(),
  /** Ordered sub-sections for renderer="composite". */
  composite_sections:  z.array(MasterTabSectionSchema).optional(),
  /** Entity used for the create form when different from entity_code (e.g. view-backed child). */
  create_entity_code:  z.string().optional(),
  /** Secondary entity for polymorphic link records. */
  link_entity_code:    z.string().optional(),
  /** owner_type injected into the link record. */
  link_owner_type:     z.string().optional(),
  /** Config for renderer="summary_cards_with_drawer". */
  config:               SummaryCardsConfigSchema.optional(),
  /**
   * When set the tab content is gated: rendered only when the condition
   * evaluates to true. Nav pill visibility is phase 2.
   */
  visibility_condition: VisibilityConditionSchema.optional(),
});
export type MasterTab = z.infer<typeof MasterTabSchema>;

/** A single secondary status dimension shown in the header strip (P3 rail). */
export const StatusDimensionConfigSchema = z.object({
  id:           z.string(),
  label:        z.string(),
  source_entity: z.string(),
  source_field:  z.string(),
  true_label:   z.string(),
  false_label:  z.string(),
  true_intent:  z.string(),
  false_intent: z.string(),
});
export type StatusDimensionConfig = z.infer<typeof StatusDimensionConfigSchema>;

/** Config for detail_profile="rich" master entities (master_config). */
export const MasterConfigSchema = z.object({
  /** P1 chip label, e.g. "SUPPLIER". Defaults to entity_named. */
  type_label:           z.string().optional(),
  /** Field name whose value is shown as inline classification: "ACME · Supplier". */
  classification_field: z.string().optional(),
  /** Field names to display as KPI fact cells (P2 header rail for rich profile). */
  header_facts:         z.array(z.string()).optional(),
  /** Secondary boolean status dimensions shown as chips in the P3 status strip. */
  status_dimensions:    z.array(StatusDimensionConfigSchema).optional(),
  /** Platform context panels shown as icon buttons in the tab bar. */
  platform_panels:      z.array(z.enum(["comments", "attachments", "activity"])).optional(),
  /** Ordered tab definitions. Falls back to [fields, comments, attachments, activity] when absent. */
  tabs:                 z.array(MasterTabSchema).optional(),
  /**
   * Completeness checks evaluated in the Overview tab's strip.
   * Max 3 items are surfaced, sorted by severity (blocking → warning → info).
   * Checks with role_gate are only evaluated when that role entity exists.
   */
  completeness_checks:  z.array(CompletenessCheckSchema).optional(),
});
export type MasterConfig = z.infer<typeof MasterConfigSchema>;

/**
 * First-screen intake mode shown by entity-specific launchers such as
 * /app/business_partner/new. The mode controls the launcher card and points to
 * either a metadata flow or a route-level handler.
 */
export const EntityIntakeModeSchema = z.object({
  code: z.string(),
  label: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  href: z.string().optional(),
  flow_entity: z.string().optional(),
  flow_code: z.string().optional(),
  persistence_mode: z.string().optional(),
  sort_order: z.number().int().optional(),
}).passthrough();
export type EntityIntakeMode = z.infer<typeof EntityIntakeModeSchema>;

/**
 * Metadata-controlled redirect for /app/[entity]/new.
 * href_template supports {entity_code} and {entity} placeholders.
 */
export const EntityCreateRedirectSchema = z.object({
  href_template: z.string().min(1),
  preserve_query: z.boolean().optional(),
}).passthrough();
export type EntityCreateRedirect = z.infer<typeof EntityCreateRedirectSchema>;

export const EntityDisplayConfigSchema = z.record(z.string(), z.unknown());
export type EntityDisplayConfig = z.infer<typeof EntityDisplayConfigSchema>;

/**
 * Entity-level list surface overrides.  These are presentation policy inputs;
 * authorization is still enforced by the corresponding server endpoints.
 */
export const EntityListFeaturesSchema = z.object({
  saved_views:          z.boolean().optional(),
  bulk_actions:         z.boolean().optional(),
  export:               z.boolean().optional(),
  import:               z.boolean().optional(),
  column_customization: z.boolean().optional(),
  grouping:             z.boolean().optional(),
  multi_sort:           z.boolean().optional(),
  max_sort_levels:      z.number().int().min(1).optional(),
  search_mode:          z.enum(["server", "client", "both"]).optional(),
  max_page_size:        z.number().int().positive().optional(),
}).passthrough();
export type EntityListFeatures = z.infer<typeof EntityListFeaturesSchema>;

export const EntitySearchConfigSchema = z.object({
  enabled: z.boolean().optional(),
  fields: z.array(z.string()).optional(),
  rank: z.record(z.string(), z.number()).optional(),
  min_query_length: z.number().int().min(1).optional(),
  operator: z.enum(["contains"]).optional(),
}).passthrough();
export type EntitySearchConfig = z.infer<typeof EntitySearchConfigSchema>;

export const EntityDataPolicySchema = z.object({
  classification: z.enum(["public", "internal", "confidential", "restricted"]).optional(),
  pii_fields: z.array(z.string()).optional(),
  retention_days: z.number().int().positive().optional(),
  legal_hold_eligible: z.boolean().optional(),
  anonymize_on_delete: z.boolean().optional(),
}).passthrough();
export type EntityDataPolicy = z.infer<typeof EntityDataPolicySchema>;

export const EntityIdentityConfigSchema = z.object({
  /** Surrogate row identifier used for UUID detail routes and write targets. */
  primary_key_field: z.string().optional(),
  /** Human/business identifiers accepted for navigation and shown as record numbers. */
  business_key_fields: z.array(z.string()).optional(),
  /** Uniqueness-defining fields, often tenant-scoped and sometimes composite. */
  natural_key_fields: z.array(z.string()).optional(),
  /** Number generation policy for document/business identifiers. */
  numbering: z.object({
    enabled: z.boolean().optional(),
    field: z.string().optional(),
    strategy: z.enum(["none", "manual", "auto", "auto_or_manual", "AUTO_ON_CREATE", "AUTO_ON_PROMOTE", "AUTO_ON_SUBMIT"]).optional(),
    provider: z.enum(["entity_numbering_config"]).optional(),
    company_scope_field: z.string().optional(),
    effective_date_field: z.string().optional(),
  }).passthrough().optional(),
  /** Human-readable identity templates evaluated by initiate/copy/promote runtimes. */
  naming: z.object({
    field: z.string(),
    max_length: z.number().int().positive().optional(),
    initiate: z.object({
      kind: z.literal("template").optional(),
      template: z.string().min(1),
      apply_when: z.enum(["always", "blank", "system_managed"]).optional(),
    }).passthrough().optional(),
    copy: z.object({
      kind: z.literal("template").optional(),
      template: z.string().min(1),
      fallback_template: z.string().min(1).optional(),
      normalize_copy_prefix: z.boolean().optional(),
    }).passthrough().optional(),
    promote: z.object({
      kind: z.literal("template").optional(),
      template: z.string().min(1),
      apply_when: z.enum(["always", "blank", "system_managed"]).optional(),
    }).passthrough().optional(),
  }).passthrough().optional(),
  /** Canonical identity provider for thin role tables, e.g. supplier via business_partner. */
  identity_via: z.string().optional(),
  /** Optional denormalized list/index entity used for list/search surfaces. */
  list_entity_code: z.string().optional(),
  /** Parent binding used by generic child-list queries and create parent injection. */
  parent: z.object({
    entity: z.string().optional(),
    field: z.string().optional(),
    scope: z.string().optional(),
  }).passthrough().optional(),
  /** Duplicate-detection policy owned by the business identity contract. */
  duplicate_check: z.object({
    fields: z.array(z.string()).optional(),
    exact_fields: z.array(z.string()).optional(),
    strong_name_threshold: z.number().optional(),
    weak_name_threshold: z.number().optional(),
    block_on_exact: z.boolean().optional(),
  }).passthrough().optional(),
  /** Replacement target when this entity is superseded by a canonical entity. */
  replacement: z.object({
    replacement_entity: z.string().optional(),
  }).passthrough().optional(),
}).passthrough();
export type EntityIdentityConfig = z.infer<typeof EntityIdentityConfigSchema>;

export const EntityFeatureFlagsSchema = z.object({
  // Core entity capabilities.
  has_attachments: z.boolean().optional(),
  has_workflow: z.boolean().optional(),
  has_lifecycle: z.boolean().optional(),
  is_importable: z.boolean().optional(),
  is_exportable: z.boolean().optional(),
  is_bulk_editable: z.boolean().optional(),
  is_approvable: z.boolean().optional(),
  is_readonly: z.boolean().optional(),

  // Runtime exposure/guard rails. These are operational switches, not identity.
  is_hidden: z.boolean().optional(),

  // Detail tab and subroute capabilities.
  comments_enabled: z.boolean().optional(),
  event_history: z.boolean().optional(),
  version_control: z.boolean().optional(),
  has_lines: z.boolean().optional(),
  has_accounting_distribution: z.boolean().optional(),
  has_tasks: z.boolean().optional(),
  has_watchers: z.boolean().optional(),
  has_rules: z.boolean().optional(),
  has_integrations: z.boolean().optional(),
  quality_checks: z.boolean().optional(),
  record_reports: z.boolean().optional(),
  sla_target_hours: z.number().optional(),

  // Document/workbench capabilities.
  has_payment_schedule: z.boolean().optional(),
  has_budget_impact: z.boolean().optional(),
  has_related_documents: z.boolean().optional(),
  has_ai_classification: z.boolean().optional(),
  has_line_composer: z.boolean().optional(),
  line_references: z.boolean().optional(),
  catalog_feature_enabled: z.boolean().optional(),
  catalog_enabled: z.boolean().optional(),
  catalog_items_enabled: z.boolean().optional(),
  has_catalog_items: z.boolean().optional(),
  has_catalog: z.boolean().optional(),
  document_category: z.string().optional(),

  // Runtime scoping capabilities for polymorphic/shared backing tables.
  requires_owner_type_scope: z.boolean().optional(),
  owner_type_column: z.string().optional(),
  default_owner_type_scope: z.string().optional(),
  default_owner_type: z.string().optional(),
  is_company_scoped: z.boolean().optional(),

  // Domain capabilities still owned by the feature contract in V1.
  singleton: z.boolean().optional(),
  pii_bearing: z.boolean().optional(),
  allow_address: z.boolean().optional(),
  allow_contact: z.boolean().optional(),
  has_roles: z.boolean().optional(),
  role_entity: z.string().optional(),
  party_category: z.string().optional(),
  append_only_after_submission: z.boolean().optional(),
  reference_picker: z.boolean().optional(),
  line_editor: z.boolean().optional(),
  posting_controlled: z.boolean().optional(),
  dimension_controlled: z.boolean().optional(),
  replacement_for: z.string().optional(),
});
export type EntityFeatureFlags = z.infer<typeof EntityFeatureFlagsSchema>;

// ═══════════════════════════════════════════════════════════════
// COMPILED ENTITY — from snapshot.entity_compiled.compiled_json
// Primary source for all three rendering runtimes.
// ═══════════════════════════════════════════════════════════════

export const CompiledEntityRelationSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  relation_kind: z.string(),
  target_entity: z.string(),
  resolution_kind: z.string().optional(),
  fk_field: z.string().nullable().optional(),
  target_key: z.string().nullable().optional(),
  source_type_field: z.string().nullable().optional(),
  source_type_value: z.string().nullable().optional(),
  source_id_field: z.string().nullable().optional(),
  source_line_field: z.string().nullable().optional(),
  runtime_role: z.string().nullable().optional(),
  on_delete: z.string().nullable().optional(),
  record_filter: z.record(z.string(), z.unknown()).optional(),
  ui_behavior: z.record(z.string(), z.unknown()).optional(),
}).passthrough();
export type CompiledEntityRelation = z.infer<typeof CompiledEntityRelationSchema>;

export const CompiledDocumentRuntimePlanSchema = z.object({
  source: z.literal("compiled_v6"),
  schemaVersion: z.literal("document-edit-runtime/v6.0"),
  planVersion: z.string().min(1),
  planHash: z.string().min(1),
  archetype: z.enum(["header_only", "document_with_items"]),
  nodes: z.array(z.object({
    key: z.string().min(1),
    kind: z.enum(["core", "collection"]),
    versionSource: z.enum(["document", "node"]),
  })),
  invalidationActions: z.array(z.object({
    source: z.object({
      type: z.enum(["field", "node_mutation", "operation"]),
      key: z.string().min(1),
    }),
    targets: z.array(z.object({
      node: z.string().min(1),
      action: z.enum(["patch", "mark_stale", "rehydrate_if_active", "remove"]),
    })),
  })),
});
export type CompiledDocumentRuntimePlan = z.infer<typeof CompiledDocumentRuntimePlanSchema>;

export const MutationBindingSchema = z.object({
  enabled: z.boolean(),
  kind: z.enum(["generic", "workspace", "write_facade", "handler", "lifecycle", "disabled"]),
  permissionCode: z.string().min(1).optional(),
  handler: z.string().min(1).optional(),
  disabledReason: z.string().min(1).optional(),
});
export type MutationBinding = z.infer<typeof MutationBindingSchema>;

export const CompiledFieldWriteDecisionSchema = z.object({
  name: z.string().min(1),
  columnName: z.string().min(1),
  dataType: z.string().min(1),
  origin: z.string().nullable(),
  writable: z.object({ create: z.boolean(), update: z.boolean() }),
  required: z.object({ create: z.boolean(), update: z.boolean() }),
  computed: z.boolean(),
  readOnly: z.boolean(),
  systemManaged: z.boolean(),
  systemOrigin: z.boolean(),
  writeOnce: z.boolean(),
  statusLimited: z.boolean(),
  editableInStatuses: z.array(z.string()),
});
export type CompiledFieldWriteDecision = z.infer<typeof CompiledFieldWriteDecisionSchema>;

export const EntityCapabilityManifestSchema = z.object({
  entityCode: z.string().min(1),
  renderer: z.enum(["simple", "master", "document", "ledger"]),
  mutation: z.object({
    create: MutationBindingSchema,
    update: MutationBindingSchema,
    delete: MutationBindingSchema,
    aggregate: MutationBindingSchema.optional(),
  }),
  deletionMode: z.enum(["hard_delete", "soft_delete", "archive", "retire", "lifecycle_only", "prohibited"]),
  deletionPolicy: z.object({
    retentionDays: z.number().int().positive().optional(),
    legalHoldEligible: z.boolean(),
    referenceCheck: z.boolean(),
  }).default({ legalHoldEligible: false, referenceCheck: true }),
  lifecycle: z.object({
    enabled: z.boolean(),
    statusField: z.string().min(1),
    editableStatuses: z.array(z.string()),
    states: z.record(z.string(), z.object({
      isEditable: z.boolean(),
      isCommitted: z.boolean(),
      isTerminal: z.boolean(),
      isDeletable: z.boolean(),
      isReversible: z.boolean(),
    })).default({}),
  }).optional(),
  collections: z.array(z.object({
    name: z.string().min(1),
    targetEntity: z.string().min(1),
    ownership: z.enum(["foreign_key", "polymorphic", "handler"]),
    foreignKey: z.string().min(1).optional(),
    handler: z.string().min(1).optional(),
    mutationOwner: z.enum(["generic", "workspace", "handler", "read_only"]),
    versionStrategy: z.enum(["none", "parent_version", "row_version"]).default("parent_version"),
    allowedActions: z.object({
      create: z.boolean(),
      update: z.boolean(),
      delete: z.boolean(),
      replace: z.boolean(),
    }).default({ create: true, update: true, delete: true, replace: false }),
  })),
  handlers: z.object({
    mutationHandler: z.string().min(1).optional(),
    writeFacade: z.string().min(1).optional(),
    lifecycleHandler: z.string().min(1).optional(),
    attachmentProvider: z.string().min(1).optional(),
  }),
  write: z.object({
    entityVersionId: z.string().min(1),
    fields: z.array(CompiledFieldWriteDecisionSchema),
  }),
});
export type EntityCapabilityManifest = z.infer<typeof EntityCapabilityManifestSchema>;

export const EntityArtifactKindSchema = z.enum(["catalog", "execution"]);
export const EntityCatalogStatusSchema = z.enum(["NOT_BUILT", "READY", "BLOCKED"]);
export const EntityExecutionStatusSchema = z.enum(["NOT_APPLICABLE", "NOT_BUILT", "READY", "BLOCKED"]);
export const EntityApiExposureSchema = z.enum(["NONE", "CATALOG_ONLY", "API"]);
export const EntityReadCapabilitySchema = z.enum(["none", "generic", "facade", "projection"]);
export const EntityWriteCapabilitySchema = z.enum(["none", "generic", "facade", "append_only"]);
export const EntityKeyStrategySchema = z.enum(["none", "single", "composite", "natural"]);

export const EntityVersionContractSchema = z.object({
  catalog_enabled: z.boolean(),
  api_exposure: EntityApiExposureSchema,
  backing_type: z.enum(["table", "view", "materialized_view", "external", "virtual"]),
  table_schema: z.string().min(1),
  table_name: z.string().min(1),
  key_strategy: EntityKeyStrategySchema,
  primary_key: z.string().min(1).nullable(),
  tenant_column: z.string().min(1).nullable(),
  read_capability: EntityReadCapabilitySchema,
  write_capability: EntityWriteCapabilitySchema,
  read_handler: z.string().min(1).nullable().optional(),
  write_handler: z.string().min(1).nullable().optional(),
  source_kind: z.enum(["explicit", "derived", "overlay"]),
  contract_hash: z.string().min(1).nullable().optional(),
}).strict();
export type EntityVersionContract = z.infer<typeof EntityVersionContractSchema>;

export const EntityCompilationSummarySchema = z.object({
  artifact_kind: EntityArtifactKindSchema,
  catalog_status: EntityCatalogStatusSchema,
  execution_status: EntityExecutionStatusSchema,
  catalog_hash: z.string().min(1).nullable().optional(),
  execution_hash: z.string().min(1).nullable().optional(),
  diagnostics: z.array(z.object({
    code: z.string().min(1),
    severity: z.enum(["info", "warning", "error"]),
    path: z.string().min(1).optional(),
    message: z.string().min(1),
  }).strict()).default([]),
}).strict();
export type EntityCompilationSummary = z.infer<typeof EntityCompilationSummarySchema>;

/** Catalog artifact returned for registered entities that are not API-executable. */
export const CatalogEntitySchema = z.object({
  artifact_kind: z.literal("catalog"),
  entity_id: UuidSchema,
  entity_code: z.string().min(1),
  name: z.string().min(1),
  entity_class: EntityClassSchema,
  backing_type: z.string().min(1),
  table_schema: z.string().min(1),
  table_name: z.string().min(1),
  runtime_enabled: z.boolean(),
  primary_key: z.string().nullable(),
  tenant_column: z.string().nullable(),
  fields: z.array(z.unknown()),
  relations: z.array(z.unknown()),
  diagnostics: z.array(z.object({
    entityCode: z.string(), path: z.string(), message: z.string(),
  }).strict()).default([]),
}).passthrough();
export type CatalogEntity = z.infer<typeof CatalogEntitySchema>;

export const CompiledEntitySchema = z.object({
  entity_id: UuidSchema,
  entity_code: z.string(),
  slug: z.string(),
  entity_name: z.string(),
  entity_class: EntityClassSchema,
  artifact_kind: EntityArtifactKindSchema.optional(),
  api_exposure: EntityApiExposureSchema.optional(),
  primary_key: z.string().min(1).nullable().optional(),
  tenant_column: z.string().min(1).nullable().optional(),
  read_capability: EntityReadCapabilitySchema.optional(),
  write_capability: EntityWriteCapabilitySchema.optional(),
  compilation: EntityCompilationSummarySchema.optional(),
  create_mode: z.enum(["FORM_ONLY", "EARLY_DRAFT", "DIRECT_CREATE", "SOURCE_DOCUMENT_CREATE"]).default("FORM_ONLY"),
  draft_ttl_hours: z.number().int().positive().nullable().optional(),
  numbering_strategy: z.enum(["none", "manual", "auto", "auto_or_manual", "AUTO_ON_CREATE", "AUTO_ON_PROMOTE", "AUTO_ON_SUBMIT"]).default("none"),

  table_schema: z.string(),
  table_name: z.string(),

  version_id: UuidSchema,
  version_no: z.number().int(),
  version_hash: z.string(),

  fields: z.array(EntityFieldSchema),
  field_groups: z.array(FieldGroupSchema),
  relations: z.array(CompiledEntityRelationSchema).default([]),

  display_config: z.object({
    title_field: z.string().optional(),
    subtitle_field: z.string().optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
    default_sort_field: z.string().optional(),
    default_sort_order: z.enum(["asc", "desc"]).optional(),
    list_columns: z.array(z.string()).optional(),
    /** Entity-specific list UI feature policy; security remains server-enforced. */
    list_features: EntityListFeaturesSchema.optional(),
    /** Compiler-owned runtime presentation switches; never injected by a BFF. */
    runtime_canvas_flags: z.object({
      descriptorSurfaceShell: z.boolean().optional(),
      groupedForms: z.boolean().optional(),
      operationDispatch: z.boolean().optional(),
      sharedFieldRenderers: z.boolean().optional(),
      workflowTaskActionsInHeader: z.boolean().optional(),
      disabledProcessTabs: z.boolean().optional(),
      disabledSurfaceKinds: z.array(z.string()).optional(),
    }).optional(),
    /**
     * Phase 11 #8: priority column subset shown in line grids on narrow
     * viewports (below the md breakpoint). When set, columns NOT in this
     * list are hidden via `hidden md:table-cell`. When absent the grid
     * shows all columns at every viewport size (existing behavior).
     */
    mobile_columns: z.array(z.string()).optional(),
    compact_card: z.object({
      bottom_fields: z.array(z.string()).optional(),
    }).optional(),
    /** Target-level defaults merged into field.reference_config for references to this entity. */
    reference_picker: ReferencePickerConfigSchema.optional(),
    /** Entity print/preview configuration consumed by runtime record headers and PDF rendering. */
    print_config: z.object({
      enabled: z.boolean().optional(),
    }).passthrough().optional(),
    filter_bar: z.object({
      quick_filters: z.array(z.object({
        key: z.string(),
        label: z.string(),
        icon: z.string().optional(),
        field: z.string().optional(),
        value: z.unknown().optional(),
        op: z.string().optional(),
        sort_order: z.number().int().optional(),
      })).optional(),
      sections: z.array(z.object({
        key: z.string(),
        label: z.string(),
        sort_order: z.number().int().optional(),
      })).optional(),
    }).optional(),
    /**
     * Selects the detail-page rendering strategy. Four canonical values:
     *   "master"   — runtime field-grid + tabs. Richness controlled by detail_profile.
     *   "document" — runtime document shell with process health,
     *                KPI strip, lines/distributions tabs, workflow, approvals.
     *   "ledger"   — read-only log view: no edit ops, no entity form.
     *   "simple" uses the minimal classic editor for low-complexity entities.
     */
    detail_renderer: z.enum(["master", "document", "ledger", "simple"]).optional(),
    /**
     * Controls the visual richness of the master detail page.
     * Only meaningful when detail_renderer = "master".
     *   "simple"    — field grid + tabs only; generic header.
     *   "rich"      — EntityIdentityBar + KPI rail + platform panels driven by master_config.
     *   "read-only" — same as simple but all edit operations are hidden.
     */
    detail_profile: z.enum(["simple", "rich", "read-only"]).optional(),
    /**
     * Selects the list-view rendering strategy. Default: "table".
     */
    list_renderer: z.enum(["table", "kanban", "dashboard", "spreadsheet"]).optional(),
    /**
     * Which view modes the user may switch to. Subset of the five canonical modes.
     * Default: ["table", "compact", "kanban", "dashboard", "spreadsheet"].
     */
    view_modes: z.array(z.enum(["table", "compact", "kanban", "dashboard", "spreadsheet"])).optional(),
    /**
     * Key of the lines renderer registered via registerLinesRenderer().
     * null  = entity has no line items (master records).
     * "generic" = standard invoice lines (LinesGrid).
     * "journal" = GL journal line view (JournalLinesGrid).
     * "payment" = payment allocation view (PaymentAllocationLinesGrid).
     */
    lines_renderer: z.string().nullable().optional(),
    /**
     * Document renderer family exposed as first-class metadata.
     * "default" resolves to the registered generic line renderer.
     */
    document_lines_renderer: z.enum(["default", "journal", "payment"]).optional(),
    /** Child entity code used by generic document line renderers. */
    line_entity_code: z.string().optional(),
    /**
     * Field names carrying the entity's primary lifecycle status.
     * Drives statusToIntent() calls in orchestrator/header builders.
     * Default: ["status"].
     */
    status_field_names: z.array(z.string()).optional(),
    /**
     * Document/status progress stages consumed by document header models.
     * Kept metadata-driven so documents can define their own lifecycle labels.
     */
    lifecycle_stages: z.array(z.object({
      key: z.string(),
      label: z.string(),
    })).optional(),
    /** Status/stage aliases used by document progress renderers. */
    stage_key_aliases: z.record(z.string(), z.string()).optional(),
    /**
     * Alternate intake flow codes available for this entity.
     * Each code maps to a flow definition in entity_flow.
     * Default: [] (single default flow only).
     */
    alternate_flows: z.array(z.string()).optional(),
    /**
     * First-screen intake launcher modes. This lets Meta Studio / metadata
     * seeds control cards such as Supplier, Customer, and Extension without
     * adding new front-end route files.
     */
    intake_modes: z.array(EntityIntakeModeSchema).optional(),
    /**
     * Optional redirect rule for /app/[entity]/new. This allows entities whose
     * create experience is hosted by another metadata runtime to opt in without
     * hardcoding entity names in the shell route.
     */
    create_redirect: EntityCreateRedirectSchema.optional(),
    /**
     * Field-name hints consumed by buildDocumentHeaderModel().
     * Populated for every entity with detail_renderer = "document".
     * All values are entity field *names* (not column_names).
     */
    document_header: z.object({
      /** Primary document number field, e.g. "document_no" */
      number_field: z.string(),
      /** Secondary display name/description field, e.g. "name" */
      name_field: z.string().optional(),
      /** Status field, e.g. "status" */
      status_field: z.string().optional(),
      /** Default lifecycle status when the status field is absent. */
      default_status: z.string().optional(),
      /** Status values where inline draft editing is allowed. */
      editable_statuses: z.array(z.string()).optional(),
      /** Human-readable type chip, e.g. "INVOICE" */
      type_label: z.string().optional(),
      /** Header money label, e.g. "INVOICE TOTAL" */
      total_label: z.string().optional(),
      /** Header date label, e.g. "INVOICE DATE" */
      date_label: z.string().optional(),
      /** Field holding the party display name, e.g. "supplier_name" */
      party_name_field: z.string().optional(),
      /** Field holding the party FK / id, e.g. "supplier_id" */
      party_id_field: z.string().optional(),
      /** Field holding company-code reference id for scoped documents. */
      company_code_field: z.string().optional(),
      /** Gross / total amount field, e.g. "gross_amount" */
      amount_field: z.string().optional(),
      /** Net / subtotal amount field, e.g. "net_amount" */
      subtotal_field: z.string().optional(),
      /** Tax amount field, e.g. "tax_amount" */
      tax_field: z.string().optional(),
      /** ISO currency code field, e.g. "currency_code" */
      currency_field: z.string().optional(),
      /** Document date field, e.g. "invoice_date" */
      date_field: z.string().optional(),
      /** Due / expiry date field, e.g. "due_date" */
      due_date_field: z.string().optional(),
      /** Short document title / description field shown below the doc number */
      title_field: z.string().optional(),
      /** Audit: created_at timestamp field */
      created_at_field: z.string().optional(),
      /** Audit: created_by user field */
      created_by_field: z.string().optional(),
      /** Audit: updated_at timestamp field */
      updated_at_field: z.string().optional(),
      /** Audit: updated_by user field */
      updated_by_field: z.string().optional(),
      /** Lifecycle: status_changed_at timestamp field */
      status_changed_at_field: z.string().optional(),
      /** Lifecycle: status_changed_by user field */
      status_changed_by_field: z.string().optional(),
      /** Per-stage timestamp fields, keyed by lifecycle stage key. */
      stage_date_fields: z.record(z.string(), z.array(z.string())).optional(),
      /** Status/stage aliases scoped to this header presentation. */
      stage_key_aliases: z.record(z.string(), z.string()).optional(),
      /** Legacy singleton stage timestamp field. Prefer stage_date_fields. */
      stage_date_field: z.string().optional(),
      /** Line aggregates projected onto header fields. */
      line_aggregates: z.array(z.object({
        target_field: z.string(),
        source_field: z.string().optional(),
        aggregate: z.enum(["sum", "count"]).optional(),
      })).optional(),
      /** Non-editable field overrides for document edit mode. */
      edit_excluded_fields: z.array(z.string()).optional(),
      /** Accounting status field used by generic status dimensions. */
      accounting_posted_field: z.string().optional(),
      /** Payment amount fields used by generic settlement status dimensions. */
      paid_amount_field: z.string().optional(),
      payable_amount_field: z.string().optional(),
      outstanding_amount_field: z.string().optional(),
      outstanding_label: z.string().optional(),
      /** Match/reconciliation status field used by generic status dimensions. */
      match_status_field: z.string().optional(),
      /** Document/status progress stages scoped to this header presentation. */
      lifecycle_stages: z.array(z.object({
        key: z.string(),
        label: z.string(),
      })).optional(),
    }).optional(),
    /**
     * Document-specific line editor metadata. Kept open so entity definitions
     * can describe line entity, reference targets, and editor behavior without
     * hardcoding those choices in the renderer.
     */
    journal_editor: z.record(z.string(), z.unknown()).optional(),
    /** Field name mappings for the journal line intake/edit grid (account, debit, credit, etc.). */
    journal_line_fields: z.record(z.string(), z.unknown()).optional(),
    /** Journal reference targets consumed by journal line renderers. */
    journal_reference_targets: z.array(z.record(z.string(), z.unknown())).optional(),
    /** Metadata-driven classification presentation and endpoint config. */
    commodity_classification_config: z.record(z.string(), z.unknown()).optional(),
    /** Metadata-driven procurement intake field map, keyed by display role. */
    intake_fields: z.record(z.string(), z.unknown()).optional(),
    /** Payment/allocation amount columns and labels. */
    allocation_display_labels: z.array(z.record(z.string(), z.unknown())).optional(),
    /** Payment/allocation primary column presentation. */
    allocation_primary_label: z.string().optional(),
    allocation_primary_field: z.string().optional(),
    allocation_primary_source: z.enum(["data", "line"]).optional(),
    allocation_primary_fallback_fields: z.array(z.string()).optional(),
    allocation_empty_primary_label: z.string().optional(),
    /** Accounting distribution field map and basis presentation. */
    accounting_distribution_config: z.record(z.string(), z.unknown()).optional(),
    /** Version history labels, badge variants, icons, and action state. */
    version_presentation: z.record(z.string(), z.unknown()).optional(),
    /**
     * Document line-grid metadata. The concrete line entity owns this config so
     * reusable line renderers can derive toolbar, organizer, and column behavior
     * from entity fields rather than per-document UI code.
     */
    line_grid: z.record(z.string(), z.unknown()).optional(),
    /**
     * Line-item sheet footer strip override.
     * Set on the LINE entity (e.g. purchase_invoice_line) to control which
     * money fields appear in the inline Net / Discount / Tax / Gross bar that
     * sits in LineItemComposerSheet / LineItemEditorSheet's footer.
     *
     * `amount_field`     — primary amount column (default: heuristic).
     * `currency_field`   — currency column (default: heuristic).
     * `fields`           — ordered list; each names an entity field plus its
     *                      display attributes. When omitted, the variant
     *                      resolver falls back to its built-in field list
     *                      (procure: net/discount/tax/charges/gross, etc.).
     */
    line_summary_strip: z.object({
      amount_field:    z.string().optional(),
      currency_field:  z.string().optional(),
      fields: z.array(z.object({
        name:    z.string(),
        label:   z.string().optional(),
        sign:    z.union([z.literal(1), z.literal(-1)]).optional(),
        bold:    z.boolean().optional(),
        divider: z.boolean().optional(),
      })).optional(),
    }).optional(),
    /**
     * Semantic resolver key for status-field badge coloring in list/detail views.
     * When set, overrides the heuristic detection in resolvePresentationConfig.
     * Known values: "apArStatusIntent" | "closeTaskStatusIntent" | "closeRunStatusIntent" | "kanbanStatusIntent"
     * Set this in entity engine display_config seeds.
     */
    status_resolver: z.string().optional(),

    /**
     * Status-driven action grouping consumed by buildOrchestratorFromRecord().
     * Maps status value → { primary, working, output } operation-code lists.
     * Operations not listed for the current status are demoted to "overflow".
     * Example:
     *   "draft":     { primary: ["update","submit"], working: ["cancel"] }
     *   "submitted": { primary: ["approve","deny"],  working: ["cancel"] }
     */
    action_groups: z.record(
      z.string(),
      z.object({
        primary: z.array(z.string()).optional(),
        working: z.array(z.string()).optional(),
        output:  z.array(z.string()).optional(),
      }),
    ).optional(),
    /**
     * Default status-driven action grouping for document entities. Used when
     * action_groups is absent; entity metadata can override the shared defaults.
     */
    default_action_groups_by_status: z.record(
      z.string(),
      z.object({
        primary: z.array(z.string()).optional(),
        working: z.array(z.string()).optional(),
        output:  z.array(z.string()).optional(),
      }),
    ).optional(),
    action_label_overrides: z.record(z.string(), z.string()).optional(),
    action_confirm_codes: z.array(z.string()).optional(),
    action_destructive_codes: z.array(z.string()).optional(),
    output_action_codes: z.array(z.string()).optional(),
    action_code_aliases: z.record(z.string(), z.array(z.string())).optional(),
    action_placement_groups: z.record(z.string(), z.string()).optional(),
    document_action_handlers: z.record(
      z.string(),
      z.object({
        endpoint_template: z.string().optional(),
        endpoint: z.string().optional(),
        url_template: z.string().optional(),
        url: z.string().optional(),
        route_template: z.string().optional(),
        route: z.string().optional(),
        method: z.string().optional(),
      }),
    ).optional(),

    /** Process-chain presentation and navigation metadata. */
    chain_node_labels: z.record(z.string(), z.string()).optional(),
    chain_node_short_labels: z.record(z.string(), z.string()).optional(),
    chain_status_intents: z.record(z.string(), SemanticIntentSchema).optional(),
    chain_node_route_template: z.string().optional(),
    chain_node_route_templates: z.record(z.string(), z.string()).optional(),

    /** Config for detail_profile="rich" master entities. Fully typed via MasterConfigSchema. */
    master_config: MasterConfigSchema.optional(),

    /**
     * Sheet variant selector for line-item editors.
     * "procure" selects the procurement-oriented line editor layout.
     * Absence or "generic" selects the flat generic line editor layout.
     */
    line_ui_variant: z.string().optional(),

    /**
     * Procurement line UI layout config consumed by runtime line editor surfaces.
     * Defines composer_sections, editor_tabs, reference_tab links, and the primary
     * amount field for the footer calculation.
     */
    procure_line: z.record(z.string(), z.unknown()).optional(),
  }),
  identity_config: EntityIdentityConfigSchema.optional(),
  search_config: EntitySearchConfigSchema.optional(),
  data_policy: EntityDataPolicySchema.optional(),

  feature_flags: z.object({
    create_graph: z.object({
      transactional: z.boolean().optional(),
      children: z.array(z.object({
        child_entity: z.string(),
        writer: z.string(),
        mode: z.string().optional(),
        draft_mapping: z.record(z.string(), z.string()).optional(),
      }).passthrough()).optional(),
    }).passthrough().optional(),
    // ── Core capabilities ────────────────────────────────────────
    has_attachments: z.boolean().optional(),
    has_workflow: z.boolean().optional(),
    has_lifecycle: z.boolean().optional(),
    is_importable: z.boolean().optional(),
    is_exportable: z.boolean().optional(),
    is_bulk_editable: z.boolean().optional(),
    /** Entity participates in an approval workflow (drives detail_renderer default). */
    is_approvable: z.boolean().optional(),
    /** Entity has a payment schedule / settlement tracking. */
    has_payment_schedule: z.boolean().optional(),
    /** Entity has budget impact / availability check. */
    has_budget_impact: z.boolean().optional(),
    /** Entity has related upstream/downstream documents. */
    has_related_documents: z.boolean().optional(),
    /** Entity records form a parent-child tree (e.g. org units, site hierarchy, category tree). */
    has_hierarchy: z.boolean().optional(),
    /** Entity supports print / PDF output. */
    print: z.boolean().optional(),
    /** Payables | receivables | treasury | etc. — used for context-sensitive UI. */
    document_category: z.string().optional(),

    // ── Spec-canonical tab-driving flags (RUNTIME_ROUTING_SPEC §4) ────────────
    /** Threaded comments panel. */
    comments_enabled: z.boolean().optional(),

    /** Domain event log / audit trail panel. */
    event_history: z.boolean().optional(),

    /** Version chain + compare subroutes. */
    version_control: z.boolean().optional(),

    /** Child line-item grid tab. */
    has_lines: z.boolean().optional(),

    /** Accounting distribution grid tab. */
    has_accounting_distribution: z.boolean().optional(),

    // ── New tab-driving flags (no legacy aliases) ─────────────────────────────
    /** Work items assigned to this record. */
    has_tasks: z.boolean().optional(),
    /** Notification subscribers. */
    has_watchers: z.boolean().optional(),
    /** Policy bindings / business rules. */
    has_rules: z.boolean().optional(),
    /** Webhook events / external sync panel. */
    has_integrations: z.boolean().optional(),
    /** Per-record validation results. */
    quality_checks: z.boolean().optional(),
    /** Record-scoped report links. */
    record_reports: z.boolean().optional(),
    /** SLA target in hours for stage-level SLA tracking (default: 24). */
    sla_target_hours: z.number().optional(),
    /**
     * Entity supports AI-driven line classification (spend category, GL account suggestion).
     * Drives runtime line classification UI and classify endpoint calls.
     * Set true for AP invoice entities in entity engine seeds.
     */
    has_ai_classification: z.boolean().optional(),
    /**
     * Enables AI-assisted line intake instead of inline row add.
     * Set true for AP invoice entities in entity engine seeds.
     */
    has_line_composer: z.boolean().optional(),
    /**
     * Entity records are scoped to a company_code — reference searches must filter by it.
     * Applies to dimension entities: cost_center, profit_center, project, site.
     * Set true in entity engine seeds for DIMENSION-class entities with company scope.
     */
    is_company_scoped: z.boolean().optional(),
    /**
     * Entity detail page is permanently read-only — profile fields, child tabs, and Add buttons
     * are all suppressed. Only platform panels (comments, attachments) remain interactive.
     * Set true for master data entities that are managed through dedicated intake flows.
     */
    is_readonly: z.boolean().optional(),
    is_hidden: z.boolean().optional(),
    line_references: z.boolean().optional(),
    catalog_feature_enabled: z.boolean().optional(),
    catalog_enabled: z.boolean().optional(),
    catalog_items_enabled: z.boolean().optional(),
    has_catalog_items: z.boolean().optional(),
    has_catalog: z.boolean().optional(),
    requires_owner_type_scope: z.boolean().optional(),
    owner_type_column: z.string().optional(),
    default_owner_type_scope: z.string().optional(),
    default_owner_type: z.string().optional(),
    singleton: z.boolean().optional(),
    pii_bearing: z.boolean().optional(),
    allow_address: z.boolean().optional(),
    allow_contact: z.boolean().optional(),
    has_roles: z.boolean().optional(),
    role_entity: z.string().optional(),
    party_category: z.string().optional(),
    append_only_after_submission: z.boolean().optional(),
    reference_picker: z.boolean().optional(),
    line_editor: z.boolean().optional(),
    posting_controlled: z.boolean().optional(),
    dimension_controlled: z.boolean().optional(),
    replacement_for: z.string().optional(),
  }),

  governance_level: z.string(),
  security_tier: z.string(),
  mutability: z.enum(["mutable", "immutable"]).optional(),
  document_runtime_plan: CompiledDocumentRuntimePlanSchema.optional(),
  capability_manifest: EntityCapabilityManifestSchema,
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
export const OperationActionGroupSchema = z.enum(["lifecycle", "record", "general", "workflow_task"]);
export const OperationIntentSchema = z.enum(["neutral", "success", "warning", "danger"]);
export const OperationSourceSchema = z.enum(["entity_operation", "lifecycle_transition", "workflow_task"]);
export const PermissionDecisionSchema = z.enum(["allow", "deny", "not_found", "not_in_plan", "addon_required", "not_granted"]);

export const OperationSelectionConfigSchema = z.object({
  enabled: z.boolean().default(false),
  cardinality: z.enum(["single", "multiple", "both"]),
  group: z.enum(["item", "components", "accounting", "clipboard", "danger"]),
  presentation: z.enum(["action", "menu_item"]).default("action"),
  bulk_strategy: z.enum(["none", "bulk_patch", "per_record_atomic", "management_matrix"]).default("none"),
  preserve_selection_on_success: z.boolean().default(false),
}).passthrough();
export type OperationSelectionConfig = z.infer<typeof OperationSelectionConfigSchema>;

export const EntityOperationLifecycleTransitionSchema = z.object({
  transition_id: UuidSchema.optional(),
  lifecycle_id: UuidSchema.optional(),
  from_state: z.string(),
  to_state: z.string(),
  requires_reason: z.boolean().optional(),
  requires_confirmation: z.boolean().optional(),
}).passthrough();

export const EntityOperationSchema = z.object({
  id: UuidSchema,
  entity_name: z.string(),
  permission_code: z.string(),
  surface: OperationSurfaceSchema,
  placement: OperationPlacementSchema,
  handler_type: OperationHandlerTypeSchema,
  handler_target: z.string().nullable(),
  execution_target: z.string()
    .regex(/^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/)
    .nullable()
    .optional(),
  is_record_required: z.boolean(),
  sort_order: z.number().int(),
  label_override: z.string().nullable(),
  icon_override: z.string().nullable(),
  is_enabled: z.boolean(),
  disabled_reason: z.string().nullable().optional(),
  action_group: OperationActionGroupSchema.optional(),
  intent: OperationIntentSchema.optional(),
  requires_confirmation: z.boolean().optional(),
  requires_reason: z.boolean().optional(),
  source: OperationSourceSchema.optional(),
  permission_decision: PermissionDecisionSchema.optional(),
  selection_config: OperationSelectionConfigSchema.nullable().optional(),
  lifecycle_transitions: z.array(EntityOperationLifecycleTransitionSchema).optional(),
}).passthrough();
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
  overlay_hash: z.string().min(64),
  base_compiled_hash: z.string().min(64),
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

// ═══════════════════════════════════════════════════════════════
// DETAIL TAB — canonical tab identifiers (RUNTIME_ROUTING_SPEC §3)
// ═══════════════════════════════════════════════════════════════

/**
 * All possible tab slots in the detail page tab bar.
 * "overview" is always present.
 * All others are driven by feature_flags or class profile defaults.
 * Source of truth: RUNTIME_ROUTING_SPEC §3.1.
 */
export const DetailTabSchema = z.enum([
  "overview",       // always — primary field grid
  "lines",          // child line-item grid
  "distributions",  // accounting distribution grid
  "workflow",       // inline approval stages
  "attachments",    // file list
  "versions",       // version timeline
  "comments",       // threaded comments
  "approvals",      // approval history
  "tasks",          // work items
  "watchers",       // notification subscribers
  "rules",          // policy / business-rule bindings
  "integrations",   // webhook / external-sync events
  "quality",        // per-record validation results
  "reports",        // record-scoped report links
  "events",         // domain event log / audit trail
]);
export type DetailTab = z.infer<typeof DetailTabSchema>;

/**
 * Canonical display order for detail-page tabs (RUNTIME_ROUTING_SPEC §3.2).
 * resolveTabs() sorts its output against this array so the rendered tab bar
 * is deterministic regardless of which feature flags or overlays are active.
 * Tabs not present in this list sort to the end in insertion order.
 */
export const CANONICAL_TAB_ORDER: readonly DetailTab[] = [
  "overview",
  "lines",
  "distributions",
  "workflow",
  "attachments",
  "versions",
  "comments",
  "approvals",
  "tasks",
  "watchers",
  "rules",
  "integrations",
  "quality",
  "reports",
  "events",
] as const;

// ═══════════════════════════════════════════════════════════════
// ENTITY CLASS PROFILE — per-class tab/layout defaults
// Source: control.entity_class_profile
// ═══════════════════════════════════════════════════════════════

export const EntityClassProfileSchema = z.object({
  entity_class: EntityClassSchema,
  /** Tab slots that are on by default for all entities of this class. */
  default_tabs: z.array(DetailTabSchema).optional(),
  /** Preferred detail page layout hint for this class. */
  default_layout: z.string().optional(),
});
export type EntityClassProfile = z.infer<typeof EntityClassProfileSchema>;

// ═══════════════════════════════════════════════════════════════
// OVERLAY TAB CHANGE — tenant-level tab customisation
// Carried inside snapshot.entity_compiled_overlay compiled_json.
// ═══════════════════════════════════════════════════════════════

export const OverlayTabChangeSchema = z.object({
  tab: DetailTabSchema,
  operation: z.enum(["add", "remove"]),
});
export type OverlayTabChange = z.infer<typeof OverlayTabChangeSchema>;
