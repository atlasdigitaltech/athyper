/**
 * Canonical metadata boundary normalizers.
 *
 * Persisted metadata uses snake_case.  Runtime consumers may still receive
 * camelCase values from older descriptors or application adapters, so the
 * conversion is kept here instead of being reimplemented by each caller.
 */

const BOOLEAN_TRUE = new Set(["true", "t", "yes", "y", "1", "enabled", "on"]);
const BOOLEAN_FALSE = new Set(["false", "f", "no", "n", "0", "disabled", "off"]);

export const FEATURE_FLAG_ALIASES: Readonly<Record<string, readonly string[]>> = {
  is_approvable: ["approval_workflow"],
  has_attachments: ["allow_attachments", "allow_attachment"],
  is_exportable: ["allow_export", "export_enabled"],
  is_importable: ["allow_import", "import_enabled"],
  is_bulk_editable: ["allow_bulk_edit", "bulk_edit_enabled"],
  comments_enabled: ["has_comments", "comments"],
  event_history: ["has_events", "has_event_history", "audit_history"],
  version_control: ["has_versions"],
  has_lines: ["has_line_items", "line_editor"],
  has_accounting_distribution: ["accounting_distribution", "has_distributions"],
  is_readonly: ["readonly", "readOnly", "read_only"],
};

const BOOLEAN_FEATURE_KEYS = new Set([
  "has_attachments", "has_workflow", "has_lifecycle", "is_importable", "is_exportable",
  "is_bulk_editable", "is_approvable", "is_readonly", "is_hidden", "comments_enabled",
  "event_history", "version_control", "has_lines", "has_accounting_distribution", "has_tasks",
  "has_watchers", "has_rules", "has_integrations", "quality_checks", "record_reports",
  "has_payment_schedule", "has_budget_impact", "has_related_documents", "has_ai_classification",
  "has_line_composer", "line_references", "catalog_feature_enabled", "catalog_enabled",
  "catalog_items_enabled", "has_catalog_items", "has_catalog", "requires_owner_type_scope",
  "is_company_scoped", "singleton", "pii_bearing", "allow_address", "allow_contact", "has_roles",
  "append_only_after_submission", "reference_picker", "line_editor", "posting_controlled",
  "dimension_controlled",
]);

const LEGACY_FEATURE_FLAG_KEYS = new Set([
  ...Object.values(FEATURE_FLAG_ALIASES).flat(),
  "line_entity_code", "identity_via", "list_entity_code", "parent_entity", "parent_fk",
  "parent_scope", "duplicate_check", "replacement_entity",
]);

export function coerceMetadataBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (BOOLEAN_TRUE.has(normalized)) return true;
  if (BOOLEAN_FALSE.has(normalized)) return false;
  return undefined;
}

/** Normalize feature_flags while preserving explicit false values. */
export function normalizeEntityFeatureFlags(raw: Record<string, unknown>): Record<string, unknown> {
  const canonical: Record<string, unknown> = { ...raw };

  for (const [target, aliases] of Object.entries(FEATURE_FLAG_ALIASES)) {
    if (target in canonical) continue;
    const alias = aliases.find((key) => key in raw);
    if (alias) canonical[target] = raw[alias];
  }

  if (!("has_workflow" in canonical) && canonical["is_approvable"] === true) {
    canonical["has_workflow"] = true;
  }

  for (const key of BOOLEAN_FEATURE_KEYS) {
    if (!(key in canonical)) continue;
    const boolValue = coerceMetadataBoolean(canonical[key]);
    if (boolValue !== undefined) canonical[key] = boolValue;
  }

  for (const key of LEGACY_FEATURE_FLAG_KEYS) delete canonical[key];
  return canonical;
}

const LIST_FEATURE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  saved_views: ["savedViews"],
  bulk_actions: ["bulkActions"],
  column_customization: ["columnCustomization"],
  multi_sort: ["multiSort"],
  max_sort_levels: ["maxSortLevels"],
  search_mode: ["searchMode"],
  max_page_size: ["maxPageSize"],
};

/**
 * Normalize display_config.list_features at the metadata boundary.
 * `view_modes` deliberately is not handled here; display_config.view_modes is
 * the canonical persisted view-mode policy.
 */
export function normalizeEntityListFeatures(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...raw };

  for (const [canonical, aliases] of Object.entries(LIST_FEATURE_ALIASES)) {
    if (!(canonical in normalized)) {
      const alias = aliases.find((key) => key in raw);
      if (alias) normalized[canonical] = raw[alias];
    }
    for (const alias of aliases) delete normalized[alias];
  }

  for (const key of [
    "saved_views", "bulk_actions", "export", "import", "column_customization", "grouping", "multi_sort",
  ]) {
    if (!(key in normalized)) continue;
    const boolValue = coerceMetadataBoolean(normalized[key]);
    if (boolValue !== undefined) normalized[key] = boolValue;
    else delete normalized[key];
  }

  if (
    typeof normalized["max_sort_levels"] === "number" &&
    Number.isFinite(normalized["max_sort_levels"]) &&
    normalized["max_sort_levels"] > 0
  ) {
    normalized["max_sort_levels"] = Math.max(1, Math.trunc(normalized["max_sort_levels"] as number));
  } else {
    delete normalized["max_sort_levels"];
  }
  if (
    typeof normalized["max_page_size"] === "number" &&
    Number.isFinite(normalized["max_page_size"]) &&
    normalized["max_page_size"] > 0
  ) {
    normalized["max_page_size"] = Math.max(1, Math.trunc(normalized["max_page_size"] as number));
  } else {
    delete normalized["max_page_size"];
  }
  if (!["server", "client", "both"].includes(String(normalized["search_mode"]))) {
    delete normalized["search_mode"];
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

