export type ContractScope = "entity" | "entity_field";

export type ContractOwner =
  | "presentation"
  | "authorization"
  | "identity"
  | "search"
  | "governance"
  | "validation"
  | "value_semantics"
  | "lookup"
  | "server_only";

export type ContractPhase =
  | "active"
  | "controlled"
  | "grandfathered"
  | "deprecated"
  | "reserved"
  | "server_only";

export type CompileTarget =
  | "client"
  | "client_stripped"
  | "server_only"
  | "omit";

export type UnknownKeyPolicy = "reject" | "warn" | "allow";

export type UiControl =
  | "grouped_boolean_chips"
  | "field_picker_multi"
  | "field_picker_single"
  | "surface_checkbox_group"
  | "filter_config_form"
  | "reference_config_form"
  | "validation_rules_builder"
  | "money_config_form"
  | "lookup_config_form"
  | "type_aware_input"
  | "display_hints_form"
  | "classification_select"
  | "display_config_form"
  | "contract_inspector"
  | "none";

export interface DeprecatedKey {
  key: string;
  reason: string;
  migratesTo: string;
  phase: number;
}

export interface MigrationSpec {
  target_property: string;
  key_mappings?: Record<string, string>;
  phase: number;
  blocking: boolean;
  notes: string;
}

export interface PropertyContractDefinition {
  property: string;
  scope: ContractScope;
  owner: ContractOwner;
  phase: ContractPhase;
  compileTarget: CompileTarget;
  unknownKeyPolicy: UnknownKeyPolicy;
  allowedKeys: string[];
  aliases: string[];
  deprecatedKeys: DeprecatedKey[];
  uiControl: UiControl;
  uiLabel: string;
  uiDescription: string;
  uiTab: string;
  migration?: MigrationSpec;
  runtimeConsumers: string[];
}

export const ENTITY_CONTRACT_DEFINITIONS: PropertyContractDefinition[] = [
  {
    property: "display_config",
    scope: "entity",
    owner: "presentation",
    phase: "active",
    compileTarget: "client_stripped",
    unknownKeyPolicy: "warn",
    allowedKeys: [],
    aliases: [],
    deprecatedKeys: [],
    uiControl: "display_config_form",
    uiLabel: "Layout and presentation",
    uiDescription: "Controls list, detail, document, action, and navigation presentation.",
    uiTab: "Layout",
    runtimeConsumers: [
      "packages/shared/runtime-domain/runtime-list/src/core/listPresentation.ts",
      "packages/shared/runtime-domain/runtime-canvas/src/index.tsx",
      "packages/shared/runtime-domain/runtime-canvas/src/surfaces/surface-shell.tsx",
    ],
  },
  {
    property: "feature_flags",
    scope: "entity",
    owner: "presentation",
    phase: "active",
    compileTarget: "client",
    unknownKeyPolicy: "reject",
    allowedKeys: [
      "has_attachments",
      "has_workflow",
      "has_lifecycle",
      "is_importable",
      "is_exportable",
      "is_bulk_editable",
      "is_approvable",
      "is_readonly",
      "records_api_disabled",
      "generic_runtime_disabled",
      "is_hidden",
      "comments_enabled",
      "event_history",
      "version_control",
      "has_lines",
      "has_accounting_distribution",
      "has_tasks",
      "has_watchers",
      "has_rules",
      "has_integrations",
      "quality_checks",
      "record_reports",
      "sla_target_hours",
      "has_payment_schedule",
      "has_budget_impact",
      "has_related_documents",
      "has_hierarchy",
      "print",
      "has_ai_classification",
      "has_line_composer",
      "line_references",
      "catalog_feature_enabled",
      "catalog_enabled",
      "catalog_items_enabled",
      "has_catalog_items",
      "has_catalog",
      "document_category",
      "requires_owner_type_scope",
      "owner_type_column",
      "default_owner_type_scope",
      "default_owner_type",
      "is_company_scoped",
      "singleton",
      "pii_bearing",
      "allow_address",
      "allow_contact",
      "has_roles",
      "role_entity",
      "party_category",
      "append_only_after_submission",
      "reference_picker",
      "line_editor",
      "posting_controlled",
      "dimension_controlled",
      "replacement_for",
    ],
    aliases: [],
    deprecatedKeys: [],
    uiControl: "grouped_boolean_chips",
    uiLabel: "Capabilities",
    uiDescription: "Enables runtime capabilities such as workflow, lifecycle, lines, comments, and bulk actions.",
    uiTab: "Capabilities",
    runtimeConsumers: [
      "packages/shared/runtime-domain/runtime-contracts/src/compiler.ts",
      "packages/shared/runtime-domain/runtime-canvas/src/index.tsx",
      "packages/shared/runtime-domain/runtime-canvas/src/record/runtime-record-workspace.tsx",
    ],
  },
  {
    property: "data_policy",
    scope: "entity",
    owner: "governance",
    phase: "controlled",
    compileTarget: "client_stripped",
    unknownKeyPolicy: "warn",
    allowedKeys: ["classification", "pii_fields", "retention_days", "legal_hold_eligible", "anonymize_on_delete"],
    aliases: [],
    deprecatedKeys: [],
    uiControl: "classification_select",
    uiLabel: "Data policy",
    uiDescription: "Documents classification, PII, retention, and deletion posture for admins.",
    uiTab: "Governance",
    runtimeConsumers: [],
  },
  {
    property: "identity_config",
    scope: "entity",
    owner: "identity",
    phase: "active",
    compileTarget: "client_stripped",
    unknownKeyPolicy: "warn",
    allowedKeys: [
      "primary_key_field",
      "business_key_fields",
      "natural_key_fields",
      "numbering",
      "identity_via",
      "list_entity_code",
      "parent",
      "duplicate_check",
      "replacement",
    ],
    aliases: [],
    deprecatedKeys: [],
    uiControl: "field_picker_multi",
    uiLabel: "Identity",
    uiDescription: "Defines primary, business, natural, parent, and duplicate-check identity fields.",
    uiTab: "Identity",
    runtimeConsumers: [
      "server/packages/services/records/routes/records.route.ts",
      "packages/shared/runtime-domain/runtime-contracts/src/compiler.ts",
      "apps/neon/lib/server/meta-entity-runtime.ts",
    ],
  },
  {
    property: "search_config",
    scope: "entity",
    owner: "search",
    phase: "active",
    compileTarget: "client",
    unknownKeyPolicy: "reject",
    allowedKeys: ["enabled", "fields", "rank", "min_query_length", "operator"],
    aliases: [],
    deprecatedKeys: [],
    uiControl: "field_picker_multi",
    uiLabel: "Search",
    uiDescription: "Controls searchable fields, minimum query length, and ranking.",
    uiTab: "Search",
    runtimeConsumers: [
      "packages/shared/runtime-domain/runtime-list/src/core/search.ts",
      "packages/shared/runtime-domain/runtime-list/src/core/presenterProps.ts",
    ],
  },
];

export const ENTITY_FIELD_CONTRACT_DEFINITIONS: PropertyContractDefinition[] = [
  {
    property: "reference_config",
    scope: "entity_field",
    owner: "value_semantics",
    phase: "active",
    compileTarget: "client_stripped",
    unknownKeyPolicy: "warn",
    allowedKeys: [
      "target_entity",
      "target_field",
      "display_field",
      "label_field",
      "code_field",
      "description_field",
      "navigation_field",
      "record_id_field",
      "show_code",
      "show_description",
      "show_view_action",
      "picker",
    ],
    aliases: ["ref_entity", "ref_hint", "entity", "entity_code", "targetEntity", "refEntity"],
    deprecatedKeys: [],
    uiControl: "reference_config_form",
    uiLabel: "Reference",
    uiDescription: "Defines target entity, display fields, code fields, and picker presentation.",
    uiTab: "Reference",
    runtimeConsumers: [
      "packages/shared/runtime-domain/runtime-canvas/src/fields/registry.tsx",
      "packages/shared/runtime-domain/runtime-canvas/src/edit/runtime-edit-form.tsx",
      "packages/shared/runtime-domain/runtime-shared/src/entity-search/*.tsx",
      "apps/neon/app/api/runtime/v1/entities/[entity]/fields/[field]/options/route.ts",
    ],
  },
  {
    property: "money_config",
    scope: "entity_field",
    owner: "value_semantics",
    phase: "active",
    compileTarget: "client_stripped",
    unknownKeyPolicy: "warn",
    allowedKeys: [
      "currency_source",
      "currency_field",
      "currency_code",
      "currency_code_position",
      "minor_units",
      "fallback_minor_units",
      "constant_currency",
      "code_position",
      "currency_position",
    ],
    aliases: ["constant_currency", "code_position", "currency_position"],
    deprecatedKeys: [],
    uiControl: "money_config_form",
    uiLabel: "Money semantics",
    uiDescription: "Defines currency source, currency field, fixed currency, display position, and minor units.",
    uiTab: "Money Semantics",
    runtimeConsumers: [
      "packages/shared/runtime-domain/runtime-shared/src/core/format.ts",
      "packages/shared/runtime-domain/runtime-canvas/src/fields/runtime-field-value-view.tsx",
    ],
  },
  {
    property: "filter_config",
    scope: "entity_field",
    owner: "presentation",
    phase: "active",
    compileTarget: "client",
    unknownKeyPolicy: "reject",
    allowedKeys: [
      "section_key",
      "section_label",
      "section_order",
      "kind",
      "control_type",
      "operators",
      "placeholder",
      "quick_filter",
      "quick_label",
      "quick_order",
      "value_label_map",
    ],
    aliases: [],
    deprecatedKeys: [],
    uiControl: "filter_config_form",
    uiLabel: "Filter configuration",
    uiDescription: "Controls filter drawer section, kind, operators, placeholder, quick filter behavior, and labels.",
    uiTab: "Filters",
    runtimeConsumers: [
      "packages/shared/runtime-domain/runtime-list/src/core/columns.ts",
      "packages/shared/runtime-domain/runtime-list/src/islands/organize/FilterControl.tsx",
    ],
  },
  {
    property: "ui_hint",
    scope: "entity_field",
    owner: "presentation",
    phase: "active",
    compileTarget: "client_stripped",
    unknownKeyPolicy: "warn",
    allowedKeys: [
      "display",
      "copy",
      "copy_behavior",
      "filter",
      "group_key",
      "visible_when",
      "placeholder",
      "tooltip",
      "rows",
      "variant",
      "input_mode",
      "pattern",
      "icon",
      "prefix",
      "suffix",
      "hide_label",
      "autocomplete",
    ],
    aliases: [],
    deprecatedKeys: [
      { key: "filter", reason: "Filter metadata is owned by filter_config.", migratesTo: "filter_config", phase: 4 },
      { key: "copy_behavior", reason: "Copy behavior is nested under ui_hint.copy.behavior.", migratesTo: "ui_hint.copy.behavior", phase: 4 },
      { key: "group_key", reason: "Grouping is a top-level EntityField column.", migratesTo: "group_key", phase: 4 },
      { key: "visible_when", reason: "Dynamic visibility is nested under ui_hint.display.visible_when.", migratesTo: "ui_hint.display.visible_when", phase: 4 },
    ],
    uiControl: "display_hints_form",
    uiLabel: "Display hints",
    uiDescription: "Controls placeholder, tooltip, icons, prefixes, suffixes, static hiding, and dynamic visibility.",
    uiTab: "Display",
    migration: {
      target_property: "ui_hint",
      key_mappings: {
        filter: "filter_config",
        copy_behavior: "ui_hint.copy.behavior",
        group_key: "group_key",
        visible_when: "ui_hint.display.visible_when",
      },
      phase: 4,
      blocking: true,
      notes: "Legacy flat hints are normalized by the compiler and removed from authored metadata during migration.",
    },
    runtimeConsumers: [
      "packages/shared/runtime-domain/runtime-shared/src/meta-entity/field-visibility.ts",
      "packages/shared/runtime-domain/runtime-canvas/src/surfaces/fields-surface.tsx",
    ],
  },
  {
    property: "editability",
    scope: "entity_field",
    owner: "authorization",
    phase: "active",
    compileTarget: "client",
    unknownKeyPolicy: "warn",
    allowedKeys: ["editable", "editable_in", "editable_when"],
    aliases: [],
    deprecatedKeys: [],
    uiControl: "surface_checkbox_group",
    uiLabel: "Edit rules",
    uiDescription: "Controls whether a field is editable and on which editing surfaces.",
    uiTab: "Edit Rules",
    runtimeConsumers: [
      "packages/shared/runtime-domain/runtime-shared/src/meta-entity/field-editability.ts",
      "packages/shared/runtime-domain/runtime-canvas/src/edit/runtime-descriptor-edit-workspace.tsx",
      "server/packages/services/records/routes/entity-mutation-guard.ts",
    ],
  },
  {
    property: "lookup_config",
    scope: "entity_field",
    owner: "lookup",
    phase: "active",
    compileTarget: "client_stripped",
    unknownKeyPolicy: "warn",
    allowedKeys: ["filters", "dependent_filter", "depends_on", "dependency", "value_case", "value_label_map"],
    aliases: ["depends_on", "dependency"],
    deprecatedKeys: [],
    uiControl: "lookup_config_form",
    uiLabel: "Lookup behavior",
    uiDescription: "Defines static filters, dependent lookup filters, and value mapping.",
    uiTab: "Reference",
    migration: {
      target_property: "lookup_config",
      key_mappings: {
        depends_on: "lookup_config.dependent_filter",
        dependency: "lookup_config.dependent_filter",
      },
      phase: 3,
      blocking: true,
      notes: "Dependent lookup aliases are normalized to dependent_filter on write/compile.",
    },
    runtimeConsumers: [
      "packages/shared/runtime-domain/runtime-shared/src/entity-search/lookupConfig.ts",
    ],
  },
  {
    property: "validation_rules",
    scope: "entity_field",
    owner: "validation",
    phase: "active",
    compileTarget: "client",
    unknownKeyPolicy: "warn",
    allowedKeys: [
      "max_length",
      "min_length",
      "min_value",
      "max_value",
      "pattern",
      "allowed_values",
      "cross_field",
      "ref_entity",
    ],
    aliases: [],
    deprecatedKeys: [
      { key: "ref_entity", reason: "Reference target is owned by reference_config.target_entity.", migratesTo: "reference_config.target_entity", phase: 4 },
    ],
    uiControl: "validation_rules_builder",
    uiLabel: "Validation",
    uiDescription: "Controls scalar limits, pattern constraints, allowed values, and cross-field validation rules.",
    uiTab: "Validation",
    migration: {
      target_property: "reference_config",
      key_mappings: {
        ref_entity: "reference_config.target_entity",
      },
      phase: 4,
      blocking: true,
      notes: "Reference keys are removed from validation_rules after migration.",
    },
    runtimeConsumers: [
      "packages/shared/runtime-domain/runtime-shared/src/meta-entity/field-validation.ts",
      "packages/shared/runtime-domain/runtime-canvas/src/edit/runtime-descriptor-edit-workspace.tsx",
      "packages/shared/runtime-domain/runtime-shared/src/validation/metaFieldValidation.ts",
    ],
  },
  {
    property: "default_value",
    scope: "entity_field",
    owner: "value_semantics",
    phase: "active",
    compileTarget: "client",
    unknownKeyPolicy: "allow",
    allowedKeys: [],
    aliases: [],
    deprecatedKeys: [],
    uiControl: "type_aware_input",
    uiLabel: "Default value",
    uiDescription: "Type-aware default value for new records.",
    uiTab: "Basics",
    runtimeConsumers: [
      "packages/shared/runtime-domain/runtime-canvas/src/edit/runtime-edit-form.tsx",
      "packages/shared/runtime-domain/runtime-canvas/src/index.tsx",
    ],
  },
  {
    property: "enum_config",
    scope: "entity_field",
    owner: "value_semantics",
    phase: "grandfathered",
    compileTarget: "client_stripped",
    unknownKeyPolicy: "warn",
    allowedKeys: ["values", "options"],
    aliases: [],
    deprecatedKeys: [],
    uiControl: "contract_inspector",
    uiLabel: "Inline enum",
    uiDescription: "Grandfathered inline enum values; new authoring should use enum_domain_code.",
    uiTab: "Reference",
    runtimeConsumers: [],
  },
  {
    property: "json_config",
    scope: "entity_field",
    owner: "value_semantics",
    phase: "reserved",
    compileTarget: "omit",
    unknownKeyPolicy: "allow",
    allowedKeys: [],
    aliases: [],
    deprecatedKeys: [],
    uiControl: "contract_inspector",
    uiLabel: "JSON config",
    uiDescription: "Reserved until a JSON editor and runtime semantics exist.",
    uiTab: "Inspector",
    runtimeConsumers: [],
  },
  {
    property: "visibility",
    scope: "entity_field",
    owner: "presentation",
    phase: "deprecated",
    compileTarget: "omit",
    unknownKeyPolicy: "allow",
    allowedKeys: [],
    aliases: [],
    deprecatedKeys: [],
    uiControl: "contract_inspector",
    uiLabel: "Legacy visibility",
    uiDescription: "Deprecated. Static hiding uses ui_hint.display.hide_in; dynamic visibility uses ui_hint.display.visible_when.",
    uiTab: "Inspector",
    migration: {
      target_property: "ui_hint",
      key_mappings: {
        hide_in: "ui_hint.display.hide_in",
        visible_when: "ui_hint.display.visible_when",
      },
      phase: 4,
      blocking: true,
      notes: "Legacy visibility is normalized as a compatibility input and omitted from compiled client output.",
    },
    runtimeConsumers: [],
  },
  {
    property: "constraints",
    scope: "entity_field",
    owner: "server_only",
    phase: "server_only",
    compileTarget: "omit",
    unknownKeyPolicy: "allow",
    allowedKeys: [
      "max_length",
      "min_length",
      "min_value",
      "max_value",
      "pattern",
      "allowed_values",
      "unique",
      "not_null",
      "check",
    ],
    aliases: [],
    deprecatedKeys: [
      { key: "max_length", reason: "Scalar limits are owned by validation_rules.", migratesTo: "validation_rules.max_length", phase: 4 },
      { key: "min_length", reason: "Scalar limits are owned by validation_rules.", migratesTo: "validation_rules.min_length", phase: 4 },
      { key: "min_value", reason: "Scalar limits are owned by validation_rules.", migratesTo: "validation_rules.min_value", phase: 4 },
      { key: "max_value", reason: "Scalar limits are owned by validation_rules.", migratesTo: "validation_rules.max_value", phase: 4 },
      { key: "pattern", reason: "Runtime patterns are owned by validation_rules.", migratesTo: "validation_rules.pattern", phase: 4 },
      { key: "allowed_values", reason: "Runtime allowed values are owned by validation_rules.", migratesTo: "validation_rules.allowed_values", phase: 4 },
    ],
    uiControl: "none",
    uiLabel: "DB constraints",
    uiDescription: "Server/DB constraints only. Not authored through the runtime UI.",
    uiTab: "Inspector",
    runtimeConsumers: [],
  },
  {
    property: "datetime_config",
    scope: "entity_field",
    owner: "value_semantics",
    phase: "reserved",
    compileTarget: "omit",
    unknownKeyPolicy: "allow",
    allowedKeys: [],
    aliases: [],
    deprecatedKeys: [],
    uiControl: "contract_inspector",
    uiLabel: "Date/time config",
    uiDescription: "Reserved until date/time-specific metadata semantics are implemented.",
    uiTab: "Inspector",
    runtimeConsumers: [],
  },
  {
    property: "lookup_profile",
    scope: "entity_field",
    owner: "lookup",
    phase: "deprecated",
    compileTarget: "omit",
    unknownKeyPolicy: "allow",
    allowedKeys: ["variant", "density", "max_items"],
    aliases: [],
    deprecatedKeys: [],
    uiControl: "contract_inspector",
    uiLabel: "Legacy lookup profile",
    uiDescription: "Deprecated. Picker presentation belongs under reference_config.picker.",
    uiTab: "Inspector",
    migration: {
      target_property: "reference_config",
      key_mappings: {
        variant: "reference_config.picker.variant",
        density: "reference_config.picker.density",
        max_items: "reference_config.picker.page_size",
      },
      phase: 4,
      blocking: true,
      notes: "Legacy lookup profile keys migrate into reference_config.picker.",
    },
    runtimeConsumers: [],
  },
  {
    property: "collection_behavior",
    scope: "entity_field",
    owner: "value_semantics",
    phase: "reserved",
    compileTarget: "omit",
    unknownKeyPolicy: "allow",
    allowedKeys: [],
    aliases: [],
    deprecatedKeys: [],
    uiControl: "contract_inspector",
    uiLabel: "Collection behavior",
    uiDescription: "Reserved until relation/flow metadata owns collection behavior.",
    uiTab: "Inspector",
    runtimeConsumers: [],
  },
  {
    property: "compute_expr",
    scope: "entity_field",
    owner: "server_only",
    phase: "server_only",
    compileTarget: "server_only",
    unknownKeyPolicy: "allow",
    allowedKeys: [],
    aliases: [],
    deprecatedKeys: [],
    uiControl: "none",
    uiLabel: "Compute expression",
    uiDescription: "Server/compiler-owned expression. Never edited in the runtime UI.",
    uiTab: "Inspector",
    runtimeConsumers: [],
  },
];

export const PROPERTY_CONTRACT_DEFINITIONS: PropertyContractDefinition[] = [
  ...ENTITY_CONTRACT_DEFINITIONS,
  ...ENTITY_FIELD_CONTRACT_DEFINITIONS,
];

export function contractDefinitionsForScope(scope: ContractScope): PropertyContractDefinition[] {
  return PROPERTY_CONTRACT_DEFINITIONS.filter((entry) => entry.scope === scope);
}

export function findPropertyContractDefinition(
  scope: ContractScope,
  property: string,
): PropertyContractDefinition | undefined {
  return PROPERTY_CONTRACT_DEFINITIONS.find((entry) => entry.scope === scope && entry.property === property);
}
