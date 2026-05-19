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
import { extractOrgHeaders, resolveTenantId } from "@athyper/svc-shared";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Minimal Redis interface for server-side descriptor caching. */
export interface DescriptorCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
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
}

// ─── Cache helpers ─────────────────────────────────────────────────────────────

const DESCRIPTOR_CACHE_TTL_S = 300; // 5 min

/**
 * Content-addressed payload key.
 * Format: desc:v2:{tenantId}:{entityCode}:{versionHash}
 * Different hashes create different keys → stale entries expire naturally (no explicit DEL needed).
 */
function descriptorCacheKey(tenantId: string, entityCode: string, versionHash: string): string {
  return `desc:v2:${tenantId}:${entityCode}:${versionHash}`;
}

/**
 * Pointer key — stores the current compiledHash for a tenant+entity pair.
 * Short-lived (same TTL as payload). Deleting this key invalidates the cache
 * without having to know the current hash.
 */
function descriptorCachePointerKey(tenantId: string, entityCode: string): string {
  return `desc:v2:${tenantId}:${entityCode}:ptr`;
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

/**
 * Normalize raw DB feature_flags JSON into the canonical CompiledEntity contract shape.
 *
 * Legacy DB flag names are mapped to their canonical equivalents so that
 * resolveTabs() and the client renderers always see a consistent flag set.
 * Legacy aliases are preserved alongside canonical names as a safety net
 * for the ?? fallback logic in resolveTabs() during the migration window.
 */
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeFeatureFlags(raw: Record<string, unknown>): Record<string, unknown> {
  const canonical: Record<string, unknown> = { ...raw };

  for (const [target, aliases] of Object.entries(FEATURE_FLAG_ALIASES)) {
    if (target in canonical) continue;
    const alias = aliases.find((key) => key in raw);
    if (alias) canonical[target] = raw[alias];
  }

  // DB may store is_approvable or approval_workflow; canonical: is_approvable
  if (!("is_approvable" in canonical) && ("approval_workflow" in raw)) {
    canonical["is_approvable"] = Boolean(raw["approval_workflow"]);
  }

  // allow_attachments → has_attachments (canonical)
  if (!("has_attachments" in canonical) && ("allow_attachments" in raw)) {
    canonical["has_attachments"] = Boolean(raw["allow_attachments"]);
  }

  // allow_export / is_exportable (canonical)
  if (!("is_exportable" in canonical) && ("allow_export" in raw)) {
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
    const normalized = Object.fromEntries(Object.entries({
      ...rawConfig,
      target_entity: targetEntity ?? "",
      target_field: rawConfig["target_field"],
      display_field: rawConfig["display_field"],
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
function mapField(row: Record<string, any>, referencePickerProfiles?: Map<string, Record<string, unknown>>) {
  const targetEntity = referenceTargetEntity(row);
  const referencePickerProfile = targetEntity ? referencePickerProfiles?.get(targetEntity) : undefined;

  const uiHint = row.ui_hint && typeof row.ui_hint === "object"
    ? row.ui_hint as Record<string, unknown>
    : null;
  const fieldFilterConfig = asRecord(row.filter_config);
  const filterConfig = fieldFilterConfig ?? (uiHint?.["filter"] && typeof uiHint["filter"] === "object"
    ? uiHint["filter"] as Record<string, unknown>
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
    default_value: row.default_value ?? null,
    validation_rules: normalizeValidationRules(row.validation),
    enum_domain_code: (row.enum_domain_code ?? null) as string | null,
    reference_config: normalizeReferenceConfig(row, referencePickerProfile),
    money_config: (row.money_config && typeof row.money_config === "object")
      ? row.money_config as Record<string, unknown>
      : null,
    json_config: (row.json_config && typeof row.json_config === "object")
      ? row.json_config as Record<string, unknown>
      : null,
    sort_order: Number(row.sort_order ?? 0),
    group_key: (row.group_key ?? row.ui_hint?.group_key ?? null) as string | null,
    ui_hint: uiHint,
    visibility: (row.visibility && typeof row.visibility === "object")
      ? row.visibility as Record<string, unknown>
      : null,
    editability: (row.editability && typeof row.editability === "object")
      ? row.editability as Record<string, unknown>
      : null,
    lookup_config: (row.lookup_config && typeof row.lookup_config === "object")
      ? row.lookup_config as Record<string, unknown>
      : null,
    filter_config: filterConfig,
    i18n_key: (row.ui_hint?.i18n_key ?? null) as string | null,
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
  const { db, auth, logger, cache } = deps;

  const handler: RequestHandler = async (req, res, next) => {
    try {
      // ── Auth ──────────────────────────────────────────────────────────────
      const authHeader = req.headers.authorization ?? "";
      const match = /^Bearer\s+(.+)$/i.exec(authHeader);
      if (!match) {
        res.status(401).json({ error: "MISSING_TOKEN", message: "Authorization: Bearer <token> required" });
        return;
      }
      try {
        await auth.verifyToken(match[1]!);
      } catch {
        res.status(401).json({ error: "INVALID_TOKEN", message: "Token verification failed" });
        return;
      }

      // ── Resolve entity + effective version ────────────────────────────────
      // Normalise URL slug → DB name (journal-entry → journal_entry)
      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");

      // ── Resolve tenant (required for tenant-isolated cache key) ───────────
      // Fail-open: if X-Org is absent we skip the cache (prevents cross-tenant leakage).
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = xOrg ? await resolveTenantId(db, xOrg, xRealm) : null;

      // ── Server-side cache check ───────────────────────────────────────────
      // Only use cache when tenantId is known — prevents v1-style cross-tenant leakage.
      // Two-level lookup: pointer (desc:v2:{tenantId}:{entityCode}:ptr) → JSON fingerprint
      //                   payload (desc:v2:{tenantId}:{entityCode}:{compiledHash})
      //
      // The pointer stores a JSON fingerprint: {compiledHash, versionHash, displayConfigHash}.
      // On each cache hit we run one lightweight DB query (display_config + version_hash only,
      // no field join) to validate the fingerprint before serving the cached payload.
      // If the fingerprint mismatches (post-reseed or display_config patch) we delete the
      // stale pointer and fall through to the full compile path.
      if (cache && tenantId) {
        try {
          const ptrRaw = await cache.get(descriptorCachePointerKey(tenantId, entityCode));
          if (ptrRaw) {
            // Parse fingerprint — old-format pointer (plain hash string) always fails JSON.parse
            // and is treated as a cache miss, causing a fresh compile + write.
            let fingerprint: {
              compiledHash: string;
              versionHash: string;
              displayConfigHash: string;
              identityConfigHash?: string;
              searchConfigHash?: string;
            } | null = null;
            try { fingerprint = JSON.parse(ptrRaw); } catch { /* old format — fall through */ }

            if (fingerprint?.compiledHash && fingerprint.versionHash && fingerprint.displayConfigHash) {
              // Lightweight validation query — only display_config + version columns, no field join.
              let fpQuery = db
                .selectFrom("control.entity as e")
                .innerJoin("control.entity_version as ev", "ev.entity_id", "e.id")
                .select([
                  "e.display_config",
                  "e.identity_config",
                  "e.search_config",
                  sql<number>`ev.version_no`.as("version_no"),
                  sql<string | null>`ev.version_hash`.as("version_hash"),
                  sql<string>`e.id::text`.as("entity_id"),
                ])
                .where((eb: any) => eb.or([
                  eb("e.name", "=", entityCode),
                  eb("e.entity_code", "=", entityCode),
                  eb("e.slug", "=", entityCode.replace(/_/g, "-")),
                ]))
                .where("ev.status", "=", "EFFECTIVE");
              if (tenantId) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                fpQuery = fpQuery.where((eb: any) => eb.or([eb("e.tenant_id", "=", tenantId), eb("e.tenant_id", "is", null)])).orderBy(sql`e.tenant_id NULLS LAST`);
              } else {
                fpQuery = fpQuery.where("e.tenant_id", "is", null);
              }
              const fpRow = await fpQuery.limit(1).executeTakeFirst();

              if (fpRow) {
                const currentDC = (fpRow.display_config ?? {}) as Record<string, unknown>;
                const currentIC = (fpRow.identity_config ?? {}) as Record<string, unknown>;
                const currentSC = (fpRow.search_config ?? {}) as Record<string, unknown>;
                const currentVH = fpRow.version_hash ?? simpleHash(`${fpRow.entity_id}-v${fpRow.version_no}`);
                const currentDCH = simpleHash(JSON.stringify(currentDC));
                const currentICH = simpleHash(JSON.stringify(currentIC));
                const currentSCH = simpleHash(JSON.stringify(currentSC));
                const fpValid = currentVH === fingerprint.versionHash
                  && currentDCH === fingerprint.displayConfigHash
                  && currentICH === fingerprint.identityConfigHash
                  && currentSCH === fingerprint.searchConfigHash;

                if (fpValid) {
                  const cached = await cache.get(descriptorCacheKey(tenantId, entityCode, fingerprint.compiledHash));
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
                } else {
                  // Fingerprint mismatch — display_config or version changed since last cache write.
                  // Delete the stale pointer so the next request re-populates cleanly.
                  await cache.del(descriptorCachePointerKey(tenantId, entityCode));
                }
              }
            }
          }
        } catch (cacheErr) {
          logger?.warn("compiled_entity_cache_read_failed", { entityCode, tenantId, err: String(cacheErr) });
          // Fail-open: fall through to DB
        }
      }

      // ── Tenant-aware entity lookup ─────────────────────────────────────────
      // When tenantId is known:  prefer tenant-specific row over platform row
      //   (ORDER BY tenant_id NULLS LAST → non-null tenant wins, NULL platform fallback)
      // When tenantId is null:   platform entities only (tenant_id IS NULL)
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
          "e.table_schema",
          "e.table_name",
          "e.display_config",
          "e.identity_config",
          "e.search_config",
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

      // ── Fields ────────────────────────────────────────────────────────────
      const fieldRows = await db
        .selectFrom("control.entity_field as ef")
        .selectAll()
        .where("ef.entity_version_id", "=", entityRow.version_id)
        .where("ef.is_active", "=", true)
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
          .select(["fg.group_key", "fg.label", "fg.description", "fg.sort_order"])
          .where("fg.group_key", "in", usedGroupKeys as string[])
          .orderBy("fg.sort_order", "asc")
          .execute();

        fieldGroups = groupRows.map((g) => ({
          group_key: g.group_key as string,
          label: g.label as string,
          description: (g.description ?? null) as string | null,
          sort_order: Number(g.sort_order ?? 0),
          fields: fields.filter((f) => f.group_key === g.group_key).map((f) => f.name),
        }));
      }

      // ── Build display_config ──────────────────────────────────────────────
      const dbDisplayConfig = (entityRow.display_config ?? {}) as Record<string, unknown>;
      const dbIdentityConfig = (entityRow.identity_config ?? {}) as Record<string, unknown>;
      const dbSearchConfig = (entityRow.search_config ?? {}) as Record<string, unknown>;
      const displayConfig = normalizeDisplayConfig(dbDisplayConfig, entityRow.icon_key, entityRow.color_token);

      // ── Build feature_flags ───────────────────────────────────────────────
      const rawFlags = (entityRow.feature_flags ?? {}) as Record<string, unknown>;
      const featureFlags = normalizeFeatureFlags(rawFlags);

      // ── Compiled hash ─────────────────────────────────────────────────────
      const versionHash = entityRow.version_hash
        ?? simpleHash(`${String(entityRow.id)}-v${entityRow.version_no}`);
      // Include display_config in hash so changes to document_header or
      // detail_renderer bust the Redis descriptor cache automatically.
      const displayConfigHash = simpleHash(JSON.stringify(dbDisplayConfig));
      const identityConfigHash = simpleHash(JSON.stringify(dbIdentityConfig));
      const searchConfigHash = simpleHash(JSON.stringify(dbSearchConfig));
      const fieldsHash = simpleHash(JSON.stringify(fields));
      const compiledHash = simpleHash(`${versionHash}-${fieldsHash}-${displayConfigHash}-${identityConfigHash}-${searchConfigHash}`);

      const payload = {
        entity_id: entityRow.id as string,
        entity_code: entityRow.entity_code as string,
        slug: (entityRow.slug ?? String(entityRow.table_name).replace(/_/g, "-")) as string,
        entity_name: (entityRow.label_singular ?? entityRow.name) as string,
        entity_class: entityRow.entity_class as string,
        table_schema: entityRow.table_schema as string,
        table_name: entityRow.table_name as string,
        version_no: Number(entityRow.version_no),
        version_hash: versionHash,
        fields,
        field_groups: fieldGroups,
        display_config: displayConfig,
        identity_config: dbIdentityConfig,
        search_config: dbSearchConfig,
        feature_flags: featureFlags,
        governance_level: entityRow.governance_level as string,
        security_tier: entityRow.security_tier as string,
        compiled_at: new Date().toISOString(),
        compiled_hash: compiledHash,
      };

      // ETag / 304 — descriptor is content-addressed by compiled_hash
      const etagValue = `"ced-${compiledHash}"`;
      res.setHeader("ETag", etagValue);
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("X-Cache", "MISS");

      if (req.headers["if-none-match"] === etagValue) {
        res.status(304).end();
        return;
      }

      // Populate server-side cache (best-effort; do not block response).
      // Pointer stores a JSON fingerprint {compiledHash, versionHash, displayConfigHash}
      // so the read path can validate against current DB state with one lightweight query.
      if (cache && tenantId) {
        const pointerFingerprint = JSON.stringify({ compiledHash, versionHash, displayConfigHash, identityConfigHash, searchConfigHash });
        Promise.all([
          cache.set(descriptorCacheKey(tenantId, entityCode, compiledHash), JSON.stringify(payload), DESCRIPTOR_CACHE_TTL_S),
          cache.set(descriptorCachePointerKey(tenantId, entityCode), pointerFingerprint, DESCRIPTOR_CACHE_TTL_S),
        ]).catch((err) => logger?.warn("compiled_entity_cache_write_failed", { entityCode, tenantId, err: String(err) }));
      }

      res.json(payload);
      return;
    } catch (err) {
      logger?.error("compiled_entity_route_error", { err: String(err) });
      next(err);
    }
  };

  router.get("/metadata/entities/:entity/compiled", handler);
  return router;
}

/**
 * Invalidate the server-side descriptor cache for a specific entity + tenant.
 * Deletes the pointer key; the content-addressed payload expires naturally after TTL.
 * Call this after any schema change (entity version publish, field add/remove).
 */
export async function invalidateDescriptorCache(
  cache:      DescriptorCache,
  tenantId:   string,
  entityCode: string,
): Promise<void> {
  try {
    await cache.del(descriptorCachePointerKey(tenantId, entityCode));
  } catch {
    // best-effort
  }
}
