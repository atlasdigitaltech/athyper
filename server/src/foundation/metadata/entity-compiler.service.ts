/**
 * EntityCompilerService
 *
 * Compiles current control.entity metadata into the snapshot.entity_compiled
 * cache used by runtime compliance checks. The HTTP metadata route still
 * builds descriptors on demand for request serving, but this service keeps the
 * append-only snapshot table populated for every active system entity.
 */

import { createHash } from "node:crypto";
import type { Kysely } from "kysely";

export interface CompiledField {
  id: string;
  name: string;
  column_name: string;
  label: string | null;
  description: string | null;
  data_type: string;
  ui_type: string | null;
  format: string | null;
  unit: string | null;
  cardinality: string;
  origin: string;
  is_required: boolean;
  is_readonly: boolean;
  is_unique: boolean;
  unique_scope: string | null;
  is_searchable: boolean;
  is_filterable: boolean;
  is_sortable: boolean;
  is_groupable: boolean;
  is_aggregatable: boolean;
  is_pii: boolean;
  is_computed: boolean;
  is_write_once: boolean;
  default_value: unknown;
  validation_rules: Record<string, unknown> | null;
  enum_domain_code: string | null;
  reference_config: Record<string, unknown> | null;
  money_config: Record<string, unknown> | null;
  json_config: Record<string, unknown> | null;
  sort_order: number;
  group_key: string | null;
  ui_hint: Record<string, unknown> | null;
  visibility: Record<string, unknown> | null;
  editability: Record<string, unknown> | null;
  lookup_config: Record<string, unknown> | null;
  filter_config: Record<string, unknown> | null;
  i18n_key: string | null;
}

export interface CompiledEntity {
  entity_id: string;
  entity_code: string;
  slug: string;
  entity_name: string;
  entity_class: string;
  table_schema: string;
  table_name: string;
  version_id: string;
  version_no: number;
  version_hash: string;
  fields: CompiledField[];
  field_groups: Array<{
    group_key: string;
    label: string;
    description: string | null;
    sort_order: number;
    fields: string[];
  }>;
  display_config: Record<string, unknown>;
  identity_config: Record<string, unknown>;
  search_config: Record<string, unknown>;
  data_policy: Record<string, unknown>;
  feature_flags: Record<string, unknown>;
  governance_level: string;
  security_tier: string;
  mutability: string;
  class_profile: Record<string, unknown> | null;
  compiled_at: string;
  compiled_hash: string;
}

export interface CompileAllSummary {
  total: number;
  compiled: number;
  failed: number;
}

interface EntityRow {
  id: string;
  name: string;
  slug: string | null;
  entity_code: string;
  label_singular: string | null;
  label_plural: string | null;
  entity_class: string;
  table_schema: string;
  table_name: string;
  display_config: unknown;
  identity_config: unknown;
  search_config: unknown;
  data_policy: unknown;
  feature_flags: unknown;
  governance_level: string;
  security_tier: string;
  mutability: string;
  icon_key: string | null;
  color_token: string | null;
}

interface EntityVersionRow {
  id: string;
  version_no: number;
  version_hash: string | null;
}

interface EntityFieldRow {
  id: string;
  name: string;
  column_name: string;
  label: string | null;
  description: string | null;
  data_type: string;
  ui_type: string | null;
  format: string | null;
  unit: string | null;
  cardinality: string;
  origin: string;
  is_required: boolean;
  is_unique: boolean;
  unique_scope: string | null;
  is_searchable: boolean;
  is_filterable: boolean;
  is_sortable: boolean;
  is_groupable: boolean;
  is_aggregatable: boolean;
  is_read_only: boolean;
  is_computed: boolean;
  is_write_once: boolean;
  sort_order: number;
  default_value: unknown | null;
  validation: unknown | null;
  enum_domain_code: string | null;
  reference_config: unknown | null;
  money_config: unknown | null;
  json_config: unknown | null;
  ui_hint: unknown | null;
  visibility: unknown | null;
  editability: unknown | null;
  group_key: string | null;
  filter_config: unknown | null;
  lookup_config: unknown | null;
}

interface ClassProfileRow {
  class_key: string;
  label: string;
  description: string;
  valid_governance_levels: string[];
  default_governance_level: string;
  valid_mutability: string[];
  default_mutability: string;
  default_security_tier: string;
  expected_system_columns: string[];
  field_flag_rules: unknown;
  security_tiers: unknown;
  compliance_profile: unknown;
}

interface Logger {
  warn(event: string, fields?: Record<string, unknown>): void;
  info?(event: string, fields?: Record<string, unknown>): void;
  error?(event: string, fields?: Record<string, unknown>): void;
}

const CACHE_TTL_MS = 5 * 60_000;
const SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000000";

function coerceJson(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function coerceRecord(value: unknown): Record<string, unknown> | null {
  const parsed = coerceJson(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function withDefinedValues(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}

const MOVED_DISPLAY_CONFIG_KEYS = new Set([
  "code_field",
  "search_fields",
  "default_sort_dir",
  "hidden",
  "readOnly",
  "read_only",
  "coverage_mode",
  "reference_model",
  "field_metadata_repair_version",
]);

function textConfig(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanConfig(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "t", "yes", "y", "1", "enabled", "on"].includes(normalized)) return true;
  if (["false", "f", "no", "n", "0", "disabled", "off"].includes(normalized)) return false;
  return undefined;
}

function normalizeDetailRenderer(value: unknown): "master" | "document" | "ledger" | undefined {
  const normalized = textConfig(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) return undefined;
  if (normalized === "document" || normalized === "document_detail") return "document";
  if (normalized === "ledger" || normalized === "log") return "ledger";
  if (["master", "standard", "readonly", "read_only", "read_only_master"].includes(normalized)) return "master";
  return undefined;
}

function normalizeDetailProfile(raw: Record<string, unknown>): "simple" | "rich" | "read-only" | undefined {
  const renderer = textConfig(raw["detail_renderer"])?.toLowerCase().replace(/[\s-]+/g, "_");
  if (renderer === "readonly" || renderer === "read_only"
    || booleanConfig(raw["readOnly"]) === true
    || booleanConfig(raw["read_only"]) === true) {
    return "read-only";
  }
  const profile = textConfig(raw["detail_profile"])?.toLowerCase().replace(/[\s_]+/g, "-");
  if (profile === "simple" || profile === "rich" || profile === "read-only") return profile;
  if (renderer === "standard") return "simple";
  return undefined;
}

function normalizeListRenderer(value: unknown): "table" | "kanban" | "dashboard" | "spreadsheet" | undefined {
  const normalized = textConfig(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) return undefined;
  if (normalized === "list" || normalized === "grid" || normalized === "data_table") return "table";
  if (normalized === "board") return "kanban";
  if (normalized === "excel") return "spreadsheet";
  if (normalized === "table" || normalized === "kanban" || normalized === "dashboard" || normalized === "spreadsheet") {
    return normalized;
  }
  return undefined;
}

function normalizeViewMode(value: unknown): string | undefined {
  const normalized = textConfig(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) return undefined;
  if (normalized === "list" || normalized === "grid" || normalized === "data_table") return "table";
  if (normalized === "board") return "kanban";
  if (normalized === "excel") return "spreadsheet";
  return ["table", "compact", "kanban", "dashboard", "spreadsheet"].includes(normalized)
    ? normalized
    : undefined;
}

function normalizeDisplayConfig(
  raw: Record<string, unknown>,
  iconKey: unknown,
  colorToken: unknown,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  for (const key of MOVED_DISPLAY_CONFIG_KEYS) delete out[key];

  const detailRenderer = normalizeDetailRenderer(raw["detail_renderer"]);
  if (detailRenderer) out["detail_renderer"] = detailRenderer;
  else delete out["detail_renderer"];

  const detailProfile = normalizeDetailProfile(raw);
  if (detailProfile) out["detail_profile"] = detailProfile;

  const listRenderer = normalizeListRenderer(raw["list_renderer"]);
  if (listRenderer) out["list_renderer"] = listRenderer;
  else if ("list_renderer" in out) delete out["list_renderer"];

  if (Array.isArray(raw["view_modes"])) {
    const modes = raw["view_modes"].map(normalizeViewMode).filter((mode): mode is string => Boolean(mode));
    out["view_modes"] = [...new Set(modes)];
  }

  const sortOrder = textConfig(raw["default_sort_order"]) ?? textConfig(raw["default_sort_dir"]);
  if (sortOrder?.toLowerCase() === "asc" || sortOrder?.toLowerCase() === "desc") {
    out["default_sort_order"] = sortOrder.toLowerCase();
  }

  if (!out["icon"] && iconKey) out["icon"] = iconKey;
  if (!out["color"] && colorToken) out["color"] = colorToken;

  return withDefinedValues(out);
}

const BOOLEAN_FEATURE_KEYS = new Set([
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
  "has_payment_schedule",
  "has_budget_impact",
  "has_related_documents",
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
  "reference_picker",
  "line_editor",
  "posting_controlled",
  "dimension_controlled",
]);

const FEATURE_FLAG_ALIASES: Record<string, string[]> = {
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

const LEGACY_FEATURE_FLAG_KEYS = new Set([
  ...Object.values(FEATURE_FLAG_ALIASES).flat(),
  "line_entity_code",
  "identity_via",
  "list_entity_code",
  "parent_entity",
  "parent_fk",
  "parent_scope",
  "duplicate_check",
  "replacement_entity",
]);

function coerceFeatureBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "t", "yes", "y", "1", "enabled", "on"].includes(normalized)) return true;
  if (["false", "f", "no", "n", "0", "disabled", "off"].includes(normalized)) return false;
  return undefined;
}

function normalizeFeatureFlags(raw: Record<string, unknown>): Record<string, unknown> {
  const canonical: Record<string, unknown> = { ...raw };

  for (const [target, aliases] of Object.entries(FEATURE_FLAG_ALIASES)) {
    if (target in canonical) continue;
    const alias = aliases.find((key) => key in raw);
    if (alias) canonical[target] = raw[alias];
  }

  if (!("is_approvable" in canonical) && "approval_workflow" in raw) {
    canonical["is_approvable"] = Boolean(raw["approval_workflow"]);
  }
  if (!("has_attachments" in canonical) && "allow_attachments" in raw) {
    canonical["has_attachments"] = Boolean(raw["allow_attachments"]);
  }
  if (!("is_exportable" in canonical) && "allow_export" in raw) {
    canonical["is_exportable"] = Boolean(raw["allow_export"]);
  }

  if (!("has_workflow" in canonical) && canonical["is_approvable"] === true) {
    canonical["has_workflow"] = true;
  }
  for (const key of BOOLEAN_FEATURE_KEYS) {
    if (!(key in canonical)) continue;
    const boolValue = coerceFeatureBoolean(canonical[key]);
    if (boolValue !== undefined) canonical[key] = boolValue;
  }
  for (const key of LEGACY_FEATURE_FLAG_KEYS) {
    delete canonical[key];
  }

  return canonical;
}

const VALIDATION_REFERENCE_KEYS = new Set([
  "ref_entity",
  "ref_hint",
  "target_field",
  "display_field",
  "picker",
  "label_field",
  "code_field",
  "description_field",
  "navigation_field",
  "record_id_field",
  "show_code",
  "show_description",
  "show_view_action",
]);

function normalizeValidationRules(validation: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!validation) return null;
  const entries = Object.entries(validation)
    .filter(([key, value]) => !VALIDATION_REFERENCE_KEYS.has(key) && value !== undefined && value !== null);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function referenceTargetEntity(row: Pick<EntityFieldRow, "reference_config" | "validation">): string | null {
  const rawConfig = coerceRecord(row.reference_config);
  const validation = coerceRecord(row.validation);
  return stringValue(rawConfig?.["target_entity"])
    ?? stringValue(rawConfig?.["ref_entity"])
    ?? stringValue(validation?.["ref_entity"])
    ?? stringValue(validation?.["ref_hint"]);
}

function mergeReferencePickerProfile(
  referenceConfig: Record<string, unknown>,
  referencePickerProfile?: Record<string, unknown> | null,
): Record<string, unknown> {
  const pickerOverride = coerceRecord(referenceConfig["picker"]);
  const displayField = stringValue(referenceConfig["display_field"]);
  const topLevelPickerOverrides = withDefinedValues({
    label_field: referenceConfig["label_field"] ?? displayField ?? undefined,
    code_field: referenceConfig["code_field"],
    description_field: referenceConfig["description_field"],
    navigation_field: referenceConfig["navigation_field"] ?? referenceConfig["record_id_field"],
    show_code: referenceConfig["show_code"],
    show_description: referenceConfig["show_description"],
    show_view_action: referenceConfig["show_view_action"],
  });
  const mergedPicker = withDefinedValues({
    ...(referencePickerProfile ?? {}),
    ...topLevelPickerOverrides,
    ...(pickerOverride ?? {}),
  });
  const picker = Object.keys(mergedPicker).length > 0 ? mergedPicker : undefined;

  return withDefinedValues({
    ...referenceConfig,
    target_field: referenceConfig["target_field"] ?? "id",
    display_field: referenceConfig["display_field"]
      ?? referenceConfig["label_field"]
      ?? picker?.["label_field"],
    picker,
  });
}

function normalizeReferenceConfig(
  row: EntityFieldRow,
  referencePickerProfile?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const rawConfig = coerceRecord(row.reference_config);
  const validation = coerceRecord(row.validation);
  const targetEntity = referenceTargetEntity(row);

  if (rawConfig) {
    const strippedConfig = { ...rawConfig };
    for (const key of ["ref_entity", "ref_hint", "entity", "entity_code", "targetEntity", "refEntity"]) {
      delete strippedConfig[key];
    }
    const normalized = withDefinedValues({
      ...strippedConfig,
      target_entity: targetEntity ?? "",
      target_field: strippedConfig["target_field"],
      display_field: strippedConfig["display_field"],
    });
    return mergeReferencePickerProfile(normalized, referencePickerProfile);
  }

  if (targetEntity) {
    const normalized = withDefinedValues({
      target_entity: targetEntity,
      target_field: validation?.["target_field"],
      display_field: validation?.["display_field"],
    });
    return mergeReferencePickerProfile(normalized, referencePickerProfile);
  }

  return null;
}

const RULE_EXPRESSION_KEYS = new Set([
  "field",
  "operator",
  "value",
  "values",
  "and",
  "or",
  "not",
  "var",
  "==",
  "!=",
  ">",
  ">=",
  "<",
  "<=",
]);

function isRuleExpression(value: unknown): boolean {
  const record = coerceRecord(value);
  return Boolean(record && Object.keys(record).some((key) => RULE_EXPRESSION_KEYS.has(key)));
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> | null {
  const entries = Object.entries(record).filter(([, value]) => value !== undefined && value !== null);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function normalizeUiHint(value: unknown, visibility: unknown): Record<string, unknown> | null {
  const raw = coerceRecord(value);
  if (!raw) return null;

  const out: Record<string, unknown> = { ...raw };
  const display = { ...(coerceRecord(out["display"]) ?? {}) };
  const topLevelRule = out["visible_when"];
  const legacyVisibility = coerceRecord(visibility);

  if (!display["visible_when"] && isRuleExpression(topLevelRule)) {
    display["visible_when"] = topLevelRule;
  }
  if (!display["visible_when"] && isRuleExpression(legacyVisibility)) {
    display["visible_when"] = legacyVisibility;
  }
  if (Object.keys(display).length > 0) out["display"] = display;

  const copyBehavior = out["copy_behavior"];
  if (copyBehavior !== undefined) {
    const copy = { ...(coerceRecord(out["copy"]) ?? {}) };
    if (copy["behavior"] === undefined) copy["behavior"] = copyBehavior;
    out["copy"] = copy;
  }

  delete out["filter"];
  delete out["copy_behavior"];
  delete out["group_key"];
  delete out["visible_when"];

  return compactRecord(out);
}

function normalizeMoneyConfig(value: unknown): Record<string, unknown> | null {
  const raw = coerceRecord(value);
  if (!raw) return null;
  const out: Record<string, unknown> = { ...raw };

  if (!out["currency_code"]) out["currency_code"] = out["constant_currency"];
  if (!out["currency_code_position"]) out["currency_code_position"] = out["code_position"] ?? out["currency_position"];

  delete out["constant_currency"];
  delete out["code_position"];
  delete out["currency_position"];

  return compactRecord(out);
}

function normalizeLookupConfig(value: unknown): Record<string, unknown> | null {
  const raw = coerceRecord(value);
  if (!raw) return null;
  const out: Record<string, unknown> = { ...raw };

  if (!out["dependent_filter"]) out["dependent_filter"] = out["depends_on"] ?? out["dependency"];
  delete out["depends_on"];
  delete out["dependency"];

  return compactRecord(out);
}

function mapField(
  row: EntityFieldRow,
  referencePickerProfiles?: Map<string, Record<string, unknown>>,
): CompiledField {
  const rawUiHint = coerceRecord(row.ui_hint);
  const uiHint = normalizeUiHint(row.ui_hint, row.visibility);
  const validation = coerceRecord(row.validation);
  const targetEntity = referenceTargetEntity(row);
  const referencePickerProfile = targetEntity ? referencePickerProfiles?.get(targetEntity) : undefined;

  return {
    id: row.id,
    name: row.name,
    column_name: row.column_name,
    label: row.label,
    description: row.description,
    data_type: row.data_type,
    ui_type: row.ui_type,
    format: row.format,
    unit: row.unit,
    cardinality: row.cardinality,
    origin: row.origin,
    is_required: row.is_required,
    is_readonly: row.is_read_only,
    is_unique: row.is_unique,
    unique_scope: row.unique_scope ?? null,
    is_searchable: row.is_searchable,
    is_filterable: row.is_filterable,
    is_sortable: row.is_sortable,
    is_groupable: row.is_groupable,
    is_aggregatable: row.is_aggregatable,
    is_pii: false,
    is_computed: row.is_computed,
    is_write_once: row.is_write_once,
    default_value: coerceJson(row.default_value),
    validation_rules: normalizeValidationRules(validation),
    enum_domain_code: row.enum_domain_code,
    reference_config: normalizeReferenceConfig(row, referencePickerProfile),
    money_config: normalizeMoneyConfig(row.money_config),
    json_config: coerceRecord(row.json_config),
    sort_order: row.sort_order,
    group_key: row.group_key ?? stringValue(rawUiHint?.["group_key"]),
    ui_hint: uiHint,
    visibility: coerceRecord(row.visibility),
    editability: coerceRecord(row.editability),
    lookup_config: normalizeLookupConfig(row.lookup_config),
    filter_config: coerceRecord(row.filter_config) ?? coerceRecord(rawUiHint?.["filter"]),
    i18n_key: stringValue(rawUiHint?.["i18n_key"]),
  };
}

export class EntityCompilerService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: Kysely<any>;
  private readonly logger?: Logger;
  private readonly cache = new Map<string, { compiled: CompiledEntity; fetchedAt: number }>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: Kysely<any>, logger?: Logger) {
    this.db = db;
    this.logger = logger;
  }

  /**
   * Compile a single entity and persist its snapshot row.
   */
  async compile(entityCode: string, tenantId?: string): Promise<CompiledEntity | null> {
    void tenantId;

    const now = Date.now();
    const cached = this.cache.get(entityCode);
    if (cached && (now - cached.fetchedAt) < CACHE_TTL_MS) {
      return cached.compiled;
    }

    const compiled = await this.fullCompile(entityCode);
    if (!compiled) return null;

    await this.writeSnapshot(compiled);
    this.cache.set(entityCode, { compiled, fetchedAt: now });
    return compiled;
  }

  /**
   * Compile every active system entity. This is best-effort by entity: one bad
   * row is logged and the warm-up continues so the remaining snapshots are
   * still generated before the compliance suite runs.
   */
  async compileAllSystemEntities(): Promise<CompileAllSummary> {
    let total = 0;
    let compiled = 0;
    let failed = 0;

    try {
      const rows = await this.db
        .selectFrom("control.entity as e" as never)
        .select("e.name" as never)
        .where("e.tenant_id" as never, "is" as never, null as never)
        .where("e.status" as never, "=" as never, "ACTIVE" as never)
        .execute() as Array<{ name: string }>;

      total = rows.length;

      for (const row of rows) {
        const entityCode = String(row.name);
        try {
          const result = await this.compile(entityCode);
          if (result) {
            compiled++;
          } else {
            failed++;
            this.logger?.warn("entity_compile_skipped", {
              entityCode,
              reason: "No effective active entity metadata found",
            });
          }
        } catch (err) {
          failed++;
          this.logger?.warn("entity_compile_failed", {
            entityCode,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return { total, compiled, failed };
    } catch (err) {
      this.logger?.warn("entity_compile_warmup_failed", {
        err: err instanceof Error ? err.message : String(err),
      });
      return { total, compiled, failed: failed || 1 };
    }
  }

  invalidate(entityCode?: string): void {
    if (entityCode) {
      this.cache.delete(entityCode);
    } else {
      this.cache.clear();
    }
  }

  async listEntityCodes(): Promise<string[]> {
    const rows = await this.db
      .selectFrom("control.entity as e" as never)
      .select("e.name" as never)
      .where("e.is_active" as never, "=", true as never)
      .execute() as Array<{ name: string }>;
    return rows.map((r) => r.name);
  }

  private async fullCompile(entityCode: string): Promise<CompiledEntity | null> {
    const entityRow = await this.db
      .selectFrom("control.entity as e" as never)
      .select([
        "e.id",
        "e.name",
        "e.slug",
        "e.entity_code",
        "e.label_singular",
        "e.label_plural",
        "e.entity_class",
        "e.table_schema",
        "e.table_name",
        "e.display_config",
        "e.identity_config",
        "e.search_config",
        "e.data_policy",
        "e.feature_flags",
        "e.governance_level",
        "e.security_tier",
        "e.mutability",
        "e.icon_key",
        "e.color_token",
      ] as never[])
      .where((eb: any) => eb.or([
        eb("e.name", "=", entityCode),
        eb("e.entity_code", "=", entityCode),
        eb("e.slug", "=", entityCode),
      ]))
      .where("e.tenant_id" as never, "is" as never, null as never)
      .where("e.is_active" as never, "=" as never, true as never)
      .executeTakeFirst() as EntityRow | undefined;

    if (!entityRow) return null;

    const versionRow = await this.db
      .selectFrom("control.entity_version as ev" as never)
      .select(["ev.id", "ev.version_no", "ev.version_hash"] as never[])
      .where("ev.entity_id" as never, "=" as never, entityRow.id as never)
      .where("ev.status" as never, "=" as never, "EFFECTIVE" as never)
      .executeTakeFirst() as EntityVersionRow | undefined;

    if (!versionRow) return null;

    const fieldRows = await this.db
      .selectFrom("control.entity_field as ef" as never)
      .selectAll("ef" as never)
      .where("ef.entity_version_id" as never, "=" as never, versionRow.id as never)
      .where("ef.is_active" as never, "=" as never, true as never)
      .orderBy("ef.sort_order" as never, "asc")
      .execute() as EntityFieldRow[];

    const classProfile = await this.loadClassProfile(entityRow.entity_class);
    const referencePickerProfiles = await this.loadReferencePickerProfiles(fieldRows);
    const fields = fieldRows.map((row) => mapField(row, referencePickerProfiles));
    const displayConfig = normalizeDisplayConfig(
      coerceRecord(entityRow.display_config) ?? {},
      entityRow.icon_key,
      entityRow.color_token,
    );
    const identityConfig = coerceRecord(entityRow.identity_config) ?? {};
    const searchConfig = coerceRecord(entityRow.search_config) ?? {};
    const dataPolicy = coerceRecord(entityRow.data_policy) ?? {};
    const featureFlags = normalizeFeatureFlags(coerceRecord(entityRow.feature_flags) ?? {});
    const versionHash = versionRow.version_hash ?? sha256(`${entityRow.id}:v${versionRow.version_no}`);

    const payloadWithoutHash = {
      entity_id: entityRow.id,
      entity_code: entityRow.entity_code ?? entityRow.name,
      slug: entityRow.slug ?? entityRow.table_name.replace(/_/g, "-"),
      entity_name: entityRow.label_singular ?? entityRow.name,
      entity_class: entityRow.entity_class,
      table_schema: entityRow.table_schema,
      table_name: entityRow.table_name,
      version_id: versionRow.id,
      version_no: Number(versionRow.version_no),
      version_hash: versionHash,
      fields,
      field_groups: [],
      display_config: displayConfig,
      identity_config: identityConfig,
      search_config: searchConfig,
      data_policy: dataPolicy,
      feature_flags: featureFlags,
      governance_level: entityRow.governance_level,
      security_tier: entityRow.security_tier,
      mutability: entityRow.mutability,
      class_profile: classProfile,
      compiled_at: new Date().toISOString(),
    };

    return {
      ...payloadWithoutHash,
      compiled_hash: sha256(JSON.stringify(payloadWithoutHash)),
    };
  }

  private async loadClassProfile(entityClass: string): Promise<Record<string, unknown> | null> {
    const row = await this.db
      .selectFrom("control.entity_class_profile as ecp" as never)
      .select([
        "ecp.class_key",
        "ecp.label",
        "ecp.description",
        "ecp.valid_governance_levels",
        "ecp.default_governance_level",
        "ecp.valid_mutability",
        "ecp.default_mutability",
        "ecp.default_security_tier",
        "ecp.expected_system_columns",
        "ecp.field_flag_rules",
        "ecp.security_tiers",
        "ecp.compliance_profile",
      ] as never[])
      .where("ecp.class_key" as never, "=" as never, entityClass as never)
      .executeTakeFirst() as ClassProfileRow | undefined;

    if (!row) return null;

    return {
      class_key: row.class_key,
      label: row.label,
      description: row.description,
      valid_governance_levels: row.valid_governance_levels,
      default_governance_level: row.default_governance_level,
      valid_mutability: row.valid_mutability,
      default_mutability: row.default_mutability,
      default_security_tier: row.default_security_tier,
      expected_system_columns: row.expected_system_columns,
      field_flag_rules: coerceJson(row.field_flag_rules),
      security_tiers: coerceJson(row.security_tiers),
      compliance_profile: coerceJson(row.compliance_profile),
    };
  }

  private async loadReferencePickerProfiles(
    fieldRows: EntityFieldRow[],
  ): Promise<Map<string, Record<string, unknown>>> {
    const targetEntities = [
      ...new Set(fieldRows.map(referenceTargetEntity).filter((value): value is string => Boolean(value))),
    ];
    const profiles = new Map<string, Record<string, unknown>>();
    if (targetEntities.length === 0) return profiles;

    const rows = await this.db
      .selectFrom("control.entity as e" as never)
      .select(["e.name", "e.entity_code", "e.display_config"] as never[])
      .where((eb: any) => eb.or([
        eb("e.name", "in", targetEntities),
        eb("e.entity_code", "in", targetEntities),
      ]))
      .where("e.tenant_id" as never, "is" as never, null as never)
      .where("e.is_active" as never, "=" as never, true as never)
      .execute() as Array<{ name: string; entity_code: string | null; display_config: unknown }>;

    for (const row of rows) {
      const displayConfig = coerceRecord(row.display_config);
      const referencePicker = coerceRecord(displayConfig?.["reference_picker"]);
      if (!referencePicker) continue;
      profiles.set(row.name, referencePicker);
      if (row.entity_code) profiles.set(row.entity_code, referencePicker);
    }

    return profiles;
  }

  private async writeSnapshot(compiled: CompiledEntity): Promise<void> {
    await this.db
      .insertInto("snapshot.entity_compiled" as never)
      .values({
        tenant_id: SYSTEM_ACTOR_ID,
        entity_version_id: compiled.version_id,
        compiled_json: compiled as never,
        compiled_hash: compiled.compiled_hash,
        compliance_report: {},
        created_by: SYSTEM_ACTOR_ID,
      } as never)
      .onConflict((oc: any) =>
        oc.columns(["entity_version_id"] as never[])
          .doNothing()
      )
      .execute();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createEntityCompilerService(db: Kysely<any>, logger?: Logger): EntityCompilerService {
  return new EntityCompilerService(db, logger);
}
