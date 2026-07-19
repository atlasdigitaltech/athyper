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
import { buildMetaEntityContractV2 } from "./meta-entity-contract-v2.js";
import type { MetaEntityContractV2 } from "@athyper/api-contracts/meta-entity-contract-v2";
import {
  resolveEntityListCachePolicy,
  type EntityListCachePolicy,
} from "@athyper/api-contracts/entity-cache-policy";
import { normalizeEntityFeatureFlags, normalizeEntityListFeatures } from "@athyper/api-contracts/metadata-normalizers";
import {
  applyTenantCatalogOverlay,
  resolveTenantOverlay,
  type TenantOverlayResolution,
} from "./tenant-overlay-resolver.js";

export interface CompiledField {
  id: string;
  entity_version_id: string;
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
  semantic_roles: string[];
  type_config: Record<string, unknown>;
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
  cache_policy: EntityListCachePolicy;
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
  /** Canonical v2 graph. Legacy response properties above are derived only. */
  contract_v2?: MetaEntityContractV2;
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

/** Compact, log-safe view of graph diagnostics. Individual entity details remain
 * available on the returned graphValidation object, but are too noisy for API
 * server logs during a system-wide preflight. */
export interface MetadataDiagnosticLogSummary {
  diagnosticCount: number;
  affectedEntityCount: number;
  codeCounts: Record<string, number>;
  pathCounts: Record<string, number>;
}

export function summarizeMetadataDiagnostics(
  diagnostics: Array<{ entityCode: string; code: string; path: string }>,
): MetadataDiagnosticLogSummary {
  const entityCodes = new Set<string>();
  const codeCounts: Record<string, number> = {};
  const pathCounts: Record<string, number> = {};

  for (const diagnostic of diagnostics) {
    entityCodes.add(diagnostic.entityCode);
    codeCounts[diagnostic.code] = (codeCounts[diagnostic.code] ?? 0) + 1;
    pathCounts[diagnostic.path] = (pathCounts[diagnostic.path] ?? 0) + 1;
  }

  return {
    diagnosticCount: diagnostics.length,
    affectedEntityCount: entityCodes.size,
    codeCounts,
    pathCounts,
  };
}

interface EntityRow {
  id: string;
  name: string;
  module_id: string;
  module_code: string | null;
  slug: string | null;
  entity_code: string;
  label_singular: string | null;
  label_plural: string | null;
  description: string | null;
  entity_class: string;
  ownership_model: "system" | "tenant" | "package" | "overlay";
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
  plane_eligibility: string[];
  status: "DRAFT" | "ACTIVE" | "DEPRECATED" | "RETIRED";
  is_active: boolean;
}

interface EntityVersionRow {
  id: string;
  version_no: number;
  version_hash: string | null;
}

interface EntityFieldRow {
  id: string;
  entity_version_id: string;
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
  semantic_roles?: unknown;
  type_config?: unknown;
}

interface EntityVersionContractV2Row {
  id: string;
  tenant_id: string | null;
  entity_version_id: string;
  runtime_enabled: boolean;
  api_exposure: string;
  backing_type: string;
  table_schema: string;
  table_name: string;
  primary_key: string | null;
  tenant_column: string | null;
  read_capability: string;
  write_capability: string;
  create_mode: string;
  draft_ttl_hours: number | null;
  governance_level: string;
  security_tier: string;
  mutability: string;
  read_handler: string | null;
  write_handler: string | null;
  source_kind: string;
  contract_hash: string | null;
  identity_config: unknown;
  search_config: unknown;
  data_policy: unknown;
  concurrency_config: unknown;
  storage_config: unknown;
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
  cache_policy: unknown;
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
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
  const configuredLineEntity = resolveCompiledLineEntityCode(input);
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

/**
 * Resolve the legacy line_entity_code projection from the canonical relation
 * graph. The v2 contract owns the relation; this value exists only so older
 * compiled-entity consumers do not report a false missing-lines diagnostic.
 */
export function resolveCompiledLineEntityCode(input: {
  relations: Array<Record<string, unknown>>;
  displayConfig: Record<string, unknown>;
  featureFlags: Record<string, unknown>;
}): string | undefined {
  const configured = textConfig(input.displayConfig["line_entity_code"]);
  if (configured) return configured;
  if (booleanConfig(input.featureFlags["has_lines"]) !== true) return undefined;

  const relation = input.relations.find((candidate) => {
    if (textConfig(candidate["relation_kind"])?.toLowerCase() !== "has_many") return false;
    const name = textConfig(candidate["name"])?.toLowerCase();
    const uiBehavior = coerceRecord(candidate["ui_behavior"]);
    const surface = textConfig(uiBehavior?.["surface"] ?? uiBehavior?.["surface_kind"])
      ?.toLowerCase()
      .replace(/[\s-]+/g, "_");
    return name === "lines" || surface === "lines_tab" || surface === "line_items";
  });
  return relation ? textConfig(relation["target_entity"]) : undefined;
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
  const listFeatures = normalizeEntityListFeatures(raw["list_features"] ?? raw["listFeatures"]);
  if (listFeatures) out["list_features"] = listFeatures;
  delete out["listFeatures"];
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
    entity_version_id: row.entity_version_id,
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
    semantic_roles: Array.isArray((row as EntityFieldRow & { semantic_roles?: unknown }).semantic_roles)
      ? ((row as EntityFieldRow & { semantic_roles?: unknown }).semantic_roles as unknown[]).filter((v): v is string => typeof v === "string")
      : [],
    type_config: coerceRecord((row as EntityFieldRow & { type_config?: unknown }).type_config) ?? { kind: "scalar" },
  };
}

function canonicalIdentityConfig(
  raw: Record<string, unknown>,
  fields: ReadonlyArray<CompiledField> = [],
  relations: ReadonlyArray<Record<string, unknown>> = [],
): MetaEntityContractV2["version_contract"]["identity_config"] {
  const display = coerceRecord(raw["display_identity"]) ?? {};
  const duplicate = coerceRecord(raw["duplicate_check"]) ?? {};
  const replacement = textConfig(raw["replacement_for"] ?? raw["replacement"]);
  const fieldNames = new Set(fields.map((field) => field.name));
  const primaryKey = textConfig(raw["primary_key_field"] ?? raw["primary_key"]);
  const validFields = (value: unknown): string[] => stringArray(value).filter((field) => fieldNames.has(field));
  const requestedTitle = textConfig(display["title_field"] ?? raw["title_field"]);
  const titleField = requestedTitle && fieldNames.has(requestedTitle)
    ? requestedTitle
    : fieldNames.has("name") ? "name" : primaryKey && fieldNames.has(primaryKey) ? primaryKey : "id";
  const relationCodes = new Set(relations.map((relation) => canonicalCode(relation["relation_code"] ?? relation["name"], "relation")));
  const requestedParent = textConfig(raw["parent_entity"])
    ?? textConfig(coerceRecord(raw["parent"])?.["relation"]);
  const parentRelation = requestedParent && relationCodes.has(canonicalCode(requestedParent, "relation"))
    ? canonicalCode(requestedParent, "relation")
    : null;
  const requestedSubtitle = textConfig(display["subtitle_field"] ?? raw["subtitle_field"]);
  return {
    primary_key_field: primaryKey && fieldNames.has(primaryKey) ? primaryKey : "id",
    business_key_fields: validFields(raw["business_key_fields"]),
    natural_key_fields: validFields(raw["natural_key_fields"]),
    display_identity: {
      title_field: titleField,
      subtitle_field: requestedSubtitle && fieldNames.has(requestedSubtitle) ? requestedSubtitle : null,
    },
    parent: parentRelation ? { relation: parentRelation } : null,
    identity_via: textConfig(raw["identity_via"]) ?? null,
    list_entity_code: textConfig(raw["list_entity_code"]) ?? null,
    duplicate_check: {
      enabled: duplicate["enabled"] === true,
      fields: validFields(duplicate["fields"]),
      scope: ["company", "global"].includes(String(duplicate["scope"])) ? duplicate["scope"] as "company" | "global" : "tenant",
    },
    replacement: replacement ? { entity_code: replacement } : null,
  };
}

function canonicalSearchConfig(
  raw: Record<string, unknown>,
  fields: ReadonlyArray<CompiledField>,
): MetaEntityContractV2["version_contract"]["search_config"] {
  const fieldNames = new Set(fields.map((field) => field.name));
  const rawFields = Array.isArray(raw["fields"]) ? raw["fields"] : [];
  const configured = rawFields.map((field) => {
    if (typeof field === "string") return { field, weight: 1 };
    const item = coerceRecord(field);
    return item && typeof item["field"] === "string"
      ? { field: item["field"], weight: Number(item["weight"] ?? 1) }
      : null;
  }).filter((field): field is { field: string; weight: number } => field !== null && fieldNames.has(field.field));
  const fallback = fields.filter((field) => field.is_searchable).map((field) => ({ field: field.name, weight: 1 }));
  return {
    enabled: raw["enabled"] !== false,
    mode: ["client", "both"].includes(String(raw["mode"])) ? raw["mode"] as "client" | "both" : "server",
    fields: [...new Map((configured.length > 0 ? configured : fallback).map((field) => [field.field, {
      field: field.field,
      weight: Math.max(1, Math.min(100, Math.round(field.weight))),
    }])).values()],
    minimum_query_length: Number(raw["minimum_query_length"] ?? 2),
    operator: ["prefix", "exact"].includes(String(raw["operator"])) ? raw["operator"] as "prefix" | "exact" : "contains",
  };
}

function canonicalDataPolicy(
  raw: Record<string, unknown>,
  fields: ReadonlyArray<CompiledField>,
): MetaEntityContractV2["version_contract"]["data_policy"] {
  const retention = coerceRecord(raw["retention"]) ?? {};
  const deletion = coerceRecord(raw["deletion"]) ?? {};
  const configuredPii = Array.isArray(raw["pii_fields"])
    ? raw["pii_fields"].filter((field): field is string => typeof field === "string")
    : [];
  const fieldNames = new Set(fields.map((field) => field.name));
  return {
    classification: ["public", "confidential", "restricted"].includes(String(raw["classification"]))
      ? raw["classification"] as "public" | "confidential" | "restricted" : "internal",
    retention: {
      days: retention["days"] == null ? null : Number(retention["days"]),
      legal_hold_eligible: retention["legal_hold_eligible"] === true,
    },
    deletion: { anonymize: deletion["anonymize"] === true },
    pii_fields: (configuredPii.length > 0 ? configuredPii : fields.filter((field) => field.is_pii).map((field) => field.name))
      .filter((field) => fieldNames.has(field)),
  };
}

function canonicalConcurrencyConfig(
  raw: Record<string, unknown>,
  fields: ReadonlyArray<CompiledField> = [],
): MetaEntityContractV2["version_contract"]["concurrency_config"] {
  const configuredRowVersion = textConfig(raw["row_version_field"] ?? raw["rowVersionField"]);
  const rowVersionField = configuredRowVersion
    ? fields.find((field) => field.name === configuredRowVersion || field.column_name === configuredRowVersion)?.name ?? null
    : null;
  return {
    strategy: ["version", "lease_plus_version"].includes(String(raw["strategy"])) ? raw["strategy"] as "version" | "lease_plus_version" : "none",
    rollout: ["optional", "enforced"].includes(String(raw["rollout"])) ? raw["rollout"] as "optional" | "enforced" : "observe",
    row_version_field: rowVersionField,
    lock_required: raw["lock_required"] === true,
  };
}

function canonicalStorageConfig(raw: Record<string, unknown>): MetaEntityContractV2["version_contract"]["storage_config"] {
  const discriminator = coerceRecord(raw["discriminator"]);
  const partition = coerceRecord(raw["partition"]);
  const external = coerceRecord(raw["external_source"] ?? raw["externalSource"]);
  const indexes = Array.isArray(raw["indexes"]) ? raw["indexes"].map((item) => {
    const index = coerceRecord(item);
    if (!index || typeof index["name"] !== "string" || !Array.isArray(index["columns"])) return null;
    return {
      name: index["name"],
      columns: index["columns"].filter((value): value is string => typeof value === "string"),
      unique: index["unique"] === true || index["is_unique"] === true,
      method: ["gin", "gist", "hash"].includes(String(index["method"])) ? index["method"] as "gin" | "gist" | "hash" : "btree",
      where: textConfig(index["where"] ?? index["where_clause"]),
    };
  }).filter((item): item is NonNullable<typeof item> => item !== null) : [];
  return {
    discriminator: discriminator && textConfig(discriminator["column"]) && textConfig(discriminator["value"])
      ? { column: textConfig(discriminator["column"])!, value: textConfig(discriminator["value"])! } : null,
    partition: partition && textConfig(partition["parent_entity"]) && textConfig(partition["key"])
      ? { parent_entity: textConfig(partition["parent_entity"])!, key: textConfig(partition["key"])! } : null,
    external_source: external && textConfig(external["provider"]) && textConfig(external["resource"])
      ? { provider: textConfig(external["provider"])!, resource: textConfig(external["resource"])!, read_handler: textConfig(external["read_handler"]) ?? null } : null,
    indexes: indexes as MetaEntityContractV2["version_contract"]["storage_config"]["indexes"],
  };
}

function canonicalCode(value: unknown, fallback: string): string {
  const normalized = String(value ?? fallback).toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^([^a-z_])/, "_$1");
  return /^[a-z_][a-z0-9_]*$/.test(normalized) ? normalized : fallback;
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
      // The canonical graph also contains active catalog-only entities. They
      // are intentionally not execution candidates and must not be rejected
      // by the execution admission gate.
      const runtimeCandidateCodes = new Set(graphValidation.eligibleEntityCodes);
      const eligibilityByCode = new Map(
        canonicalGraph.entities
          .filter((entity) => runtimeCandidateCodes.has(entity.entity_code))
          .map((entity) => [entity.entity_code, evaluateExecutionEligibility(entity)]),
      );
      const eligibilityDiagnostics = canonicalGraph.entities
        .filter((entity) => runtimeCandidateCodes.has(entity.entity_code))
        .flatMap((entity) => {
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
          diagnostics: summarizeMetadataDiagnostics(graphValidation.diagnostics),
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
        "e.module_id",
        sql<string | null>`(
          SELECT m.code
            FROM shared.module AS m
           WHERE m.id::text = e.module_id
              OR lower(m.code) = lower(e.module_id)
           ORDER BY CASE WHEN m.id::text = e.module_id THEN 0 ELSE 1 END
           LIMIT 1
        )`.as("module_code"),
        "e.slug",
        "e.entity_code",
        "e.label_singular",
        "e.label_plural",
        "e.description",
        "e.entity_class",
        "e.ownership_model",
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
        "e.plane_eligibility",
        "e.status",
        "e.is_active",
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

    const versionContract = await this.loadVersionContractV2(versionRow.id);

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
    const surfaces = await this.loadContractSurfaces(versionRow.id, entityRow.id);
    const contractOperations = await this.loadContractOperations(versionRow.id, entityRow.entity_code ?? entityRow.name);
    const numbering = await this.loadContractNumbering(entityRow.id, fields);
    const contractLifecycle = await this.loadContractLifecycle([entityRow.entity_code ?? entityRow.name, entityRow.name], fields);
    const contractFlows = await this.loadContractFlows(
      versionRow.id,
      contractOperations.map((operation) => operation.operation_code),
    );
    const displayConfig = normalizeDisplayConfig(
      coerceRecord(entityRow.display_config) ?? {},
      entityRow.icon_key,
      entityRow.color_token,
    );
    const identityConfig = {
      ...(coerceRecord(versionContract?.identity_config) ?? coerceRecord(entityRow.identity_config) ?? {}),
      primary_key: entityRow.primary_key,
      tenant_column: entityRow.tenant_column,
    };
    const searchConfig = coerceRecord(versionContract?.search_config) ?? coerceRecord(entityRow.search_config) ?? {};
    const dataPolicy = coerceRecord(versionContract?.data_policy) ?? coerceRecord(entityRow.data_policy) ?? {};
    const effectiveMutability = versionContract?.mutability ?? entityRow.mutability;
    const cachePolicy = resolveEntityListCachePolicy({
      entityPolicy: coerceRecord(displayConfig["list_cache"] ?? displayConfig["listCache"]) ?? {},
      entityClassPolicy: coerceRecord(classProfile?.["cache_policy"]) ?? {},
      dataClassification: textConfig(dataPolicy["classification"]) ?? null,
      mutable: !["locked", "immutable"].includes(effectiveMutability.trim().toLowerCase()),
    });
    const piiFields = new Set(stringArray(dataPolicy["pii_fields"]));
    for (const field of fields) {
      // PII is owned by data_policy. The legacy field flag is populated only
      // as a derived compatibility projection for existing clients.
      field.is_pii = piiFields.has(field.name);
      if (field.semantic_roles.includes("money.primary_amount")) field.is_primary_amount = true;
      if (field.semantic_roles.includes("money.currency")) field.is_primary_currency = true;
    }
    const featureFlags = normalizeEntityFeatureFlags(coerceRecord(entityRow.feature_flags) ?? {});
    const derivedLineEntityCode = resolveCompiledLineEntityCode({
      relations,
      displayConfig,
      featureFlags,
    });
    if (!textConfig(displayConfig["line_entity_code"]) && derivedLineEntityCode) {
      displayConfig["line_entity_code"] = derivedLineEntityCode;
    }
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

    const contractV2 = buildMetaEntityContractV2({
      catalog: {
        id: entityRow.id,
        tenant_id: null,
        module_id: canonicalCode(entityRow.module_code ?? entityRow.module_id, "platform"),
        entity_code: entityRow.entity_code,
        slug: entityRow.slug ?? entityRow.entity_code.replace(/_/g, "-"),
        entity_class: entityRow.entity_class,
        ownership_model: entityRow.ownership_model,
        label_singular: entityRow.label_singular ?? entityRow.name,
        label_plural: entityRow.label_plural ?? `${entityRow.label_singular ?? entityRow.name}s`,
        description: entityRow.description,
        icon_key: entityRow.icon_key,
        color_token: entityRow.color_token,
        plane_eligibility: entityRow.plane_eligibility.filter((plane): plane is "neon" | "admin" | "mesh" => plane === "neon" || plane === "admin" || plane === "mesh"),
        status: entityRow.status,
        is_active: entityRow.is_active,
      },
      version_contract: {
        id: versionContract?.id ?? versionRow.id,
        tenant_id: versionContract?.tenant_id ?? null,
        entity_version_id: versionRow.id,
        runtime_enabled: versionContract?.runtime_enabled ?? entityRow.runtime_enabled,
        api_exposure: (versionContract?.api_exposure ?? (entityRow.runtime_enabled ? "API" : "CATALOG_ONLY")) as "NONE" | "CATALOG_ONLY" | "API",
        backing_type: (versionContract?.backing_type ?? entityRow.backing_type) as "table" | "view" | "materialized_view" | "external" | "virtual",
        table_schema: versionContract?.table_schema ?? entityRow.table_schema,
        table_name: versionContract?.table_name ?? entityRow.table_name,
        primary_key: versionContract?.primary_key ?? entityRow.primary_key ?? "id",
        tenant_column: versionContract?.tenant_column ?? entityRow.tenant_column,
        read_capability: (versionContract?.read_capability ?? entityRow.read_capability) as "none" | "generic" | "facade" | "projection",
        write_capability: (versionContract?.write_capability ?? entityRow.write_capability) as "none" | "generic" | "facade" | "append_only",
        create_mode: (versionContract?.create_mode ?? entityRow.create_mode ?? "FORM_ONLY") as "FORM_ONLY" | "EARLY_DRAFT" | "DIRECT_CREATE" | "SOURCE_DOCUMENT_CREATE",
        draft_ttl_hours: versionContract?.draft_ttl_hours ?? entityRow.draft_ttl_hours ?? null,
        governance_level: versionContract?.governance_level ?? entityRow.governance_level,
        security_tier: versionContract?.security_tier ?? entityRow.security_tier,
        mutability: versionContract?.mutability ?? entityRow.mutability,
        read_handler: versionContract?.read_handler ?? null,
        write_handler: versionContract?.write_handler ?? null,
        source_kind: (versionContract?.source_kind ?? "derived") as "explicit" | "derived" | "overlay",
        contract_hash: versionContract?.contract_hash ?? null,
        identity_config: canonicalIdentityConfig(identityConfig, fields, relations),
        search_config: canonicalSearchConfig(searchConfig, fields),
        data_policy: canonicalDataPolicy(dataPolicy, fields),
        concurrency_config: canonicalConcurrencyConfig(
          coerceRecord(versionContract?.concurrency_config) ?? coerceRecord(entityRow.concurrency_policy) ?? {},
          fields,
        ),
        storage_config: canonicalStorageConfig(
          coerceRecord(versionContract?.storage_config) ?? {
            discriminator: null,
            partition: null,
            external_source: null,
            indexes: [],
          },
        ),
      },
      fields: fields as unknown as ReadonlyArray<Record<string, unknown>>,
      relations,
      surfaces,
      operations: contractOperations,
      lifecycle: contractLifecycle,
      numbering,
      policy: {
        access_mode: "default_deny",
        company_scope_mode: "none",
        audit_mode: "enabled",
        retention_policy: {},
        default_filters: {},
        cache_flags: {},
        cache_policy: cachePolicy,
      },
      flows: contractFlows,
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
      cache_policy: cachePolicy,
      display_config: displayConfig,
      identity_config: identityConfig,
      search_config: searchConfig,
      data_policy: dataPolicy,
      feature_flags: featureFlags,
      contract_v2: contractV2,
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

  private async loadVersionContractV2(versionId: string): Promise<EntityVersionContractV2Row | null> {
    const row = await this.db
      .selectFrom("control.entity_version_contract as evc" as never)
      .select([
        "evc.id", "evc.tenant_id", "evc.entity_version_id", "evc.runtime_enabled",
        "evc.api_exposure", "evc.backing_type", "evc.table_schema", "evc.table_name",
        "evc.primary_key", "evc.tenant_column", "evc.read_capability", "evc.write_capability",
        "evc.create_mode", "evc.draft_ttl_hours", "evc.governance_level", "evc.security_tier",
        "evc.mutability", "evc.read_handler", "evc.write_handler", "evc.source_kind",
        "evc.contract_hash", "evc.identity_config", "evc.search_config", "evc.data_policy",
        "evc.concurrency_config", "evc.storage_config",
      ] as never[])
      .where("evc.entity_version_id" as never, "=" as never, versionId as never)
      .where("evc.tenant_id" as never, "is" as never, null as never)
      .executeTakeFirst() as EntityVersionContractV2Row | undefined;
    return row ?? null;
  }

  private async loadContractSurfaces(versionId: string, entityId: string): Promise<MetaEntityContractV2["surfaces"]> {
    const surfaceRows = await (this.db as any)
      .selectFrom("control.entity_surface as es")
      .select([
        sql<string>`es.id::text`.as("id"), sql<string>`es.tenant_id::text`.as("tenant_id"),
        sql<string>`COALESCE(es.entity_version_id, ${versionId}::uuid)::text`.as("entity_version_id"),
        "es.surface_key", "es.mode", "es.v2_mode", "es.kind", "es.v2_kind", "es.renderer_key",
        "es.label", "es.is_enabled", "es.config",
      ] as never[])
      .where("es.entity_id", "=", entityId)
      .where("es.tenant_id", "is", null)
      .where((eb: any) => eb.or([
        eb("es.entity_version_id", "=", versionId),
        eb("es.entity_version_id", "is", null),
      ]))
      .orderBy("es.sort_order", "asc")
      .execute() as Array<Record<string, unknown>>;
    if (surfaceRows.length === 0) return [];

    const surfaceIds = surfaceRows.map((row) => row["id"] as string);
    const fieldRows = await (this.db as any)
      .selectFrom("control.entity_field_surface as efs")
      .select([
        sql<string>`efs.id::text`.as("id"), sql<string>`efs.tenant_id::text`.as("tenant_id"),
        sql<string>`efs.entity_surface_id::text`.as("entity_surface_id"), sql<string>`efs.entity_field_id::text`.as("entity_field_id"),
        "efs.visible_override", "efs.required_override", "efs.readonly_override", "efs.sort_order",
        "efs.column_span", "efs.density", "efs.renderer_key", "efs.editor_key", "efs.visibility_expr",
        "efs.editability_expr", "efs.renderer_config",
      ] as never[])
      .where("efs.entity_surface_id", "in", surfaceIds)
      .where("efs.tenant_id", "is", null)
      .execute() as Array<Record<string, unknown>>;

    // Legacy surface rows may still point at canonical fields from another
    // version.  The v2 graph is version-scoped, so resolve those bindings by
    // stable field name before strict contract validation.
    const currentFieldRows = await (this.db as any)
      .selectFrom("control.entity_field as ef")
      .select([
        sql<string>`ef.id::text`.as("id"),
        "ef.name",
      ] as never[])
      .where("ef.entity_version_id", "=", versionId)
      .where("ef.tenant_id", "is", null)
      .where("ef.is_active", "=", true)
      .where("ef.runtime_enabled", "=", true)
      .execute() as Array<{ id: string; name: string }>;
    const currentFieldIdByName = new Map(currentFieldRows.map((field) => [field.name, field.id]));
    const boundFieldIds = [...new Set(fieldRows.map((field) => String(field["entity_field_id"])))];
    const boundFieldRows = boundFieldIds.length === 0 ? [] : await (this.db as any)
      .selectFrom("control.entity_field as ef")
      .select([
        sql<string>`ef.id::text`.as("id"),
        "ef.name",
      ] as never[])
      .where("ef.id", "in", boundFieldIds)
      .where("ef.tenant_id", "is", null)
      .execute() as Array<{ id: string; name: string }>;
    const boundFieldNameById = new Map(boundFieldRows.map((field) => [field.id, field.name]));

    return surfaceRows.map((row) => {
      const rawMode = textConfig(row["v2_mode"] ?? row["mode"]);
      const mode = ["list", "compact_card", "spreadsheet", "detail", "create", "edit", "picker", "print", "line_editor", "child_collection", "header"].includes(rawMode ?? "")
        ? rawMode as MetaEntityContractV2["surfaces"][number]["surface"]["mode"]
        : "list";
      const rawKind = textConfig(row["v2_kind"] ?? row["kind"]);
      const kind = ["TABLE", "CARDS", "FORM", "DETAIL", "PICKER", "PRINT", "COLLECTION", "HEADER", "CUSTOM"].includes(rawKind ?? "")
        ? rawKind as MetaEntityContractV2["surfaces"][number]["surface"]["kind"]
        : mode === "list" ? "TABLE" : "CUSTOM";
      const rawConfig = coerceRecord(row["config"]) ?? {};
      const rawFeatures = coerceRecord(rawConfig["features"]) ?? {};
      const features: Record<string, unknown> = {};
      for (const key of ["saved_views", "column_customization", "grouping", "multi_sort", "max_sort_levels", "max_page_size"]) {
        if (rawFeatures[key] !== undefined) features[key] = rawFeatures[key];
      }
      const availableSurfaces = Array.isArray(rawConfig["available_surfaces"])
        ? rawConfig["available_surfaces"].filter((value): value is string => typeof value === "string")
        : undefined;
      const boundFieldIds = new Set<string>();
      return {
        surface: {
          id: String(row["id"]), tenant_id: row["tenant_id"] == null ? null : String(row["tenant_id"]),
          entity_version_id: String(row["entity_version_id"]), surface_key: canonicalCode(row["surface_key"], "default_list"),
          mode, kind, renderer_key: canonicalCode(row["renderer_key"], "runtime_default"),
          label: textConfig(row["label"]) ?? null, is_enabled: row["is_enabled"] !== false,
          config: {
            ...(textConfig(rawConfig["default_surface"]) ? { default_surface: textConfig(rawConfig["default_surface"]) } : {}),
            ...(availableSurfaces ? { available_surfaces: availableSurfaces.map((value) => canonicalCode(value, "surface")) } : {}),
            ...(Object.keys(features).length > 0 ? { features } : {}),
            renderer_config: coerceRecord(rawConfig["renderer_config"]) ?? rawConfig,
          },
        },
        fields: fieldRows.filter((field) => field["entity_surface_id"] === row["id"]).map((field) => {
          const rawFieldId = String(field["entity_field_id"]);
          const fieldName = boundFieldNameById.get(rawFieldId);
          const resolvedFieldId = fieldName ? currentFieldIdByName.get(fieldName) : undefined;
          if (!resolvedFieldId || boundFieldIds.has(resolvedFieldId)) return null;
          boundFieldIds.add(resolvedFieldId);
          return {
          id: String(field["id"]), tenant_id: field["tenant_id"] == null ? null : String(field["tenant_id"]),
          entity_surface_id: String(field["entity_surface_id"]), entity_field_id: resolvedFieldId,
          visible: field["visible_override"] !== false,
          required_override: field["required_override"] == null ? null : field["required_override"] === true,
          readonly_override: field["readonly_override"] == null ? null : field["readonly_override"] === true,
          sort_order: field["sort_order"] == null ? null : Number(field["sort_order"]),
          column_span: field["column_span"] == null ? null : Number(field["column_span"]),
          density: ["compact", "comfortable", "document"].includes(String(field["density"])) ? field["density"] as "compact" | "comfortable" | "document" : null,
          renderer_key: textConfig(field["renderer_key"]) ?? null, editor_key: textConfig(field["editor_key"]) ?? null,
          visibility_expr: coerceRecord(field["visibility_expr"]), editability_expr: coerceRecord(field["editability_expr"]),
          renderer_config: coerceRecord(field["renderer_config"]) ?? {},
          };
        }).filter((field): field is NonNullable<typeof field> => field !== null),
      };
    });
  }

  private async loadContractOperations(versionId: string, entityCode: string): Promise<MetaEntityContractV2["operations"]> {
    const rows = await (this.db as any)
      .selectFrom("control.entity_operation as eo")
      .select([
        sql<string>`eo.id::text`.as("id"), sql<string>`eo.tenant_id::text`.as("tenant_id"),
        sql<string>`COALESCE(eo.entity_version_id, ${versionId}::uuid)::text`.as("entity_version_id"),
        "eo.operation_code", "eo.permission_code", "eo.surface", "eo.placement", "eo.handler_type",
        "eo.handler_target", "eo.execution_target", "eo.record_required", "eo.is_record_required", "eo.label",
        "eo.label_override", "eo.icon", "eo.icon_override", "eo.intent", "eo.confirmation", "eo.reason_required",
        "eo.selection_config", "eo.sort_order", "eo.is_enabled",
      ] as never[])
      .where((eb: any) => eb.or([eb("eo.entity_version_id", "=", versionId), eb("eo.entity_name", "=", entityCode)]))
      .where("eo.tenant_id", "is", null)
      .orderBy("eo.sort_order", "asc")
      .execute() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row["id"]), tenant_id: row["tenant_id"] == null ? null : String(row["tenant_id"]),
      entity_version_id: String(row["entity_version_id"]), operation_code: canonicalCode(row["operation_code"] ?? row["permission_code"], "operation"),
      permission_code: canonicalCode(row["permission_code"], "permission"),
      surface: ["list", "detail", "both", "picker", "hidden"].includes(String(row["surface"]).toLowerCase())
        ? String(row["surface"]).toLowerCase() as "list" | "detail" | "both" | "picker" | "hidden" : "both",
      placement: ["primary", "toolbar", "overflow", "context", "command"].includes(String(row["placement"]).toLowerCase())
        ? String(row["placement"]).toLowerCase() as "primary" | "toolbar" | "overflow" | "context" | "command" : "toolbar",
      handler_type: ["navigate", "api", "modal", "inline"].includes(String(row["handler_type"]).toLowerCase())
        ? String(row["handler_type"]).toLowerCase() as "navigate" | "api" | "modal" | "inline" : "api",
      handler_target: textConfig(row["handler_target"]), execution_target: textConfig(row["execution_target"]),
      record_required: row["record_required"] === true || row["is_record_required"] === true,
      label: textConfig(row["label"] ?? row["label_override"] ?? row["permission_code"]) ?? "Operation",
      icon: textConfig(row["icon"] ?? row["icon_override"]),
      intent: ["success", "warning", "danger"].includes(String(row["intent"])) ? row["intent"] as "success" | "warning" | "danger" : "neutral",
      confirmation: { required: coerceRecord(row["confirmation"])?.["required"] === true, code: textConfig(coerceRecord(row["confirmation"])?.["code"]) ?? null },
      reason_required: row["reason_required"] === true,
      selection_config: coerceRecord(row["selection_config"]), sort_order: Number(row["sort_order"] ?? 0), enabled: row["is_enabled"] !== false,
    }));
  }

  private async loadContractNumbering(entityId: string, fields: ReadonlyArray<CompiledField>): Promise<MetaEntityContractV2["numbering"]> {
    const row = await (this.db as any)
      .selectFrom("control.entity_numbering_config as n")
      .selectAll("n")
      .where("n.entity_id", "=", entityId)
      .where("n.tenant_id", "is", null)
      .where("n.is_active", "=", true)
      .orderBy("n.company_code_id", "asc")
      .executeTakeFirst() as Record<string, unknown> | undefined;
    if (!row) return null;
    const allowedKinds = new Set(["tenant_code", "company_code", "branch_code", "year", "fiscal_year", "period", "quarter", "sequence", "static"]);
    const segments = Array.isArray(row["segments"]) ? row["segments"].map((segment) => {
      const item = coerceRecord(segment) ?? {};
      const rawKind = textConfig(item["kind"] ?? item["type"]);
      return {
        kind: allowedKinds.has(rawKind ?? "") ? rawKind as "tenant_code" | "company_code" | "branch_code" | "year" | "fiscal_year" | "period" | "quarter" | "sequence" | "static" : "static",
        value: textConfig(item["value"] ?? item["text"]), width: item["width"] == null ? undefined : Number(item["width"]),
      };
    }) : [];
    const configuredNumberField = canonicalCode(row["number_field"], "code");
    const numberField = fields.find((field) => field.name === configuredNumberField)
      ?? fields.find((field) => field.column_name === configuredNumberField)
      ?? fields.find((field) => field.projection_alias_of === configuredNumberField);
    if (!numberField) return null;
    return {
      id: String(row["id"]), entity_id: String(row["entity_id"]), number_field: numberField.name,
      company_code_id: row["company_code_id"] == null ? null : String(row["company_code_id"]), prefix: String(row["prefix"] ?? ""),
      prefix_configurable: row["prefix_configurable"] !== false,
      separator: String(row["separator"] ?? "-"), segments,
      reset_strategy: ["never", "yearly", "fiscal_yearly", "monthly", "quarterly"].includes(String(row["reset_strategy"]))
        ? String(row["reset_strategy"]) as "never" | "yearly" | "fiscal_yearly" | "monthly" | "quarterly"
        : "never",
      uniqueness_scope: row["uniqueness_scope"] as "tenant" | "company" | "global", max_length: row["max_length"] == null ? null : Number(row["max_length"]),
      allowed_chars: String(row["allowed_chars"] ?? "any"), metadata: coerceRecord(row["metadata"]) ?? {},
      status: row["status"] === "inactive" ? "inactive" : "active",
    } as MetaEntityContractV2["numbering"];
  }

  private async loadContractLifecycle(entityCodes: string[], fields: ReadonlyArray<CompiledField>): Promise<MetaEntityContractV2["lifecycle"]> {
    const codes = [...new Set(entityCodes.filter(Boolean))];
    if (codes.length === 0) return null;
    const rows = await (this.db as any)
      .selectFrom("control.entity_lifecycle as el")
      .innerJoin("control.lifecycle as lc", "lc.id", "el.lifecycle_id")
      .innerJoin("control.lifecycle_state as ls", "ls.lifecycle_id", "lc.id")
      .select([
        "lc.id as lifecycle_id", "lc.config as lifecycle_config", "ls.code as state_code", "ls.name as state_name",
        "ls.is_initial", "ls.is_terminal", "ls.config as state_config", "ls.state_flags", "ls.sort_order",
      ])
      .where("el.entity_name", "in", codes)
      .where("el.tenant_id", "is", null)
      .where("lc.tenant_id", "is", null)
      .where("lc.is_active", "=", true)
      .orderBy("el.priority", "asc")
      .orderBy("ls.sort_order", "asc")
      .execute() as Array<Record<string, unknown>>;
    const first = rows[0];
    if (!first) return null;
    const lifecycleId = String(first["lifecycle_id"]);
    const transitions = await (this.db as any)
      .selectFrom("control.lifecycle_transition as lt")
      .innerJoin("control.lifecycle_state as fs", "fs.id", "lt.from_state_id")
      .innerJoin("control.lifecycle_state as ts", "ts.id", "lt.to_state_id")
      .select(["fs.code as from_state", "ts.code as to_state"])
      .where("lt.lifecycle_id", "=", lifecycleId)
      .where("lt.tenant_id", "is", null)
      .where("lt.is_active", "=", true)
      .execute() as Array<{ from_state: string; to_state: string }>;
    const lifecycleConfig = coerceRecord(first["lifecycle_config"]) ?? {};
    const configuredStatusField = canonicalCode(lifecycleConfig["status_field"], "status");
    const statusField = fields.find((field) => field.name === configuredStatusField)
      ?? fields.find((field) => field.column_name === configuredStatusField);
    if (!statusField) return null;
    const allowedTransitions: Record<string, string[]> = {};
    type CanonicalLifecycle = NonNullable<MetaEntityContractV2["lifecycle"]>;
    const states: CanonicalLifecycle["states"] = {};
    for (const row of rows) {
      const stateCode = canonicalCode(row["state_code"], "state");
      const stateConfig = coerceRecord(row["state_config"]) ?? {};
      const flags = coerceRecord(row["state_flags"]) ?? {};
      const terminal = row["is_terminal"] === true;
      allowedTransitions[stateCode] ??= [];
      states[stateCode] = {
        label: textConfig(row["state_name"]) ?? stateCode,
        badge: textConfig(stateConfig["badge"]), icon: textConfig(stateConfig["icon"]), color: textConfig(stateConfig["color"]),
        is_initial: row["is_initial"] === true, is_terminal: terminal,
        is_editable: typeof flags["is_mutable"] === "boolean" ? flags["is_mutable"] : !terminal,
        is_deletable: typeof flags["is_deletable"] === "boolean" ? flags["is_deletable"] : !terminal,
        is_reversible: flags["is_reversible"] === true,
      };
    }
    for (const transition of transitions) {
      const from = canonicalCode(transition.from_state, "state");
      const to = canonicalCode(transition.to_state, "state");
      allowedTransitions[from] ??= [];
      if (!allowedTransitions[from].includes(to)) allowedTransitions[from].push(to);
    }
    return {
      status_field: statusField.name,
      states,
      allowed_transitions: allowedTransitions,
      command_handler: textConfig(lifecycleConfig["command_handler"]),
    };
  }

  /**
   * Flow identity belongs in the canonical contract.  Detailed step/field
   * presentation remains an outer flow response adapter until the flow tables
   * are versioned into the v2 schema; the compiler still publishes the active
   * flow codes and operation graph so consumers no longer infer them from
   * display_config/reference_config.
   */
  private async loadContractFlows(
    versionId: string,
    operationCodes: ReadonlyArray<string>,
  ): Promise<MetaEntityContractV2["flows"]> {
    const rows = await (this.db as any)
      .selectFrom("control.entity_flow as ef")
      .select(["ef.flow_code", "ef.config", "ef.status", "ef.is_default"])
      .where("ef.entity_version_id", "=", versionId)
      .where("ef.tenant_id", "is", null)
      .where("ef.status", "=", "active")
      .orderBy("ef.flow_code", "asc")
      .execute() as Array<Record<string, unknown>>;
    const knownOperations = new Set(operationCodes);
    return rows.map((row) => {
      const config = coerceRecord(row["config"]) ?? {};
      const configuredEntry = textConfig(config["entry_operation"] ?? config["entryOperation"]);
      const graphSource = Array.isArray(config["create_graph"])
        ? config["create_graph"]
        : Array.isArray(config["createGraph"])
          ? config["createGraph"]
          : [];
      const createGraph = graphSource
        .filter((value): value is string => typeof value === "string")
        .map((value) => canonicalCode(value, "operation"))
        .filter((value, index, values) => knownOperations.has(value) && values.indexOf(value) === index);
      const entryOperation = configuredEntry && knownOperations.has(canonicalCode(configuredEntry, "operation"))
        ? canonicalCode(configuredEntry, "operation")
        : null;
      return {
        flow_code: canonicalCode(row["flow_code"], "default_flow"),
        entry_operation: entryOperation,
        create_graph: createGraph,
      };
    });
  }

  private async loadRelations(versionId: string): Promise<Array<Record<string, unknown>>> {
    return this.db
      .selectFrom("control.entity_relation as er" as never)
      .select([
        sql<string>`er.id::text`.as("id"),
        sql<string>`er.entity_version_id::text`.as("entity_version_id"),
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
        sql<string>`COALESCE(er.relation_code, er.name)`.as("relation_code"),
        sql<string>`COALESCE(er.target_entity_code, er.target_entity)`.as("target_entity_code"),
        sql<string>`COALESCE(er.source_field, er.fk_field)`.as("source_field"),
        sql<string>`COALESCE(er.target_field, er.target_key, 'id')`.as("target_field"),
        "er.polymorphic_type_field",
        "er.polymorphic_type_value",
        "er.polymorphic_id_field",
        "er.mutation_owner",
        "er.mutation_permissions",
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
        "ecp.cache_policy",
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
      cache_policy: coerceJson(row.cache_policy),
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
