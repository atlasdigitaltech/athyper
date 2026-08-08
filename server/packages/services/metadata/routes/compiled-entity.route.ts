/**
 * Metadata Routes — GET /api/metadata/entities/:entity/compiled
 *
 * Builds a CompiledEntity payload on-the-fly from:
 *   control.entity           — identity, class, governance, display config
 *   control.entity_version   — effective version + hash
 *   control.entity_field     — field definitions
 *   control.field_group      — UI grouping (if any)
 *
 * Requires a valid Bearer token (same auth adapter as IAM routes).
 * Returns 404 if the entity code is unknown.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  extractOrgHeaders,
  resolveTenantId,
  resolvePrincipalIdWithJit,
  verifyBearer,
} from "@athyper/svc-shared";
import { hasModuleAccess, ModuleAccessDegradedError, ModuleAccessMisconfiguredError, type ModuleAccessResolverOptions } from "./module-visibility.guard.js";
import { getEffectiveModuleAccess } from "@athyper/svc-iam";
import {
  compileDocumentRuntimePlan,
  hasCompiledDocumentItems,
  resolveCompiledEntityRenderer,
} from "../src/entity-compiler.service.js";
import { compileEntityCapabilityManifest } from "../src/entity-capability-manifest.js";
import {
  ExecutionDescriptorNotFoundError,
  type ExecutionDescriptorProvider,
  type ExecutionDescriptorProviderResult,
} from "../src/execution-descriptor/index.js";
import { TenantOverlayValidationError } from "../src/tenant-overlay-resolver.js";
import { normalizeEntityFeatureFlags, normalizeEntityListFeatures } from "@athyper/api-contracts/metadata-normalizers";
import {
  compiledEntityContractHash,
  projectCompiledEntityResponse,
  readCompiledEntityContract,
  type CompiledEntityProjectionProvider,
} from "../src/compiled-entity-projection.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Minimal Redis interface for server-side descriptor caching. */
export interface DescriptorCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  incr?(key: string): Promise<number>;
}

export interface CompiledEntityRoutesDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
  /**
   * Optional server-side descriptor cache (Redis recommended).
   * When provided, compiled descriptors are cached for DESCRIPTOR_CACHE_TTL_S.
   * Cache is keyed by entityCode; entry is invalidated when entity version changes
   * (detected by ETag mismatch on the cached payload vs recomputed hash).
   */
  cache?: DescriptorCache;
  executionDescriptorProvider?: ExecutionDescriptorProvider;
  compiledEntityProvider?: CompiledEntityProjectionProvider;
  /** Resolves the tenant-effective catalog payload after overlay restrictions. */
  loadEffectiveCompiledEntity?: (entityCode: string, tenantId: string) => Promise<Record<string, unknown> | null>;
  /** Tenant context already verified by the host gateway when available. */
  readAuthenticatedContext?: (req: Parameters<RequestHandler>[0]) => { tenantId?: string } | undefined;
  getEffectiveModuleAccess?: typeof getEffectiveModuleAccess;
}

// ─── Cache helpers ─────────────────────────────────────────────────────────────

const DESCRIPTOR_CACHE_TTL_S = 300; // 5 min
// v5 (Phase 4): compiled payloads now carry the authoritative
// document_runtime_plan. The namespace bump prevents cached v4 document
// descriptors (which have no plan) from reaching the fail-closed compiler.
// Format: desc:v5:{plane}:{tenantId}:{schemaHash}:{entityCode}:{compiledHash}
const DESCRIPTOR_CACHE_NAMESPACE = "desc:v6";

/**
 * Compose a stable schemaHash that goes into the descriptor cache key. Mirrors
 * the iam computeSchemaHash() output but lives here to avoid a dependency from
 * the metadata route back into svc-iam (which would create a cycle).
 */
function computeDescriptorSchemaHash(): string {
  const material = [
    process.env["NODE_ENV"] ?? "unknown",
    process.env["ATHYPER_FEATURE_FLAGS"] ?? "",
    process.env["ATHYPER_RUNTIME_CONTRACTS_VERSION"] ?? "0",
    process.env["ATHYPER_COMPILER_VERSION"] ?? "0",
  ].join("|");
  // Truncated 12-hex hash, matches the iam helper.
  let h = 5381;
  for (let i = 0; i < material.length; i++) h = ((h << 5) + h + material.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 12);
}

/**
 * Content-addressed payload key.
 * Format: desc:v6:{tenantId}:{entityCode}:{publishedVersionId}:{compiledHash}:{plane}:{schemaHash}
 * Different hashes create different keys → stale entries expire naturally (no explicit DEL needed).
 */
function descriptorCacheKey(
  plane: string,
  tenantId: string,
  entityCode: string,
  schemaHash: string,
  publishedVersionId: string,
  compiledHash: string,
): string {
  return `desc:v6:${tenantId}:${entityCode}:${publishedVersionId}:${compiledHash}:${plane}:${schemaHash}`;
}

/**
 * Pointer key — stores the current compiledHash for a (plane, tenant, entity)
 * tuple. Short-lived (same TTL as payload). Deleting this key invalidates the
 * cache without having to know the current hash.
 */
function descriptorCachePointerKey(
  plane: string,
  tenantId: string,
  entityCode: string,
  schemaHash: string,
): string {
  return `${DESCRIPTOR_CACHE_NAMESPACE}:${plane}:${tenantId}:${schemaHash}:${entityCode}:ptr`;
}

/**
 * Resolve the effective plane for cache scoping. Falls back to 'neon' when the
 * caller is not plane-aware (legacy callers / sysadmin tooling).
 */
function resolvePlaneSegment(value: unknown): "neon" | "mesh" | "admin" {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "neon" || raw === "mesh" || raw === "admin") return raw;
  return "neon";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function simpleHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, "0");
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
  const listFeatures = normalizeEntityListFeatures(raw["list_features"] ?? raw["listFeatures"]);
  if (listFeatures) out["list_features"] = listFeatures;
  delete out["listFeatures"];
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

  return Object.fromEntries(Object.entries(out).filter(([, value]) => value !== undefined));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function referenceTargetEntity(row: {
  reference_config?: unknown;
  validation?: unknown;
}): string | null {
  const rawConfig = asRecord(row.reference_config);
  const validation = asRecord(row.validation);
  return textConfig(rawConfig?.["target_entity"])
    ?? textConfig(rawConfig?.["ref_entity"])
    ?? textConfig(validation?.["ref_entity"])
    ?? textConfig(validation?.["ref_hint"])
    ?? null;
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

function normalizeValidationRules(value: unknown): Record<string, unknown> | null {
  const validation = asRecord(value);
  if (!validation) return null;
  const entries = Object.entries(validation)
    .filter(([key, item]) => !VALIDATION_REFERENCE_KEYS.has(key) && item !== undefined && item !== null);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function mergeReferencePickerProfile(
  referenceConfig: Record<string, unknown>,
  referencePickerProfile?: Record<string, unknown> | null,
): Record<string, unknown> {
  const pickerOverride = asRecord(referenceConfig["picker"]);
  const displayField = textConfig(referenceConfig["display_field"]);
  const topLevelPickerOverrides = Object.fromEntries(Object.entries({
    label_field: referenceConfig["label_field"] ?? displayField ?? undefined,
    code_field: referenceConfig["code_field"],
    description_field: referenceConfig["description_field"],
    navigation_field: referenceConfig["navigation_field"] ?? referenceConfig["record_id_field"],
    show_code: referenceConfig["show_code"],
    show_description: referenceConfig["show_description"],
    show_view_action: referenceConfig["show_view_action"],
  }).filter(([, value]) => value !== undefined));
  const mergedPicker = Object.fromEntries(
    Object.entries({
      ...(referencePickerProfile ?? {}),
      ...topLevelPickerOverrides,
      ...(pickerOverride ?? {}),
    }).filter(([, value]) => value !== undefined),
  );
  const picker = Object.keys(mergedPicker).length > 0 ? mergedPicker : undefined;

  return Object.fromEntries(Object.entries({
    ...referenceConfig,
    target_field: referenceConfig["target_field"] ?? "id",
    display_field: referenceConfig["display_field"]
      ?? referenceConfig["label_field"]
      ?? picker?.["label_field"],
    picker,
  }).filter(([, value]) => value !== undefined));
}

function normalizeReferenceConfig(
  row: {
    reference_config?: unknown;
    validation?: unknown;
  },
  referencePickerProfile?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const rawConfig = asRecord(row.reference_config);
  const validation = asRecord(row.validation);
  const targetEntity = referenceTargetEntity(row);

  if (rawConfig) {
    const strippedConfig = { ...rawConfig };
    for (const key of ["ref_entity", "ref_hint", "entity", "entity_code", "targetEntity", "refEntity"]) {
      delete strippedConfig[key];
    }
    const normalized = Object.fromEntries(Object.entries({
      ...strippedConfig,
      target_entity: targetEntity ?? "",
      target_field: strippedConfig["target_field"],
      display_field: strippedConfig["display_field"],
    }).filter(([, value]) => value !== undefined));
    return mergeReferencePickerProfile(normalized, referencePickerProfile);
  }

  if (targetEntity) {
    const normalized = Object.fromEntries(Object.entries({
      target_entity: targetEntity,
      target_field: validation?.["target_field"],
      display_field: validation?.["display_field"],
    }).filter(([, value]) => value !== undefined));
    return mergeReferencePickerProfile(normalized, referencePickerProfile);
  }

  return null;
}


/** Map entity_field row → EntityField contract shape */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  const record = asRecord(value);
  return Boolean(record && Object.keys(record).some((key) => RULE_EXPRESSION_KEYS.has(key)));
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> | null {
  const entries = Object.entries(record).filter(([, value]) => value !== undefined && value !== null);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function normalizeUiHint(value: unknown, visibility: unknown): Record<string, unknown> | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const out: Record<string, unknown> = { ...raw };
  const display = { ...(asRecord(out["display"]) ?? {}) };
  const topLevelRule = out["visible_when"];
  const legacyVisibility = asRecord(visibility);

  if (!display["visible_when"] && isRuleExpression(topLevelRule)) {
    display["visible_when"] = topLevelRule;
  }
  if (!display["visible_when"] && isRuleExpression(legacyVisibility)) {
    display["visible_when"] = legacyVisibility;
  }
  if (Object.keys(display).length > 0) out["display"] = display;

  const copyBehavior = out["copy_behavior"];
  if (copyBehavior !== undefined) {
    const copy = { ...(asRecord(out["copy"]) ?? {}) };
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
  const raw = asRecord(value);
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
  const raw = asRecord(value);
  if (!raw) return null;
  const out: Record<string, unknown> = { ...raw };

  if (!out["dependent_filter"]) out["dependent_filter"] = out["depends_on"] ?? out["dependency"];
  const dependentFilter = asRecord(out["dependent_filter"]);
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

function mapField(row: Record<string, any>, referencePickerProfiles?: Map<string, Record<string, unknown>>) {
  const targetEntity = referenceTargetEntity(row);
  const referencePickerProfile = targetEntity ? referencePickerProfiles?.get(targetEntity) : undefined;

  const rawUiHint = asRecord(row.ui_hint);
  const uiHint = normalizeUiHint(row.ui_hint, row.visibility);
  const fieldFilterConfig = asRecord(row.filter_config);
  const filterConfig = fieldFilterConfig ?? (rawUiHint?.["filter"] && typeof rawUiHint["filter"] === "object"
    ? rawUiHint["filter"] as Record<string, unknown>
    : null
  );

  return {
    id: row.id as string,
    name: row.name as string,
    column_name: row.column_name as string,
    label: (row.label ?? null) as string | null,
    description: (row.description ?? null) as string | null,
    data_type: row.data_type as string,
    ui_type: (row.ui_type ?? null) as string | null,
    format: (row.format ?? null) as string | null,
    unit: (row.unit ?? null) as string | null,
    cardinality: row.cardinality as string,
    origin: row.origin as string,
    is_required: Boolean(row.is_required),
    is_readonly: Boolean(row.is_read_only),
    is_unique: Boolean(row.is_unique),
    unique_scope: (row.unique_scope ?? null) as string | null,
    is_searchable: Boolean(row.is_searchable),
    is_filterable: Boolean(row.is_filterable),
    is_sortable: Boolean(row.is_sortable),
    is_groupable: Boolean(row.is_groupable),
    is_aggregatable: Boolean(row.is_aggregatable),
    is_pii: false,
    is_computed: Boolean(row.is_computed),
    is_write_once: Boolean(row.is_write_once),
    is_primary_amount: Boolean(row.is_primary_amount),
    is_primary_currency: Boolean(row.is_primary_currency),
    default_value: row.default_value ?? null,
    validation_rules: normalizeValidationRules(row.validation),
    enum_domain_code: (row.enum_domain_code ?? null) as string | null,
    reference_config: normalizeReferenceConfig(row, referencePickerProfile),
    money_config: normalizeMoneyConfig(row.money_config),
    json_config: (row.json_config && typeof row.json_config === "object")
      ? row.json_config as Record<string, unknown>
      : null,
    sort_order: Number(row.sort_order ?? 0),
    group_key: (row.group_key ?? rawUiHint?.["group_key"] ?? null) as string | null,
    ui_hint: uiHint,
    visibility: (row.visibility && typeof row.visibility === "object")
      ? row.visibility as Record<string, unknown>
      : null,
    editability: (row.editability && typeof row.editability === "object")
      ? row.editability as Record<string, unknown>
      : null,
    lookup_config: normalizeLookupConfig(row.lookup_config),
    filter_config: filterConfig,
    i18n_key: (rawUiHint?.["i18n_key"] ?? null) as string | null,
  };
}

// ─── Route factory ────────────────────────────────────────────────────────────

async function loadReferencePickerProfiles(
  db: Kysely<any>,
  fieldRows: Array<{ reference_config?: unknown; validation?: unknown }>,
  tenantId: string | null,
): Promise<Map<string, Record<string, unknown>>> {
  const targetEntities = [
    ...new Set(fieldRows.map(referenceTargetEntity).filter((value): value is string => Boolean(value))),
  ];
  const profiles = new Map<string, Record<string, unknown>>();
  if (targetEntities.length === 0) return profiles;

  let query = db
    .selectFrom("control.entity as e")
    .select(["e.name", "e.entity_code", "e.display_config"])
    .where((eb: any) => eb.or([
      eb("e.name", "in", targetEntities),
      eb("e.entity_code", "in", targetEntities),
    ]))
    .where("e.is_active", "=", true);

  if (tenantId) {
    query = query
      .where((eb: any) => eb.or([eb("e.tenant_id", "=", tenantId), eb("e.tenant_id", "is", null)]))
      .orderBy(sql`e.tenant_id NULLS LAST`);
  } else {
    query = query.where("e.tenant_id", "is", null);
  }

  const rows = await query.execute();
  for (const row of rows) {
    const displayConfig = asRecord(row.display_config);
    const referencePicker = asRecord(displayConfig?.["reference_picker"]);
    if (!referencePicker) continue;

    const names = [row.name, row.entity_code].filter((value): value is string => Boolean(value));
    for (const name of names) {
      if (!profiles.has(name)) profiles.set(name, referencePicker);
    }
  }

  return profiles;
}

export function createCompiledEntityRoute(router: Router, deps: CompiledEntityRoutesDeps): Router {
  const { db, auth, logger, cache, executionDescriptorProvider, compiledEntityProvider, loadEffectiveCompiledEntity, getEffectiveModuleAccess } = deps;
  const moduleAccessCache = cache
    ? {
      get: cache.get,
      set: (key: string, value: string, _ex: "EX", ttl: number): Promise<void> =>
        cache.set(key, value, ttl),
      del: cache.del,
    }
    : undefined;
  const moduleResolver = getEffectiveModuleAccess
    ? (
      _db: unknown,
      tenantId: string,
      principalId: string,
      options?: ModuleAccessResolverOptions,
    ) =>
      getEffectiveModuleAccess(db, tenantId, principalId, {
        cache: moduleAccessCache,
        authEpoch: options?.authEpoch,
        planVersionId: options?.planVersionId,
      })
    : undefined;

  const handler: RequestHandler = async (req, res, next) => {
    try {
      // ── Auth ──────────────────────────────────────────────────────────────
      const authenticationStartedAt = process.hrtime.bigint();
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      (res.locals as Record<string, unknown>)["authenticationMs"] =
        Number(process.hrtime.bigint() - authenticationStartedAt) / 1_000_000;
      const sub = typeof claims.sub === "string" ? claims.sub : "";

      // ── Resolve entity + effective version ────────────────────────────────
      // Normalise URL slug → DB name (journal-entry → journal_entry)
      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");

      // ── Resolve tenant (required for tenant-isolated cache key) ───────────
      // Fail-open: if X-Org is absent we skip the cache (prevents cross-tenant leakage).
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const requestContextStartedAt = process.hrtime.bigint();
      const authenticated = deps.readAuthenticatedContext?.(req);
      const tenantId = authenticated?.tenantId ?? (xOrg ? await resolveTenantId(db, xOrg, xRealm) : null);
      (res.locals as Record<string, unknown>)["requestContextMs"] =
        Number(process.hrtime.bigint() - requestContextStartedAt) / 1_000_000;

      // Plane + schemaHash scoping for the descriptor cache key.
      const plane = resolvePlaneSegment(req.headers["x-plane"]);
      const schemaHash = computeDescriptorSchemaHash();

      // Phase B cutover: the compiler projection is the authoritative runtime
      // source.  The legacy SQL compiler below remains only as a compatibility
      // path for isolated callers/tests that have not supplied the provider.
      // Production registration always supplies deps.entityCompiler.
      if (compiledEntityProvider && tenantId) {
        const compiled = await compiledEntityProvider.loadRuntimeCompiledEntity(entityCode, tenantId, plane);
        if (!compiled) {
          res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
          return;
        }
        const contract = readCompiledEntityContract(compiled);
        const compiledHash = compiledEntityContractHash(compiled);
        const executionHash = (compiled.execution_descriptor as { identity?: { compiledHash?: string } } | undefined)
          ?.identity?.compiledHash;
        if (executionHash) {
          res.setHeader("X-Descriptor-Hash", executionHash);
          (res.locals as Record<string, unknown>)["descriptorHash"] = executionHash;
        }

        if (tenantId && contract.catalog.module_id) {
          try {
            const principalId = await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims);
            const authEpochRow = await db
              .selectFrom("master.principal as p")
              .select("p.auth_epoch")
              .where("p.id", "=", principalId)
              .where("p.tenant_id", "=", tenantId)
              .executeTakeFirst();
            const hasAccess = await hasModuleAccess(
              db,
              tenantId,
              principalId,
              contract.catalog.module_id,
              moduleResolver,
              logger,
              { authEpoch: (authEpochRow?.auth_epoch as number | undefined), mode: "read_metadata" },
            );
            if (!hasAccess) {
              res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
              return;
            }
          } catch (err) {
            if (err instanceof ModuleAccessMisconfiguredError) throw err;
            if (err instanceof ModuleAccessDegradedError) {
              res.status(503).set("Retry-After", String(err.retryAfterSeconds)).json({
                error: "MODULE_ACCESS_UNAVAILABLE",
                message: "Service temporarily unavailable. Please retry.",
              });
              return;
            }
            logger?.warn("compiled_entity_projection_module_access_failed", { entityCode, tenantId, err: String(err) });
          }
        }

        const payload = projectCompiledEntityResponse(compiled);
        const etagValue = `"ced-${compiledHash}"`;
        res.setHeader("ETag", etagValue);
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("X-Cache", "MISS");
        res.setHeader("X-Contract-Version", "2");
        if (req.headers["if-none-match"] === etagValue) {
          res.status(304).end();
          return;
        }
        if (cache) {
          const payloadJson = JSON.stringify(payload);
          const pointerFingerprint = JSON.stringify({ compiledHash, publishedVersionId: compiled.version_id });
          Promise.all([
            cache.set(descriptorCacheKey(plane, tenantId, entityCode, schemaHash, compiled.version_id, compiledHash), payloadJson, DESCRIPTOR_CACHE_TTL_S),
            cache.set(descriptorCachePointerKey(plane, tenantId, entityCode, schemaHash), pointerFingerprint, DESCRIPTOR_CACHE_TTL_S),
          ]).catch((err) => logger?.warn("compiled_entity_projection_cache_write_failed", { entityCode, tenantId, err: String(err) }));
        }
        res.json(payload);
        return;
      }

      let executionResolution: ExecutionDescriptorProviderResult | undefined;
      if (executionDescriptorProvider && tenantId) {
        const locals = res.locals as Record<string, unknown>;
        const requestMemo = (locals["executionDescriptorMemo"] ??= new Map()) as Map<string, Promise<ExecutionDescriptorProviderResult>>;
        try {
          executionResolution = await executionDescriptorProvider.get({ plane, tenantId, entityCode }, requestMemo);
          locals["descriptorCacheState"] = executionResolution.cacheState;
          locals["descriptorHash"] = executionResolution.descriptor.identity.compiledHash;
          res.setHeader("X-Descriptor-Cache", executionResolution.cacheState);
          res.setHeader("X-Descriptor-Hash", executionResolution.descriptor.identity.compiledHash);
        } catch (error) {
          // The compiled route also serves callers that discover relation
          // targets from catalog metadata. Catalog-only entities (for
          // example commitment_line and pricing_component) intentionally do
          // not have execution descriptors. Let the authoritative lookup
          // below return its normal ENTITY_NOT_FOUND response instead of
          // turning that expected miss into a compiled_entity_route_error.
          // Other provider failures remain fatal and are handled by the
          // route-level error middleware.
          if (!(error instanceof ExecutionDescriptorNotFoundError)) throw error;
        }
      }

      // Production path: validate the legacy UI payload against the provider's
      // generation vector. This replaces the PostgreSQL fingerprint query.
      if (cache && tenantId && executionResolution) {
        try {
          const ptrRaw = await cache.get(descriptorCachePointerKey(plane, tenantId, entityCode, schemaHash));
          const pointer = ptrRaw ? JSON.parse(ptrRaw) as { generation?: string; compiledHash?: string; publishedVersionId?: string } : null;
          if (pointer?.generation === executionResolution.generation && pointer.compiledHash && pointer.publishedVersionId) {
            const cached = await cache.get(descriptorCacheKey(plane, tenantId, entityCode, schemaHash, pointer.publishedVersionId, pointer.compiledHash));
            if (cached) {
              const payload = JSON.parse(cached) as Record<string, unknown>;
              const etagValue = `"ced-${payload["compiled_hash"]}"`;
              res.setHeader("ETag", etagValue);
              res.setHeader("Cache-Control", "no-cache");
              res.setHeader("X-Cache", "HIT");
              if (req.headers["if-none-match"] === etagValue) { res.status(304).end(); return; }
              res.json(payload);
              return;
            }
          }
        } catch (cacheErr) {
          logger?.warn("compiled_entity_generation_cache_read_failed", { entityCode, tenantId, err: String(cacheErr) });
        }
      }

      // Warm hits are served only from the generation-validated execution-descriptor provider above.
      // The retired compatibility fingerprint path performed metadata SQL on every hit.
      // Provider misses fail safe by resolving and compiling authoritative metadata.

      // ── Tenant-aware entity lookup ─────────────────────────────────────────
      // When tenantId is known:  prefer tenant-specific row over platform row
      //   (ORDER BY tenant_id NULLS LAST → non-null tenant wins, NULL platform fallback)
      // When tenantId is null:   platform entities only (tenant_id IS NULL)
    const descriptorCompileStartedAt = process.hrtime.bigint();
    let entityQuery = db
      .selectFrom("control.entity as e")
      .innerJoin("control.entity_version as ev", "ev.entity_id", "e.id")
      .select([
        "e.id",
        "e.name",
        "e.slug",
        sql<string>`COALESCE(e.entity_code, e.name)`.as("entity_code"),
          "e.label_singular",
          "e.entity_class",
          "e.create_mode",
          "e.draft_ttl_hours",
          "e.numbering_strategy",
        "e.table_schema",
        "e.table_name",
        "e.backing_type",
        "e.mutability",
        sql<string | null>`e.module_id`.as("module_id"),
        "e.display_config",
        "e.identity_config",
        "e.search_config",
        "e.data_policy",
        "e.feature_flags",
          "e.governance_level",
          "e.security_tier",
          "e.icon_key",
          "e.color_token",
          sql<string>`ev.id`.as("version_id"),
          sql<number>`ev.version_no`.as("version_no"),
          sql<string | null>`ev.version_hash`.as("version_hash"),
        ])
        .where((eb: any) => eb.or([
          eb("e.name", "=", entityCode),
          eb("e.entity_code", "=", entityCode),
          eb("e.slug", "=", entityCode.replace(/_/g, "-")),
        ]))
        .where("e.runtime_enabled", "=", true)
        .where("e.status", "=", "ACTIVE")
        .where("e.is_active", "=", true)
        .where("e.read_capability", "<>", "none")
        .where("ev.status", "=", "EFFECTIVE");

      if (tenantId) {
        entityQuery = entityQuery
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .where((eb: any) => eb.or([eb("e.tenant_id", "=", tenantId), eb("e.tenant_id", "is", null)]))
          .orderBy(sql`e.tenant_id NULLS LAST`); // tenant-specific row wins over platform
      } else {
        entityQuery = entityQuery.where("e.tenant_id", "is", null);
      }

      const entityRow = await entityQuery.limit(1).executeTakeFirst();

      if (!entityRow) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      if (tenantId && entityRow.module_id) {
        try {
          const principalId = await resolvePrincipalIdWithJit(db, sub, tenantId, xRealm, claims);
          const authEpochRow = await db
            .selectFrom("master.principal as p")
            .select("p.auth_epoch")
            .where("p.id", "=", principalId)
            .where("p.tenant_id", "=", tenantId)
            .executeTakeFirst();
          const authEpoch = (authEpochRow?.auth_epoch as number | undefined) ?? undefined;
          const hasAccess = await hasModuleAccess(
            db,
            tenantId,
            principalId,
            entityRow.module_id as string,
            moduleResolver,
            logger,
            { authEpoch, mode: "read_metadata" },
          );
          if (!hasAccess) {
            res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
            return;
          }
        } catch (err) {
          if (err instanceof ModuleAccessMisconfiguredError) throw err;
          if (err instanceof ModuleAccessDegradedError) {
            res.status(503).set("Retry-After", String(err.retryAfterSeconds)).json({
              error: "MODULE_ACCESS_UNAVAILABLE",
              message: "Service temporarily unavailable. Please retry.",
            });
            return;
          }
          logger?.warn("compiled_entity_module_access_failed", { entityCode, tenantId, err: String(err) });
        }
      }

      // ── Fields ────────────────────────────────────────────────────────────
      const fieldRows = await db
        .selectFrom("control.entity_field as ef")
        .selectAll()
        .where("ef.entity_version_id", "=", entityRow.version_id)
        .where("ef.is_active", "=", true)
        .where("ef.runtime_enabled", "=", true)
        .orderBy("ef.sort_order", "asc")
        .execute();

      const referencePickerProfiles = await loadReferencePickerProfiles(db, fieldRows, tenantId);
      const fields = fieldRows.map((r) => mapField(r as Record<string, unknown>, referencePickerProfiles));

      // ── Field groups ──────────────────────────────────────────────────────
      // field_group is global (applies_to_classes). For this entity we only
      // return groups that have at least one field assigned to them.
      const usedGroupKeys = [...new Set(fields.map((f) => f.group_key).filter(Boolean))];

      let fieldGroups: Array<{ group_key: string; label: string; description: string | null; sort_order: number; fields: string[] }> = [];

      if (usedGroupKeys.length > 0) {
        const groupRows = await db
          .selectFrom("control.field_group as fg")
          .select(["fg.group_key", "fg.label", "fg.description", "fg.sort_order", "fg.columns", "fg.page_span"])
          .where("fg.group_key", "in", usedGroupKeys as string[])
          .orderBy("fg.sort_order", "asc")
          .execute();

        fieldGroups = groupRows.map((g) => ({
          group_key:   g.group_key as string,
          label:       g.label as string,
          description: (g.description ?? null) as string | null,
          sort_order:  Number(g.sort_order ?? 0),
          columns:     (Number(g["columns"] ?? 3)) as 1 | 2 | 3,
          page_span:   ((g["page_span"] as string | null) ?? "half") as "full" | "half",
          fields:      fields.filter((f) => f.group_key === g.group_key).map((f) => f.name),
        }));
      }

      const relationRows = await (db as any)
        .selectFrom("control.entity_relation as er")
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
        .where("er.entity_version_id", "=", entityRow.version_id)
        .orderBy("er.name", "asc")
        .execute() as Array<Record<string, unknown>>;

      // ── Lifecycle states ──────────────────────────────────────────────────
      // Query the canonical state list for this entity so the compiled
      // descriptor carries it — the frontend stepper reads lifecycle_stages.
      let lifecycleStages: Array<{
        key: string; label: string; sort_order: number; is_initial: boolean;
        is_terminal: boolean; state_flags: Record<string, unknown>;
      }> = [];
      try {
        const lcRows = await (db as any)
          .selectFrom("control.entity_lifecycle as el")
          .innerJoin("control.lifecycle as lc", "lc.id" as never, "el.lifecycle_id" as never)
          .innerJoin("control.lifecycle_state as ls", "ls.lifecycle_id" as never, "lc.id" as never)
          .select([
            "ls.code as key",
            "ls.name as label",
            "ls.sort_order",
            "ls.is_initial",
            "ls.is_terminal",
            "ls.state_flags",
          ] as never[])
          .where("el.entity_name" as never, "=", (entityRow.entity_code ?? entityCode) as never)
          .where((eb: any) => eb.or([
            eb("el.tenant_id" as any, "=" as any, tenantId as any),
            eb("el.tenant_id" as any, "is" as any, null as any),
          ]))
          .where("lc.is_active" as never, "=" as never, true as never)
          .orderBy("el.priority" as never, "asc" as never)
          .orderBy("ls.sort_order" as never, "asc" as never)
          .limit(60)
          .execute() as typeof lifecycleStages;
        lifecycleStages = lcRows;
      } catch {
        // lifecycle binding is optional
      }

      // ── Build display_config ──────────────────────────────────────────────
      const dbDisplayConfig = (entityRow.display_config ?? {}) as Record<string, unknown>;
      const dbIdentityConfig = (entityRow.identity_config ?? {}) as Record<string, unknown>;
      const dbSearchConfig = (entityRow.search_config ?? {}) as Record<string, unknown>;
      const dbDataPolicy = (entityRow.data_policy ?? {}) as Record<string, unknown>;
      const displayConfig = normalizeDisplayConfig(dbDisplayConfig, entityRow.icon_key, entityRow.color_token);
      if (lifecycleStages.length > 0) {
        (displayConfig as Record<string, unknown>)["lifecycle_stages"] = lifecycleStages.map((s) => ({
          key:        s.key,
          label:      s.label,
          sort_order: s.sort_order,
          is_terminal: (s as any).is_terminal ?? false,
        }));
      }

      // ── Build feature_flags ───────────────────────────────────────────────
      const rawFlags = (entityRow.feature_flags ?? {}) as Record<string, unknown>;
      const featureFlags = normalizeEntityFeatureFlags(rawFlags);
      if (lifecycleStages.length > 0) {
        (featureFlags as Record<string, unknown>)["has_lifecycle"] = true;
      }

      // ── Compiled hash ─────────────────────────────────────────────────────
      const versionHash = entityRow.version_hash
        ?? simpleHash(`${String(entityRow.id)}-v${entityRow.version_no}`);
      const documentRuntimePlan = compileDocumentRuntimePlan({
        renderer: resolveCompiledEntityRenderer({
          entityClass: String(entityRow.entity_class),
          tableSchema: String(entityRow.table_schema),
          displayConfig,
          featureFlags,
        }),
        versionHash,
        hasItems: hasCompiledDocumentItems({
          relations: relationRows as Array<Record<string, unknown>>,
          displayConfig,
          featureFlags,
        }),
        fields: fields as Parameters<typeof compileDocumentRuntimePlan>[0]["fields"],
        contractMaterial: {
          documentRuntime: displayConfig["document_runtime"] ?? null,
          relations: relationRows,
        },
      });
      const operationRows = await (db as any)
        .selectFrom("control.entity_operation as eo")
        .leftJoin("control.auth_permission as p", "p.id", "eo.permission_id_v2")
        .select([
          "eo.permission_code",
          "eo.is_enabled",
          sql<boolean>`p.id IS NOT NULL AND p.status = 'published'`.as("permission_registered"),
        ])
        .where("eo.entity_name", "=", entityRow.entity_code ?? entityCode)
        .where((eb: any) => tenantId
          ? eb.or([eb("eo.tenant_id", "=", tenantId), eb("eo.tenant_id", "is", null)])
          : eb("eo.tenant_id", "is", null))
        .execute() as Array<{ permission_code: string; is_enabled: boolean; permission_registered: boolean }>;
      const renderer = resolveCompiledEntityRenderer({
        entityClass: String(entityRow.entity_class),
        tableSchema: String(entityRow.table_schema),
        displayConfig,
        featureFlags,
      });
      const capabilityManifest = compileEntityCapabilityManifest({
        entityCode: String(entityRow.entity_code ?? entityCode),
        entityVersionId: String(entityRow.version_id),
        renderer,
        backingType: String(entityRow.backing_type ?? "table"),
        mutability: String(entityRow.mutability ?? "mutable"),
        featureFlags,
        displayConfig,
        dataPolicy: dbDataPolicy,
        fields: fieldRows.map((field) => ({
          name: String(field.name),
          column_name: String(field.column_name),
          data_type: String(field.data_type),
          origin: typeof field.origin === "string" ? field.origin : null,
          is_required: field.is_required === true,
          is_read_only: field.is_read_only === true,
          is_computed: field.is_computed === true,
          is_write_once: field.is_write_once === true,
          editability: field.editability,
        })),
        relations: relationRows,
        operations: operationRows.map((operation) => ({
          permissionCode: operation.permission_code,
          enabled: operation.is_enabled,
          permissionRegistered: operation.permission_registered,
        })),
        hasDocumentRuntime: documentRuntimePlan !== undefined,
        lifecycleStates: lifecycleStages.map((state) => ({
          code: state.key,
          isInitial: state.is_initial,
          isTerminal: state.is_terminal,
          stateFlags: state.state_flags ?? {},
        })),
      });
      // Include display_config in hash so changes to document_header or
      // detail_renderer bust the Redis descriptor cache automatically.
      const displayConfigHash = simpleHash(JSON.stringify(dbDisplayConfig));
      const identityConfigHash = simpleHash(JSON.stringify(dbIdentityConfig));
      const searchConfigHash = simpleHash(JSON.stringify(dbSearchConfig));
      const dataPolicyHash = simpleHash(JSON.stringify(dbDataPolicy));
      const fieldsHash = simpleHash(JSON.stringify(fields));
      const relationsHash = simpleHash(JSON.stringify(relationRows));
      const lifecycleHash = simpleHash(JSON.stringify(lifecycleStages));
      const createContractHash = simpleHash(JSON.stringify({
        create_mode: entityRow.create_mode ?? "FORM_ONLY",
        draft_ttl_hours: entityRow.draft_ttl_hours ?? null,
        numbering_strategy: entityRow.numbering_strategy ?? "none",
      }));
      const documentRuntimePlanHash = simpleHash(JSON.stringify(documentRuntimePlan ?? null));
      const capabilityManifestHash = simpleHash(JSON.stringify(capabilityManifest));
      const compiledHash = simpleHash(`${versionHash}-${fieldsHash}-${relationsHash}-${displayConfigHash}-${identityConfigHash}-${searchConfigHash}-${dataPolicyHash}-${lifecycleHash}-${createContractHash}-${documentRuntimePlanHash}-${capabilityManifestHash}`);

      const effectiveCatalog = tenantId && loadEffectiveCompiledEntity
        ? await loadEffectiveCompiledEntity(entityCode, tenantId).catch((error) => {
          logger?.warn("compiled_entity_overlay_resolution_failed", { entityCode, tenantId, err: String(error) });
          return null;
        })
        : null;
      const payload = {
        entity_id: entityRow.id as string,
        entity_code: entityRow.entity_code as string,
        slug: (entityRow.slug ?? String(entityRow.table_name).replace(/_/g, "-")) as string,
        entity_name: (entityRow.label_singular ?? entityRow.name) as string,
        entity_class: entityRow.entity_class as string,
        create_mode: entityRow.create_mode as string,
        draft_ttl_hours: entityRow.draft_ttl_hours == null ? null : Number(entityRow.draft_ttl_hours),
        numbering_strategy: entityRow.numbering_strategy as string,
        table_schema: entityRow.table_schema as string,
        table_name: entityRow.table_name as string,
        version_id: entityRow.version_id as string,
        version_no: Number(entityRow.version_no),
        version_hash: versionHash,
        fields: (effectiveCatalog?.["fields"] as unknown[] | undefined) ?? fields,
        field_groups: fieldGroups,
        relations: relationRows,
        display_config: (effectiveCatalog?.["display_config"] as Record<string, unknown> | undefined) ?? displayConfig,
        identity_config: dbIdentityConfig,
        search_config: dbSearchConfig,
        data_policy: (effectiveCatalog?.["data_policy"] as Record<string, unknown> | undefined) ?? dbDataPolicy,
        feature_flags: featureFlags,
        ...(documentRuntimePlan ? { document_runtime_plan: documentRuntimePlan } : {}),
        capability_manifest: capabilityManifest,
        governance_level: entityRow.governance_level as string,
        security_tier: entityRow.security_tier as string,
        compiled_at: new Date().toISOString(),
        compiled_hash: (effectiveCatalog?.["compiled_hash"] as string | undefined) ?? compiledHash,
      };

      // ETag / 304 — descriptor is content-addressed by compiled_hash
      const etagValue = `"ced-${compiledHash}"`;
      res.setHeader("ETag", etagValue);
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("X-Cache", "MISS");
      (res.locals as Record<string, unknown>)["descriptorCompileMs"] =
        Number(process.hrtime.bigint() - descriptorCompileStartedAt) / 1_000_000;

      if (req.headers["if-none-match"] === etagValue) {
        res.status(304).end();
        return;
      }

      // Populate server-side cache (best-effort; do not block response).
      // Pointer stores a JSON fingerprint {compiledHash, versionHash, displayConfigHash}
      // so the read path can validate against current DB state with one lightweight query.
      if (cache && tenantId) {
        // Hash the per-field defaults JSONB so reseeding on_source_change rules
        // (without bumping version_hash) busts the cache on the next request.
        const fieldDefaultsMaterial = fields
          .filter((f) => (f as Record<string, unknown>)["defaults"])
          .map((f) => `${(f as Record<string, unknown>)["name"]}:${JSON.stringify((f as Record<string, unknown>)["defaults"])}`)
          .sort()
          .join("|");
        const fieldDefaultsHash = simpleHash(fieldDefaultsMaterial);
        const pointerFingerprint = executionResolution
          ? JSON.stringify({
            compiledHash,
            publishedVersionId: executionResolution.descriptor.identity.entityVersionId,
            generation: executionResolution.generation,
            executionDescriptorHash: executionResolution.descriptor.identity.compiledHash,
          })
          : JSON.stringify({ compiledHash, publishedVersionId: String(entityRow.version_id), versionHash, displayConfigHash, identityConfigHash, searchConfigHash, dataPolicyHash, createContractHash, fieldDefaultsHash });
        Promise.all([
          cache.set(descriptorCacheKey(plane, tenantId, entityCode, schemaHash, String(entityRow.version_id), compiledHash), JSON.stringify(payload), DESCRIPTOR_CACHE_TTL_S),
          cache.set(descriptorCachePointerKey(plane, tenantId, entityCode, schemaHash), pointerFingerprint, DESCRIPTOR_CACHE_TTL_S),
        ]).catch((err) => logger?.warn("compiled_entity_cache_write_failed", { entityCode, tenantId, plane, schemaHash, err: String(err) }));
      }

      res.json(payload);
      return;
    } catch (err) {
      logger?.error("compiled_entity_route_error", { err: String(err) });
      next(err);
    }
  };

  const executionDescriptorHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!executionDescriptorProvider) {
        res.status(503).json({ error: "EXECUTION_DESCRIPTOR_PROVIDER_UNAVAILABLE" });
        return;
      }
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const authenticated = deps.readAuthenticatedContext?.(req);
      const tenantId = authenticated?.tenantId ?? (xOrg ? await resolveTenantId(db, xOrg, xRealm) : null);
      if (!tenantId) {
        res.status(400).json({ error: "TENANT_CONTEXT_REQUIRED" });
        return;
      }
      const plane = resolvePlaneSegment(req.headers["x-plane"]);
      const locals = res.locals as Record<string, unknown>;
      const requestMemo = (locals["executionDescriptorMemo"] ??= new Map()) as Map<string, Promise<ExecutionDescriptorProviderResult>>;
      const result = await executionDescriptorProvider.get({ plane, tenantId, entityCode }, requestMemo);
      const etag = `"execdesc-${result.descriptor.identity.compiledHash}"`;
      locals["descriptorCacheState"] = result.cacheState;
      locals["descriptorHash"] = result.descriptor.identity.compiledHash;
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("X-Descriptor-Cache", result.cacheState);
      res.setHeader("X-Descriptor-Hash", result.descriptor.identity.compiledHash);
      res.setHeader("X-Descriptor-Generation", result.generation);
      if (req.headers["if-none-match"] === etag) { res.status(304).end(); return; }
      res.json(result.serialized);
    } catch (error) {
      if (error instanceof ExecutionDescriptorNotFoundError) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: error.message });
        return;
      }
      if (error instanceof TenantOverlayValidationError) {
        res.status(409).json({
          error: "TENANT_OVERLAY_INVALID",
          entity: error.entityCode,
          diagnostics: error.diagnostics,
        });
        return;
      }
      next(error);
    }
  };

  router.get("/metadata/entities/:entity/execution-descriptor", executionDescriptorHandler);
  router.get("/metadata/entities/:entity/compiled", handler);
  // Catalog metadata is available for every registered entity, including
  // internal, reference, projection, and non-runtime entities. It is never
  // used as an execution descriptor and therefore does not require a tenant
  // execution context.
  router.get("/metadata/catalog/:entity", async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const entityCode = String(req.params["entity"] ?? "").replace(/-/g, "_");
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const catalogTenantId = deps.readAuthenticatedContext?.(req)?.tenantId
        ?? (xOrg ? await resolveTenantId(db, xOrg, xRealm) : null);
      if (compiledEntityProvider && catalogTenantId) {
        const compiled = await compiledEntityProvider.loadRuntimeCompiledEntity(entityCode, catalogTenantId);
        if (compiled) {
          const payload = projectCompiledEntityResponse(compiled);
          res.setHeader("ETag", `\"catalog-${compiled.compiled_hash}\"`);
          res.setHeader("X-Contract-Version", "2");
          res.json(payload);
          return;
        }
      }
      const row = await db
        .selectFrom("snapshot.entity_compiled as ec")
        .innerJoin("control.entity_version as ev", "ev.id", "ec.entity_version_id")
        .innerJoin("control.entity as e", "e.id", "ev.entity_id")
        .select(["ec.compiled_json", "ec.compiled_hash", "ec.created_at"])
        .where("ec.tenant_id", "is", null)
        .where("ec.artifact_kind", "=", "catalog")
        .where("ev.status", "=", "EFFECTIVE")
        .where((eb: any) => eb.or([
          eb("e.entity_code", "=", entityCode),
          eb("e.name", "=", entityCode),
          eb("e.slug", "=", entityCode.replace(/_/g, "-")),
        ]))
        .orderBy("ec.created_at", "desc")
        .executeTakeFirst() as { compiled_json: unknown; compiled_hash: string; created_at: unknown } | undefined;
      if (!row) {
        res.status(404).json({ error: "CATALOG_ENTITY_NOT_FOUND", entity: entityCode });
        return;
      }
      res.setHeader("ETag", `\"catalog-${row.compiled_hash}\"`);
      res.json(row.compiled_json);
    } catch (error) {
      next(error);
    }
  });
  return router;
}

/**
 * Invalidate the server-side descriptor cache for a specific entity + tenant.
 * Increments the exact generation; content-addressed payloads expire naturally.
 * Call this after any schema change (entity version publish, field add/remove).
 */
export async function invalidateDescriptorCache(
  cache:      DescriptorCache,
  tenantId:   string,
  entityCode: string,
): Promise<void> {
  if (!cache.incr) return;
  const planes: Array<"neon" | "mesh" | "admin"> = ["neon", "mesh", "admin"];
  const keys = new Set<string>([
    "execdesc:gen:v1:__all__:__all__:__all__",
  ]);
  for (const plane of planes) {
    keys.add(`execdesc:gen:v1:${plane}:__all__:__all__`);
    keys.add(`execdesc:gen:v1:${plane}:__all__:${entityCode}`);
    keys.add(`execdesc:gen:v1:${plane}:${tenantId}:__all__`);
    keys.add(`execdesc:gen:v1:${plane}:${tenantId}:${entityCode}`);
  }
  await Promise.all([...keys].map((key) => cache.incr!(key).catch(() => { /* best-effort */ })));
}
