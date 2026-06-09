import type {
  EntityField,
  EntityOperation,
  FieldDataType,
} from "@athyper/api-contracts/metadata";
import type { MetaEntityField, MetaEntityOperation } from "@athyper/runtime-contracts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export function assertUuidOrNil(key: string): string {
  return UUID_RE.test(key) ? key : NIL_UUID;
}

const VALID_DATA_TYPES = new Set<string>([
  "string",
  "text",
  "integer",
  "bigint",
  "decimal",
  "numeric",
  "boolean",
  "uuid",
  "date",
  "datetime",
  "timestamptz",
  "json",
  "jsonb",
  "enum",
  "reference",
  "money",
  "tsvector",
  "text_array",
  "uuid_array",
  "int_array",
  "jsonb_array",
  "lifecycle_state",
]);

export function normalizeDataType(dataType: string): FieldDataType {
  return VALID_DATA_TYPES.has(dataType) ? (dataType as FieldDataType) : "string";
}

export function normalizeCardinality(cardinality: string | undefined): "one" | "many" | "zero_or_one" {
  if (cardinality === "many") return "many";
  if (cardinality === "zero_or_one") return "zero_or_one";
  return "one";
}

export function normalizeOrigin(origin: string | undefined): "system" | "standard" | "business" {
  if (origin === "system" || origin === "standard" || origin === "business") return origin;
  return "business";
}

export function adaptField(field: MetaEntityField): EntityField {
  return {
    id: assertUuidOrNil(field.key),
    name: field.name,
    column_name: field.columnName,
    label: field.label,
    description: null,

    data_type: normalizeDataType(field.dataType),
    ui_type: field.uiType ?? null,
    format: field.format ?? null,
    unit: field.unit ?? null,

    cardinality: normalizeCardinality(field.cardinality),
    origin: normalizeOrigin(field.origin),

    is_required: field.isRequired,
    is_readonly: field.isReadOnly,
    is_unique: field.isUnique,
    unique_scope: null,
    is_searchable: field.isSearchable,
    is_filterable: field.isFilterable,
    is_sortable: field.isSortable,
    is_groupable: field.isGroupable,
    is_aggregatable: field.isAggregatable,
    is_pii: field.isPii ?? false,
    is_computed: field.isComputed ?? false,
    is_write_once: field.isWriteOnce ?? false,

    default_value: field.defaultValue ?? null,
    compute_expr: null,
    validation_rules: (field.validation as EntityField["validation_rules"]) ?? null,
    enum_config: null,
    enum_domain_code: field.enumDomainCode ?? null,

    reference_config: (field.referenceConfig as EntityField["reference_config"]) ?? null,
    money_config: null,
    json_config: null,
    datetime_config: null,

    sort_order: field.order,
    group_key: field.groupKey ?? null,
    ui_hint: null,
    visibility: (field.visibility as EntityField["visibility"]) ?? null,
    editability: (field.editability as EntityField["editability"]) ?? null,
    lookup_config: (field.lookupConfig as EntityField["lookup_config"]) ?? null,
    lookup_profile: (field.lookupProfile as EntityField["lookup_profile"]) ?? null,
    filter_config: (field.filterConfig as EntityField["filter_config"]) ?? null,
    collection_behavior: null,
    constraints: (field.constraints as EntityField["constraints"]) ?? null,
    i18n_key: null,
  };
}

export function adaptOperation(operation: MetaEntityOperation): EntityOperation {
  return {
    id: assertUuidOrNil(operation.key),
    entity_name: "",
    permission_code: operation.permissionCode,
    surface: operation.surface,
    placement: operation.placement,
    handler_type: operation.handlerType,
    handler_target: operation.handlerTarget ?? null,
    is_record_required: operation.isRecordRequired,
    sort_order: operation.order,
    label_override: operation.label ?? null,
    icon_override: operation.icon ?? null,
    is_enabled: operation.enabled,
    disabled_reason: operation.disabledReason ?? null,
    action_group: operation.actionGroup as EntityOperation["action_group"],
    intent: operation.intent as EntityOperation["intent"],
    requires_confirmation: operation.requiresConfirmation,
    requires_reason: operation.requiresReason,
    source: operation.source as EntityOperation["source"],
    permission_decision: undefined,
    lifecycle_transitions: operation.lifecycleTransitions?.map((transition) => ({
      transition_id: transition.transitionId,
      lifecycle_id: transition.lifecycleId,
      from_state: transition.fromState,
      to_state: transition.toState,
      requires_reason: transition.requiresReason,
      requires_confirmation: transition.requiresConfirmation,
    })),
  };
}
