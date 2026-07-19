export interface EntityField {
  id: string;
  name: string;
  column_name: string | null;
  label: string | null;
  data_type: string;
  cardinality: string | null;
  origin: string;
  is_required: boolean;
  is_unique?: boolean;
  is_filterable: boolean;
  is_sortable: boolean;
  is_groupable?: boolean;
  is_aggregatable?: boolean;
  sort_order: number;
  semantic_roles?: string[];
  type_config?: Record<string, unknown>;
  default_value: unknown;
  defaults?: Record<string, unknown> | null;
}

export interface EntityDetail {
  id: string;
  name: string;
  entity_code: string | null;
  entity_class: string;
  module_id: string;
  slug?: string | null;
  ownership_model: string | null;
  version_id?: string | null;
  version_status?: string | null;
  label_singular: string | null;
  label_plural: string | null;
  status: string;
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
