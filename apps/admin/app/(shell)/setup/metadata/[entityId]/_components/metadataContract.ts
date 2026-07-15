export type JsonRecord = Record<string, unknown>;

export const OPERATION_SURFACES = ["LIST", "DETAIL", "BOTH", "PALETTE_ONLY", "HIDDEN"] as const;
export const OPERATION_PLACEMENTS = ["PRIMARY", "TOOLBAR", "OVERFLOW", "CONTEXT", "COMMAND"] as const;
export const OPERATION_HANDLER_TYPES = ["NAVIGATE", "API", "MODAL", "INLINE"] as const;
export const OPERATION_ACTION_GROUPS = ["lifecycle", "record", "general", "workflow_task"] as const;
export const OPERATION_INTENTS = ["neutral", "success", "warning", "danger"] as const;
export const OPERATION_SOURCES = ["entity_operation", "lifecycle_transition", "workflow_task"] as const;

export const FIELD_CARDINALITIES = ["one", "many", "zero_or_one"] as const;
export const FIELD_ORIGINS = ["system", "standard", "business"] as const;
export const BUSINESS_FIELD_ORIGIN = "business";

export const ACCESS_MODES = ["default_deny", "default_allow", "public"] as const;
export const COMPANY_SCOPE_MODES = ["none", "strict", "permissive"] as const;
export const AUDIT_MODES = ["enabled", "disabled", "sampling"] as const;
export const CLASSIFICATION_OPTIONS = ["public", "internal", "confidential", "restricted"] as const;

export const FEATURE_FLAG_KEYS = [
  "has_attachments",
  "has_workflow",
  "has_lifecycle",
  "is_importable",
  "is_exportable",
  "is_bulk_editable",
  "is_approvable",
  "is_readonly",
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
  "requires_owner_type_scope",
  "is_company_scoped",
  "singleton",
  "pii_bearing",
  "allow_address",
  "allow_contact",
  "has_roles",
  "append_only_after_submission",
] as const;

export const ADVANCED_FEATURE_FLAG_KEYS = [
  "sla_target_hours",
  "document_category",
  "owner_type_column",
  "default_owner_type_scope",
  "default_owner_type",
  "reference_picker",
  "line_editor",
  "role_entity",
  "party_category",
  "replacement_for",
] as const;

export const SEARCH_CONFIG_KEYS = ["enabled", "fields", "rank", "min_query_length", "operator"] as const;
export const IDENTITY_CONFIG_KEYS = [
  "primary_key_field",
  "business_key_fields",
  "natural_key_fields",
  "numbering",
  "identity_via",
  "list_entity_code",
  "parent",
  "duplicate_check",
  "replacement",
] as const;

export const FIELD_CONTRACT_KEYS = [
  "reference_config",
  "money_config",
  "filter_config",
  "ui_hint",
  "editability",
  "lookup_config",
  "validation_rules",
  "default_value",
  "enum_config",
  "enum_domain_code",
  "group_key",
] as const;

export interface JsonParseResult {
  ok: boolean;
  value?: unknown;
  error?: string;
}

export function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

export function formatJson(value: unknown): string {
  if (value === undefined || value === null) return "";
  return JSON.stringify(value, null, 2);
}

export function parseJsonText(text: string, options?: { allowEmpty?: boolean; objectOnly?: boolean }): JsonParseResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return options?.allowEmpty === false
      ? { ok: false, error: "JSON value is required." }
      : { ok: true, value: null };
  }
  try {
    const value = JSON.parse(trimmed) as unknown;
    if (options?.objectOnly && (!value || typeof value !== "object" || Array.isArray(value))) {
      return { ok: false, error: "Expected a JSON object." };
    }
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid JSON." };
  }
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

export function numberOrUndefined(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function fieldIsReadonly(field: { is_readonly?: boolean; is_read_only?: boolean }): boolean {
  return Boolean(field.is_readonly ?? field.is_read_only);
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function hasUnknownKeys(record: JsonRecord, allowedKeys: readonly string[]): string[] {
  const allowed = new Set(allowedKeys);
  return Object.keys(record).filter((key) => !allowed.has(key));
}

export function normalizeClassification(value: unknown): string {
  if (typeof value !== "string") return "internal";
  if ((CLASSIFICATION_OPTIONS as readonly string[]).includes(value)) return value;
  if (value === "none") return "public";
  if (value === "low") return "internal";
  if (value === "medium" || value === "high") return "confidential";
  return "restricted";
}
