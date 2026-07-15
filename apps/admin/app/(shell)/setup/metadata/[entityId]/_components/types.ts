export interface EntityField {
  id: string;
  name: string;
  column_name: string | null;
  label: string | null;
  description?: string | null;
  data_type: string;
  ui_type: string | null;
  format?: string | null;
  unit?: string | null;
  cardinality: string | null;
  origin: string;
  is_required: boolean;
  is_unique?: boolean;
  unique_scope?: string | null;
  is_searchable: boolean;
  is_filterable: boolean;
  is_sortable: boolean;
  is_groupable?: boolean;
  is_aggregatable?: boolean;
  is_pii?: boolean;
  is_computed?: boolean;
  is_write_once?: boolean;
  is_readonly?: boolean;
  is_read_only?: boolean;
  sort_order: number;
  group_key: string | null;
  ui_hint: Record<string, unknown> | null;
  editability: Record<string, unknown> | string | null;
  enum_config: Record<string, unknown> | null;
  enum_domain_code: string | null;
  enum_kind: string | null;
  reference_config: Record<string, unknown> | null;
  money_config: Record<string, unknown> | null;
  json_config?: Record<string, unknown> | null;
  datetime_config?: Record<string, unknown> | null;
  lookup_config: Record<string, unknown> | null;
  lookup_profile?: Record<string, unknown> | null;
  validation_rules: Record<string, unknown> | null;
  constraints?: Record<string, unknown> | null;
  visibility?: Record<string, unknown> | null;
  collection_behavior?: Record<string, unknown> | null;
  compute_expr?: unknown;
  default_value: unknown;
  filter_config: Record<string, unknown> | null;
  i18n_key?: string | null;
}

export interface EntityDetail {
  id: string;
  name: string;
  entity_code: string | null;
  entity_short: string | null;
  entity_class: string;
  module_id: string;
  slug?: string | null;
  kind: string | null;
  ownership_model: string | null;
  table_schema?: string | null;
  table_name?: string | null;
  backing_type?: string | null;
  version_no?: number | null;
  version_hash?: string | null;
  label_singular: string | null;
  label_plural: string | null;
  icon_key: string | null;
  color_token: string | null;
  status: string;
  runtime_enabled?: boolean;
  primary_key?: string | null;
  tenant_column?: string | null;
  read_capability?: string;
  write_capability?: string;
  feature_flags: Record<string, unknown>;
  display_config: Record<string, unknown>;
  identity_config: Record<string, unknown>;
  search_config: Record<string, unknown>;
  data_policy: Record<string, unknown>;
  fields: EntityField[];
}

export interface LifecycleBinding {
  id: string;
  entity_name: string;
  lifecycle_id: string;
  lifecycle_code: string | null;
  lifecycle_name: string | null;
  lifecycle_status: string | null;
  conditions: unknown;
  priority: number;
  created_at: string;
  updated_at: string | null;
}

export interface EntityOperation {
  id: string;
  entity_name: string;
  permission_code: string;
  permission_label: string | null;
  permission_description: string | null;
  surface: string;
  placement: string;
  handler_type: string;
  handler_target: string | null;
  is_record_required: boolean;
  sort_order: number;
  label_override: string | null;
  icon_override: string | null;
  tcode_alias: string | null;
  is_enabled: boolean;
  disabled_reason?: string | null;
  action_group?: "lifecycle" | "record" | "general" | "workflow_task" | null;
  intent?: "neutral" | "success" | "warning" | "danger" | null;
  requires_confirmation?: boolean;
  requires_reason?: boolean;
  source?: "entity_operation" | "lifecycle_transition" | "workflow_task" | null;
  permission_decision?: "allow" | "deny" | "not_found" | "not_in_plan" | "addon_required" | "not_granted" | null;
  lifecycle_transitions?: Array<{
    transition_id?: string;
    lifecycle_id?: string;
    from_state: string;
    to_state: string;
    requires_reason?: boolean;
    requires_confirmation?: boolean;
  }>;
  created_at: string;
  updated_at?: string | null;
}

export interface EntityPolicy {
  id: string;
  entity_id: string;
  entity_name: string | null;
  entity_label: string | null;
  entity_class: string | null;
  entity_version_id: string | null;
  access_mode: string;
  company_scope_mode: string;
  audit_mode: string;
  retention_policy: Record<string, unknown>;
  default_filters: Record<string, unknown>;
  cache_flags: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
}

export interface LifecycleCatalogueItem {
  id: string;
  code: string;
  name: string;
  status: string;
  description: string | null;
}
