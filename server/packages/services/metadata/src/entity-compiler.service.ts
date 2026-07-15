/**
 * EntityCompilerService
 *
 * Compiles current control.entity metadata into the snapshot.entity_compiled
 * cache used by runtime compliance checks. The HTTP metadata route still
 * builds descriptors on demand for request serving, but this service keeps the
 * append-only snapshot table populated for every active runtime-enabled system entity.
 */

import { createHash } from "node:crypto";
import { withFrameworkPhase } from "@athyper/adapter-telemetry";
import { CompiledQuery, sql, type Kysely } from "kysely";
import {
  compileEntityCapabilityManifest,
  type CapabilityHandlerManifest,
  type CapabilityOperationInput,
  type EntityCapabilityManifest,
} from "./entity-capability-manifest.js";
import {
  compileExecutionDescriptor,
  type SerializedExecutionDescriptorV1,
} from "./execution-descriptor/index.js";
import type { ExecutionDescriptorDiagnostic } from "./execution-descriptor/validation.js";
import { ExecutionDescriptorActivationError } from "./execution-descriptor/validation.js";
import {
  validateMetadataGraph,
  type MetadataGraphValidationResult,
} from "./metadata-graph-validator.js";
import { createCanonicalGraphLoader } from "./canonical-metadata-graph.js";
import { evaluateExecutionEligibility } from "./execution-eligibility.js";
import {
  applyTenantCatalogOverlay,
  resolveTenantOverlay,
  type TenantOverlayResolution,
} from "./tenant-overlay-resolver.js";

export interface CompiledField {
  id: string;
  name: string;
  column_name: string;
  projection_alias_of: string | null;
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
  /** P5 marker — the entity's primary numeric-amount field (drives detectAmountField in runtime). */
  is_primary_amount: boolean;
  /** P5 marker — the entity's primary currency-code field (drives detectCurrencyField in runtime). */
  is_primary_currency: boolean;
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
  /** control.entity_field.defaults JSONB (cascade + on_source_change). */
  defaults: Record<string, unknown> | null;
  i18n_key: string | null;
}

export interface CompiledEntity {
  entity_id: string;
  entity_code: string;
  slug: string;
  entity_name: string;
  entity_class: string;
  create_mode: string;
  numbering_strategy: string;
  table_schema: string;
  table_name: string;
  backing_type: string;
  runtime_enabled: boolean;
  primary_key: string | null;
  tenant_column: string | null;
  read_capability: string;
  write_capability: string;
  concurrency_policy: Record<string, unknown>;
  version_id: string;
  version_no: number;
  version_hash: string;
  fields: CompiledField[];
  field_groups: Array<{
    group_key: string;
    label: string;
    description: string | null;
    sort_order: number;
    /** P5 presentational role marker. Nullable for groups without an intent. */
    ui_intent: string | null;
    fields: string[];
  }>;
  relations: Array<Record<string, unknown>>;
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
  /**
   * Persisted document-workspace execution plan. This is emitted by the
   * metadata compiler (not the BFF) and is consumed by document mutations.
   */
  document_runtime_plan?: CompiledDocumentRuntimePlan;
  /** Compiler-owned mutation/write contract consumed by all write runtimes. */
  capability_manifest: EntityCapabilityManifest;
  /** Immutable, execution-only model consumed by the generic kernel. */
  execution_descriptor: SerializedExecutionDescriptorV1;
  /** Explicit optional-feature degradation report; errors abort activation. */
  execution_diagnostics: ExecutionDescriptorDiagnostic[];
}

export interface CompiledDocumentRuntimePlan {
  source: "compiled_v6";
  schemaVersion: "document-edit-runtime/v6.0";
  planVersion: string;
  planHash: string;
  archetype: "header_only" | "document_with_items";
  nodes: Array<{ key: string; kind: "core" | "collection"; versionSource: "document" | "node" }>;
  invalidationActions: Array<{
    source: { type: "field" | "node_mutation" | "operation"; key: string };
    targets: Array<{ node: string; action: "patch" | "mark_stale" | "rehydrate_if_active" | "remove" }>;
  }>;
}

export interface CompileAllSummary {
  total: number;
  compiled: number;
  failed: number;
  eligibleEntityCodes: string[];
  compiledEntityCodes: string[];
  persistedEntityCodes: string[];
  snapshotPersistenceFailedEntityCodes: string[];
  graphValidation: MetadataGraphValidationResult;
}

interface EntityRow {
  id: string;
  name: string;
  slug: string | null;
  entity_code: string;
  label_singular: string | null;
  label_plural: string | null;
  entity_class: string;
  create_mode: string | null;
  draft_ttl_hours: number | null;
  numbering_strategy: string | null;
  table_schema: string;
  table_name: string;
  backing_type: string;
  runtime_enabled: boolean;
  primary_key: string | null;
  tenant_column: string | null;
  read_capability: string;
  write_capability: string;
  concurrency_policy: unknown;
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
  projection_alias_of: string | null;
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
  is_primary_amount: boolean;
  is_primary_currency: boolean;
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
  /** control.entity_field.defaults JSONB (parent-row cascade + on_source_change). */
  defaults: unknown | null;
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

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

export function compileDocumentRuntimePlan(input: {
  renderer: "master" | "document" | "ledger" | "simple";
  versionHash: string;
  hasItems: boolean;
  fields: CompiledField[];
  /** Metadata that changes the effective workspace graph or rendered nodes. */
  contractMaterial?: unknown;
}): CompiledDocumentRuntimePlan | undefined {
  // The existing metadata compiler remains the single source. Only document
  // entities receive a workspace plan; non-document entities never enter the
  // document runtime transport.
  if (input.renderer !== "document") return undefined;

  const nodes: CompiledDocumentRuntimePlan["nodes"] = [
    { key: "header", kind: "core", versionSource: "document" },
    ...(input.hasItems ? [{ key: "items", kind: "collection" as const, versionSource: "node" as const }] : []),
  ];
  const targets = nodes.map((node) => ({
    node: node.key,
    action: node.key === "header" ? "patch" as const : "mark_stale" as const,
  }));
  const invalidationActions: CompiledDocumentRuntimePlan["invalidationActions"] = [
    ...input.fields.map((field) => ({
      source: { type: "field" as const, key: field.name },
      targets,
    })),
    ...(input.hasItems ? [{
      source: { type: "node_mutation" as const, key: "items" },
      targets,
    }] : []),
    {
      // Every document operation resolves through this compiled wildcard;
      // the records service still supplies the concrete operation key.
      source: { type: "operation", key: "*" },
      targets,
    },
  ];
  const planHash = sha256(stableStringify({
    nodes,
    invalidationActions,
    versionHash: input.versionHash,
    contractMaterial: input.contractMaterial ?? null,
  }));
  return {
    source: "compiled_v6",
    schemaVersion: "document-edit-runtime/v6.0",
    planVersion: `entity-${input.versionHash.slice(0, 16)}`,
    planHash,
    archetype: input.hasItems ? "document_with_items" : "header_only",
    nodes,
    invalidationActions,
  };
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

function normalizeDetailRenderer(value: unknown): "master" | "document" | "ledger" | "simple" | undefined {
  const normalized = textConfig(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) return undefined;
  if (normalized === "document" || normalized === "document_detail") return "document";
  if (normalized === "ledger" || normalized === "log") return "ledger";
  if (normalized === "simple") return "simple";
  if (["master", "standard", "readonly", "read_only", "read_only_master"].includes(normalized)) return "master";
  return undefined;
}

export function resolveCompiledEntityRenderer(input: {
  entityClass: string;
  tableSchema: string;
  displayConfig: Record<string, unknown>;
  featureFlags: Record<string, unknown>;
}): "master" | "document" | "ledger" | "simple" {
  const rawExplicit = textConfig(input.displayConfig["detail_renderer"]);
  const explicit = normalizeDetailRenderer(rawExplicit);
  if (rawExplicit && !explicit) {
    throw new Error(`Unsupported detail_renderer "${rawExplicit}". Expected master, simple, document, or ledger.`);
  }
  if (explicit) return explicit;
  if (booleanConfig(input.featureFlags["has_workflow"]) === true
    || booleanConfig(input.featureFlags["is_approvable"]) === true) return "document";

  const entityClass = input.entityClass.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (entityClass === "DOCUMENT" || entityClass === "DOCUMENT_RELATION") return "document";
  if (entityClass === "LEDGER" || entityClass === "LOG") return "ledger";
  if (input.displayConfig["document_header"] !== undefined) return "document";
  if (input.tableSchema.trim().toUpperCase() === "DOCUMENT") return "document";
  return "master";
}

export function hasCompiledDocumentItems(input: {
  relations: Array<Record<string, unknown>>;
  displayConfig: Record<string, unknown>;
  featureFlags: Record<string, unknown>;
}): boolean {
  if (booleanConfig(input.featureFlags["has_lines"]) !== true) return false;
  const configuredLineEntity = textConfig(input.displayConfig["line_entity_code"]);
  return input.relations.some((relation) => {
    if (textConfig(relation["relation_kind"])?.toLowerCase() !== "has_many") return false;
    const name = textConfig(relation["name"])?.toLowerCase();
    const targetEntity = textConfig(relation["target_entity"]);
    const uiBehavior = coerceRecord(relation["ui_behavior"]);
    const surface = textConfig(uiBehavior?.["surface"] ?? uiBehavior?.["surface_kind"])
      ?.toLowerCase()
      .replace(/[\s-]+/g, "_");
    return name === "lines"
      || surface === "lines_tab"
      || surface === "line_items"
      || (!!configuredLineEntity && targetEntity === configuredLineEntity);
  });
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

  const rawDetailRenderer = textConfig(raw["detail_renderer"]);
  const detailRenderer = normalizeDetailRenderer(rawDetailRenderer);
  if (rawDetailRenderer && !detailRenderer) {
    throw new Error(`Unsupported detail_renderer "${rawDetailRenderer}". Expected master, simple, document, or ledger.`);
  }
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

/**
 * Reads the group_key for an entity_field row. Prefers the top-level
 * group_key column (per the field-contract-registry phase-4 plan); falls back
 * to legacy ui_hint.group_key for back-compat with older seeds.
 */
function readFieldGroupKey(row: EntityFieldRow): string | null {
  const direct = stringValue(row.group_key);
  if (direct) return direct;
  const uiHint = coerceRecord(row.ui_hint);
  return stringValue(uiHint?.["group_key"]) ?? null;
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
  const dependentFilter = coerceRecord(out["dependent_filter"]);
  if (dependentFilter?.["empty_behavior"] === "empty") {
    out["dependent_filter"] = {
      ...dependentFilter,
      empty_behavior: "none",
    };
  }
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
    projection_alias_of: row.projection_alias_of ?? null,
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
    is_primary_amount: row.is_primary_amount ?? false,
    is_primary_currency: row.is_primary_currency ?? false,
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
    defaults: coerceRecord(row.defaults),
    i18n_key: stringValue(rawUiHint?.["i18n_key"]),
  };
}

export class EntityCompilerService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: Kysely<any>;
  private readonly logger?: Logger;
  private readonly handlerManifest?: CapabilityHandlerManifest;
  private readonly cache = new Map<string, { compiled: CompiledEntity; fetchedAt: number }>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: Kysely<any>, logger?: Logger, handlerManifest?: CapabilityHandlerManifest) {
    this.db = db;
    this.logger = logger;
    this.handlerManifest = handlerManifest;
  }

  /**
   * Compile one platform/base entity and persist its immutable base snapshot.
   *
   * Tenant overlays are deliberately not accepted here. They are persisted as
   * `snapshot.entity_compiled_overlay` deltas and must be composed by the
   * descriptor-serving layer with a tenant-scoped cache key. Treating this
   * compiler as tenant-aware previously made the cache contract misleading:
   * the tenant argument was ignored while callers could reasonably assume the
   * returned result contained that tenant's overlay.
   */
  async compile(entityCode: string): Promise<CompiledEntity | null> {
    return withFrameworkPhase("descriptor_compile", () => this.compileMeasured(entityCode));
  }

  private async compileMeasured(entityCode: string): Promise<CompiledEntity | null> {
    const graphValidation = await this.validateRuntimeGraph([entityCode]);
    if (!graphValidation.passed) {
      this.logger?.warn("entity_compile_preflight_failed", {
        entityCode,
        diagnostics: graphValidation.diagnostics,
      });
      return null;
    }
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
   * L3 loader for the production execution-descriptor provider. The immutable
   * snapshot is preferred; compilation is used only to repair a missing base
   * snapshot. A tenant overlay snapshot may carry either a fully compiled
   * descriptor or the small execution overlay consumed by the pure compiler.
   */
  async loadExecutionDescriptor(entityCode: string, tenantId: string): Promise<SerializedExecutionDescriptorV1 | null> {
    const graphValidation = await this.validateRuntimeGraph([entityCode]);
    if (!graphValidation.passed) {
      this.logger?.warn("entity_descriptor_preflight_failed", {
        entityCode,
        diagnostics: graphValidation.diagnostics,
      });
      return null;
    }
    const snapshot = await sql<{
      entity_version_id: string;
      compiled_json: unknown;
    }>`
      SELECT ec.entity_version_id::text AS entity_version_id,
             ec.compiled_json
        FROM snapshot.entity_compiled ec
        JOIN control.entity_version ev ON ev.id = ec.entity_version_id
        JOIN control.entity e ON e.id = ev.entity_id
       WHERE ev.status = 'EFFECTIVE'
         AND e.is_active = true
         AND e.runtime_enabled = true
       AND e.status = 'ACTIVE'
       AND e.tenant_id IS NULL
       AND ec.artifact_kind = 'execution'
         AND (e.entity_code = ${entityCode} OR e.name = ${entityCode} OR e.slug = ${entityCode.replace(/_/g, "-")})
       ORDER BY ec.created_at DESC
       LIMIT 1
    `.execute(this.db);

    let compiled = coerceRecord(snapshot.rows[0]?.compiled_json) as CompiledEntity | null;
    if (!compiled?.execution_descriptor) {
      compiled = await this.compile(entityCode);
    }
    if (!compiled?.execution_descriptor) return null;

    const overlayResolution = await this.resolveTenantOverlay(compiled, tenantId);
    if (!overlayResolution) return compiled.execution_descriptor;

    const overlay = await sql<{ compiled_json: unknown; compiled_hash: string }>`
      SELECT compiled_json, compiled_hash
        FROM snapshot.entity_compiled_overlay
       WHERE tenant_id = ${tenantId}::uuid
         AND entity_version_id = ${compiled.version_id}::uuid
         AND overlay_hash = ${overlayResolution.overlayHash}
       ORDER BY created_at DESC
       LIMIT 1
    `.execute(this.db).catch(() => ({ rows: [] as Array<{ compiled_json: unknown; compiled_hash: string }> }));
    const overlayRecord = coerceRecord(overlay.rows[0]?.compiled_json);
    const precompiledOverlay = coerceRecord(overlayRecord?.["execution_descriptor"]);
    if (precompiledOverlay) return precompiledOverlay as unknown as SerializedExecutionDescriptorV1;

    const result = compileExecutionDescriptor({
      compiledEntity: compiled,
      handlerRegistry: this.handlerManifest,
      tenantOverlay: overlayResolution.executionOverlay,
    });
    await this.writeOverlaySnapshot(compiled, overlayResolution, result.serialized);
    return result.serialized;
  }

  /** Effective public compiled entity used by the one-call runtime bootstrap. */
  async loadRuntimeCompiledEntity(entityCode: string, tenantId: string): Promise<CompiledEntity | null> {
    const base = await this.compile(entityCode);
    if (!base) return null;
    const overlayResolution = await this.resolveTenantOverlay(base, tenantId);
    return overlayResolution ? applyTenantCatalogOverlay(base, overlayResolution) : base;
  }

  /** Compile an IN_REVIEW/DRAFT version without persistence before activation. */
  async validateVersionForActivation(versionId: string): Promise<CompiledEntity> {
    const row = await (this.db as any)
      .selectFrom("control.entity_version as ev")
      .innerJoin("control.entity as e", "e.id", "ev.entity_id")
      .select(["e.name", "e.entity_code"])
      .where("ev.id", "=", versionId)
      .executeTakeFirst() as { name?: string; entity_code?: string } | undefined;
    const entityCode = row?.entity_code ?? row?.name;
    if (!entityCode) throw new Error(`Entity version '${versionId}' is not bound to an active entity.`);
    const compiled = await this.fullCompile(entityCode, versionId);
    if (!compiled) throw new Error(`Entity version '${versionId}' cannot be compiled for activation.`);
    return compiled;
  }

  /**
   * Compile every active, runtime-enabled system entity. Internal metadata,
   * coverage, view, and projection rows remain registered but are outside the
   * generic records compiler boundary.
   */
  async compileAllSystemEntities(): Promise<CompileAllSummary> {
    let total = 0;
    let compiled = 0;
    let failed = 0;
    const compiledEntityCodes: string[] = [];
    const persistedEntityCodes: string[] = [];
    const snapshotPersistenceFailedEntityCodes: string[] = [];

    try {
      const graphValidation = await this.validateRuntimeGraph();
      const canonicalGraph = await createCanonicalGraphLoader(this.db)();
      const eligibilityByCode = new Map(canonicalGraph.entities.map((entity) => [entity.entity_code, evaluateExecutionEligibility(entity)]));
      const eligibilityDiagnostics = canonicalGraph.entities.flatMap((entity) => {
        const result = eligibilityByCode.get(entity.entity_code);
        if (!result || result.eligible) return [];
        return result.diagnostics.map((diagnostic) => ({
          entityCode: diagnostic.entityCode,
          code: "RUNTIME_WRITE_CAPABILITY_INVALID" as const,
          path: diagnostic.path,
          message: diagnostic.message,
        }));
      });
      graphValidation.diagnostics.push(...eligibilityDiagnostics);
      graphValidation.eligibleEntityCodes = graphValidation.eligibleEntityCodes.filter((code) => eligibilityByCode.get(code)?.eligible === true);
      if (eligibilityDiagnostics.length > 0) graphValidation.passed = false;
      total = graphValidation.eligibleEntityCodes.length;
      if (!graphValidation.passed) {
        this.logger?.error?.("entity_compile_graph_preflight_failed", {
          total,
          diagnostics: graphValidation.diagnostics,
        });
        return {
          total,
          compiled,
          failed: total,
          eligibleEntityCodes: graphValidation.eligibleEntityCodes,
          compiledEntityCodes,
          persistedEntityCodes,
          snapshotPersistenceFailedEntityCodes,
          graphValidation,
        };
      }

      for (const entityCode of graphValidation.eligibleEntityCodes) {
        try {
          const result = await this.fullCompile(entityCode);
          if (result) {
            compiled++;
            compiledEntityCodes.push(entityCode);
            try {
              await this.writeSnapshot(result);
              persistedEntityCodes.push(entityCode);
              this.cache.set(entityCode, { compiled: result, fetchedAt: Date.now() });
            } catch (snapshotError) {
              failed++;
              snapshotPersistenceFailedEntityCodes.push(entityCode);
              this.logger?.warn("entity_snapshot_persistence_failed", {
                entityCode,
                err: snapshotError instanceof Error ? snapshotError.message : String(snapshotError),
              });
            }
          } else {
            failed++;
            this.logger?.warn("entity_compile_skipped", {
              entityCode,
              reason: "No effective active entity metadata found",
            });
          }
        } catch (err) {
          failed++;
          this.logger?.warn(err instanceof ExecutionDescriptorActivationError
            ? "entity_activation_validation_failed"
            : "entity_compile_failed", {
            entityCode,
            err: err instanceof Error ? err.message : String(err),
            ...(err instanceof ExecutionDescriptorActivationError
              ? { diagnostics: err.diagnostics }
              : {}),
          });
        }
      }

      return {
        total,
        compiled,
        failed,
        eligibleEntityCodes: graphValidation.eligibleEntityCodes,
        compiledEntityCodes,
        persistedEntityCodes,
        snapshotPersistenceFailedEntityCodes,
        graphValidation,
      };
    } catch (err) {
      this.logger?.warn("entity_compile_warmup_failed", {
        err: err instanceof Error ? err.message : String(err),
      });
      const graphValidation = {
        passed: false,
        eligibleEntityCodes: [],
        diagnostics: [{
          entityCode: "<graph>",
          code: "GRAPH_QUERY_FAILED" as const,
          path: "$",
          message: err instanceof Error ? err.message : String(err),
        }],
      } satisfies MetadataGraphValidationResult;
      return {
        total,
        compiled,
        failed: failed || 1,
        eligibleEntityCodes: graphValidation.eligibleEntityCodes,
        compiledEntityCodes,
        persistedEntityCodes,
        snapshotPersistenceFailedEntityCodes,
        graphValidation,
      };
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

  private async fullCompile(entityCode: string, selectedVersionId?: string): Promise<CompiledEntity | null> {
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
        "e.create_mode",
        "e.draft_ttl_hours",
        "e.numbering_strategy",
        "e.table_schema",
        "e.table_name",
        "e.backing_type",
        "e.runtime_enabled",
        "e.primary_key",
        "e.tenant_column",
        "e.read_capability",
        "e.write_capability",
        "e.concurrency_policy",
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
      .where("e.runtime_enabled" as never, "=" as never, true as never)
      .where("e.status" as never, "=" as never, "ACTIVE" as never)
      .executeTakeFirst() as EntityRow | undefined;

    if (!entityRow) return null;

    let versionQuery = this.db
      .selectFrom("control.entity_version as ev" as never)
      .select(["ev.id", "ev.version_no", "ev.version_hash"] as never[])
      .where("ev.entity_id" as never, "=" as never, entityRow.id as never)
      .where("ev.tenant_id" as never, "is" as never, null as never);
    versionQuery = selectedVersionId
      ? versionQuery.where("ev.id" as never, "=" as never, selectedVersionId as never)
      : versionQuery.where("ev.status" as never, "=" as never, "EFFECTIVE" as never);
    const versionRows = await versionQuery.execute() as EntityVersionRow[];
    if ((!selectedVersionId && versionRows.length !== 1) || (selectedVersionId && versionRows.length !== 1)) return null;
    const versionRow = versionRows[0];

    if (!versionRow) return null;

    const fieldRows = await this.db
      .selectFrom("control.entity_field as ef" as never)
      .selectAll("ef" as never)
      .where("ef.entity_version_id" as never, "=" as never, versionRow.id as never)
      .where("ef.tenant_id" as never, "is" as never, null as never)
      .where("ef.is_active" as never, "=" as never, true as never)
      .where("ef.runtime_enabled" as never, "=" as never, true as never)
      .orderBy("ef.sort_order" as never, "asc")
      .execute() as EntityFieldRow[];

    const classProfile = await this.loadClassProfile(entityRow.entity_class);
    const referencePickerProfiles = await this.loadReferencePickerProfiles(fieldRows);
    const fields = fieldRows.map((row) => mapField(row, referencePickerProfiles));
    const fieldGroups = await this.loadFieldGroups(entityRow.entity_class, fieldRows);
    const relations = await this.loadRelations(versionRow.id);
    const displayConfig = normalizeDisplayConfig(
      coerceRecord(entityRow.display_config) ?? {},
      entityRow.icon_key,
      entityRow.color_token,
    );
    const identityConfig = {
      ...(coerceRecord(entityRow.identity_config) ?? {}),
      primary_key: entityRow.primary_key,
      tenant_column: entityRow.tenant_column,
    };
    const searchConfig = coerceRecord(entityRow.search_config) ?? {};
    const dataPolicy = coerceRecord(entityRow.data_policy) ?? {};
    const featureFlags = normalizeFeatureFlags(coerceRecord(entityRow.feature_flags) ?? {});
    const versionHash = versionRow.version_hash ?? sha256(`${entityRow.id}:v${versionRow.version_no}`);
    const renderer = resolveCompiledEntityRenderer({
      entityClass: entityRow.entity_class,
      tableSchema: entityRow.table_schema,
      displayConfig,
      featureFlags,
    });
    const documentRuntimePlan = compileDocumentRuntimePlan({
      renderer,
      versionHash,
      hasItems: hasCompiledDocumentItems({ relations, displayConfig, featureFlags }),
      fields,
      contractMaterial: {
        documentRuntime: displayConfig["document_runtime"] ?? null,
        relations,
      },
    });
    const lifecycleStates = await (this.db as any)
      .selectFrom("control.entity_lifecycle as el")
      .innerJoin("control.lifecycle as lc", "lc.id", "el.lifecycle_id")
      .innerJoin("control.lifecycle_state as ls", "ls.lifecycle_id", "lc.id")
      .select(["ls.code", "ls.is_initial", "ls.is_terminal", "ls.state_flags"])
      .where("el.entity_name", "=", entityRow.entity_code ?? entityRow.name)
      .where("el.tenant_id", "is", null)
      .where("lc.is_active", "=", true)
      .orderBy("el.priority", "asc")
      .orderBy("ls.sort_order", "asc")
      .execute() as Array<{
        code: string; is_initial: boolean; is_terminal: boolean; state_flags: Record<string, unknown>;
      }>;
    const operations = await this.loadMutationOperations(entityRow.name);
    const capabilityManifest = compileEntityCapabilityManifest({
      entityCode: entityRow.entity_code ?? entityRow.name,
      entityVersionId: versionRow.id,
      renderer,
      backingType: entityRow.backing_type,
      mutability: entityRow.mutability,
      featureFlags,
      displayConfig,
      dataPolicy,
      fields: fieldRows,
      relations,
      operations,
      hasDocumentRuntime: documentRuntimePlan !== undefined,
      lifecycleStates: lifecycleStates.map((state) => ({
        code: state.code,
        isInitial: state.is_initial,
        isTerminal: state.is_terminal,
        stateFlags: state.state_flags ?? {},
      })),
      handlerManifest: this.handlerManifest,
    });

    const payloadWithoutHash = {
      entity_id: entityRow.id,
      entity_code: entityRow.entity_code ?? entityRow.name,
      slug: entityRow.slug ?? entityRow.table_name.replace(/_/g, "-"),
      entity_name: entityRow.label_singular ?? entityRow.name,
      entity_class: entityRow.entity_class,
      create_mode: entityRow.create_mode ?? "FORM_ONLY",
      draft_ttl_hours: entityRow.draft_ttl_hours ?? null,
      numbering_strategy: entityRow.numbering_strategy ?? "none",
      table_schema: entityRow.table_schema,
      table_name: entityRow.table_name,
      backing_type: entityRow.backing_type,
      runtime_enabled: entityRow.runtime_enabled,
      primary_key: entityRow.primary_key,
      tenant_column: entityRow.tenant_column,
      read_capability: entityRow.read_capability,
      write_capability: entityRow.write_capability,
      concurrency_policy: coerceRecord(entityRow.concurrency_policy) ?? {},
      version_id: versionRow.id,
      version_no: Number(versionRow.version_no),
      version_hash: versionHash,
      fields,
      field_groups: fieldGroups,
      relations,
      display_config: displayConfig,
      identity_config: identityConfig,
      search_config: searchConfig,
      data_policy: dataPolicy,
      feature_flags: featureFlags,
      governance_level: entityRow.governance_level,
      security_tier: entityRow.security_tier,
      mutability: entityRow.mutability,
      class_profile: classProfile,
      ...(documentRuntimePlan ? { document_runtime_plan: documentRuntimePlan } : {}),
      capability_manifest: capabilityManifest,
      compiled_at: new Date().toISOString(),
    };

    const sourceCompiled = {
      ...payloadWithoutHash,
      compiled_hash: sha256(JSON.stringify(payloadWithoutHash)),
    } as Omit<CompiledEntity, "execution_descriptor" | "execution_diagnostics">;
    const execution = compileExecutionDescriptor({
      compiledEntity: sourceCompiled,
      handlerRegistry: this.handlerManifest,
    });
    return {
      ...sourceCompiled,
      compiled_hash: execution.serialized.identity.compiledHash,
      execution_descriptor: execution.serialized,
      execution_diagnostics: [...execution.diagnostics],
    };
  }

  private async loadRelations(versionId: string): Promise<Array<Record<string, unknown>>> {
    return this.db
      .selectFrom("control.entity_relation as er" as never)
      .select([
        sql<string>`er.id::text`.as("id"),
        "er.name",
        "er.relation_kind",
        "er.target_entity",
        "er.resolution_kind",
        "er.fk_field",
        "er.target_key",
        "er.source_type_field",
        "er.source_type_value",
        "er.source_id_field",
        "er.source_line_field",
        "er.runtime_role",
        "er.on_delete",
        "er.record_filter",
        "er.ui_behavior",
      ] as never[])
      .where("er.entity_version_id" as never, "=" as never, versionId as never)
      .where("er.tenant_id" as never, "is" as never, null as never)
      .orderBy("er.name" as never, "asc" as never)
      .execute() as Promise<Array<Record<string, unknown>>>;
  }

  private async loadMutationOperations(entityCode: string): Promise<CapabilityOperationInput[]> {
    const rows = await (this.db as any)
      .selectFrom("control.entity_operation as eo")
      .leftJoin("shared.permission as p", "p.code", "eo.permission_code")
      .select([
        "eo.permission_code",
        "eo.is_enabled",
        sql<boolean>`p.code IS NOT NULL AND p.status = 'active'`.as("permission_registered"),
      ] as never[])
      .where("eo.entity_name" as never, "=" as never, entityCode as never)
      .where("eo.tenant_id" as never, "is" as never, null as never)
      .execute() as Array<{ permission_code: string; is_enabled: boolean; permission_registered: boolean }>;
    return rows.map((row) => ({
      permissionCode: row.permission_code,
      enabled: row.is_enabled,
      permissionRegistered: row.permission_registered,
    }));
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

  /**
   * Compiles field_groups for the entity by:
   *   1. Loading control.field_group rows whose applies_to_classes contains
   *      the entity's class (e.g. 'DOCUMENT').
   *   2. Grouping the entity's field rows by entity_field.group_key (falling
   *      back to ui_hint.group_key for legacy back-compat).
   *   3. Emitting only groups that have at least one field assigned.
   * Fields with a group_key that doesn't match any field_group row are
   * collected into an "ungrouped" entry so they remain renderable.
   */
  private async loadFieldGroups(
    entityClass: string,
    fieldRows: EntityFieldRow[],
  ): Promise<CompiledEntity["field_groups"]> {
    if (fieldRows.length === 0) return [];

    // Bucket field names by their assigned group_key
    const fieldsByGroup = new Map<string, string[]>();
    for (const field of fieldRows) {
      const groupKey = readFieldGroupKey(field);
      if (!groupKey) continue;
      const bucket = fieldsByGroup.get(groupKey);
      if (bucket) bucket.push(field.name);
      else fieldsByGroup.set(groupKey, [field.name]);
    }
    if (fieldsByGroup.size === 0) return [];

    const groupKeys = [...fieldsByGroup.keys()];
    const groupRows = await this.db
      .selectFrom("control.field_group as fg" as never)
      .select([
        "fg.group_key", "fg.label", "fg.description", "fg.sort_order",
        "fg.applies_to_classes", "fg.ui_intent",
      ] as never[])
      .where("fg.group_key" as never, "in" as never, groupKeys as never)
      .execute() as Array<{
        group_key: string;
        label: string;
        description: string | null;
        sort_order: number;
        applies_to_classes: string[];
        ui_intent: string | null;
      }>;

    const byKey = new Map(groupRows.map((row) => [row.group_key, row]));
    const result: CompiledEntity["field_groups"] = [];
    for (const [groupKey, fieldNames] of fieldsByGroup) {
      const groupRow = byKey.get(groupKey);
      if (groupRow) {
        // Only emit groups whose applies_to_classes covers this entity's class
        if (!groupRow.applies_to_classes.includes(entityClass)) continue;
        result.push({
          group_key: groupRow.group_key,
          label: groupRow.label,
          description: groupRow.description,
          sort_order: Number(groupRow.sort_order),
          ui_intent: groupRow.ui_intent ?? null,
          fields: fieldNames,
        });
      } else {
        // Orphan group_key — emit fallback so fields still render somewhere
        result.push({
          group_key: groupKey,
          label: groupKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          description: null,
          sort_order: 9999,
          ui_intent: null,
          fields: fieldNames,
        });
      }
    }

    result.sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
    return result;
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
        tenant_id: null,
        entity_version_id: compiled.version_id,
        artifact_kind: "execution",
        compiled_json: compiled as never,
        compiled_hash: compiled.compiled_hash,
        compliance_report: {},
        created_by: SYSTEM_ACTOR_ID,
      } as never)
      .onConflict((oc: any) =>
        oc.columns(["tenant_id", "entity_version_id", "artifact_kind"] as never[])
          // Compiled snapshots are immutable. A version may already have been
          // compiled by a prior startup or invalidation; retaining that row is
          // correct because a changed definition must publish a new version.
          .doNothing()
      )
      .execute();
  }

  private async writeOverlaySnapshot(
    compiled: CompiledEntity,
    resolution: TenantOverlayResolution,
    descriptor: SerializedExecutionDescriptorV1,
  ): Promise<void> {
    const effectiveCatalog = applyTenantCatalogOverlay(compiled, resolution);
    await this.db
      .insertInto("snapshot.entity_compiled_overlay" as never)
      .values({
        tenant_id: resolution.tenantId,
        entity_version_id: resolution.entityVersionId,
        overlay_set: resolution.overlaySet as never,
        overlay_hash: resolution.overlayHash,
        base_compiled_hash: resolution.baseCompiledHash,
        compiled_json: {
          execution_descriptor: descriptor,
          compiled_entity: effectiveCatalog,
        } as never,
        compiled_hash: descriptor.identity.compiledHash,
        created_by: SYSTEM_ACTOR_ID,
      } as never)
      .onConflict((oc: any) => oc.columns(["tenant_id", "entity_version_id", "overlay_hash"] as never[]).doNothing())
      .execute();
  }

  private async resolveTenantOverlay(
    compiled: CompiledEntity,
    tenantId: string,
  ): Promise<TenantOverlayResolution | null> {
    return resolveTenantOverlay({
      query: <T extends object>(text: string, values?: readonly unknown[]) =>
        this.db.executeQuery<T>(CompiledQuery.raw(text, values ? [...values] : [])),
    }, {
      tenantId,
      entityId: compiled.entity_id,
      entityCode: compiled.entity_code,
      entityVersionId: compiled.version_id,
      baseCompiledHash: compiled.compiled_hash,
      fields: compiled.fields,
    });
  }

  private async validateRuntimeGraph(entityCodes?: readonly string[]): Promise<MetadataGraphValidationResult> {
    return validateMetadataGraph({
      query: <T extends object>(text: string, values?: readonly unknown[]) =>
        this.db.executeQuery<T>(CompiledQuery.raw(text, values ? [...values] : [])),
    }, entityCodes ? { entityCodes } : {});
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createEntityCompilerService(
  db: Kysely<any>,
  logger?: Logger,
  handlerManifest?: CapabilityHandlerManifest,
): EntityCompilerService {
  return new EntityCompilerService(db, logger, handlerManifest);
}
