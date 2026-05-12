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

/**
 * Normalize raw DB feature_flags JSON into the canonical CompiledEntity contract shape.
 *
 * Legacy DB flag names are mapped to their canonical equivalents so that
 * resolveTabs() and the client renderers always see a consistent flag set.
 * Legacy aliases are preserved alongside canonical names as a safety net
 * for the ?? fallback logic in resolveTabs() during the migration window.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeFeatureFlags(raw: Record<string, unknown>): Record<string, unknown> {
  const canonical: Record<string, unknown> = { ...raw };

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

  return canonical;
}


/** Map entity_field row → EntityField contract shape */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapField(row: Record<string, any>) {
  // reference_config: prefer the jsonb column, fall back to validation->ref_entity
  let referenceConfig: Record<string, unknown> | null = null;
  if (row.reference_config && typeof row.reference_config === "object") {
    const rawConfig = row.reference_config as Record<string, unknown>;
    referenceConfig = {
      ...rawConfig,
      target_entity: rawConfig["target_entity"] ?? rawConfig["ref_entity"] ?? "",
      target_field: rawConfig["target_field"],
      display_field: rawConfig["display_field"],
    };
  } else if (row.validation && typeof row.validation === "object" && row.validation.ref_entity) {
    referenceConfig = {
      target_entity: row.validation.ref_entity as string,
      target_field: row.validation.target_field,
      display_field: row.validation.display_field,
    };
  }

  const uiHint = row.ui_hint && typeof row.ui_hint === "object"
    ? row.ui_hint as Record<string, unknown>
    : null;
  const filterConfig = uiHint?.["filter"] && typeof uiHint["filter"] === "object"
    ? uiHint["filter"] as Record<string, unknown>
    : null;

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
    is_searchable: Boolean(row.is_searchable),
    is_filterable: Boolean(row.is_filterable),
    is_sortable: Boolean(row.is_sortable),
    is_groupable: Boolean(row.is_groupable),
    is_aggregatable: Boolean(row.is_aggregatable),
    is_pii: false,
    default_value: row.default_value ?? null,
    validation_rules: (row.validation && typeof row.validation === "object" && !row.validation.ref_entity)
      ? row.validation
      : null,
    enum_domain_code: (row.enum_domain_code ?? null) as string | null,
    reference_config: referenceConfig,
    money_config: (row.money_config && typeof row.money_config === "object")
      ? row.money_config as Record<string, unknown>
      : null,
    sort_order: Number(row.sort_order ?? 0),
    group_key: (row.ui_hint?.group_key ?? null) as string | null,
    ui_hint: uiHint,
    lookup_config: (row.lookup_config && typeof row.lookup_config === "object")
      ? row.lookup_config as Record<string, unknown>
      : null,
    filter_config: filterConfig,
    i18n_key: (row.ui_hint?.i18n_key ?? null) as string | null,
  };
}

// ─── Route factory ────────────────────────────────────────────────────────────

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
            let fingerprint: { compiledHash: string; versionHash: string; displayConfigHash: string } | null = null;
            try { fingerprint = JSON.parse(ptrRaw); } catch { /* old format — fall through */ }

            if (fingerprint?.compiledHash && fingerprint.versionHash && fingerprint.displayConfigHash) {
              // Lightweight validation query — only display_config + version columns, no field join.
              let fpQuery = db
                .selectFrom("control.entity as e")
                .innerJoin("control.entity_version as ev", "ev.entity_id", "e.id")
                .select([
                  "e.display_config",
                  sql<number>`ev.version_no`.as("version_no"),
                  sql<string | null>`ev.version_hash`.as("version_hash"),
                  sql<string>`e.id::text`.as("entity_id"),
                ])
                .where(sql`COALESCE(e.entity_code, e.name)`, "=", entityCode)
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
                const currentVH = fpRow.version_hash ?? simpleHash(`${fpRow.entity_id}-v${fpRow.version_no}`);
                const currentDCH = simpleHash(JSON.stringify(currentDC));
                const fpValid = currentVH === fingerprint.versionHash && currentDCH === fingerprint.displayConfigHash;

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
          sql<string>`COALESCE(e.entity_code, e.name)`.as("entity_code"),
          "e.label_singular",
          "e.entity_class",
          "e.table_schema",
          "e.table_name",
          "e.display_config",
          "e.feature_flags",
          "e.governance_level",
          "e.security_tier",
          "e.icon_key",
          "e.color_token",
          sql<string>`ev.id`.as("version_id"),
          sql<number>`ev.version_no`.as("version_no"),
          sql<string | null>`ev.version_hash`.as("version_hash"),
        ])
        .where(sql`COALESCE(e.entity_code, e.name)`, "=", entityCode)
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

      const fields = fieldRows.map((r) => mapField(r as Record<string, unknown>));

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
      const masterConfigValue = (dbDisplayConfig["master_config"] ?? undefined) as Record<string, unknown> | undefined;
      const displayConfig = {
        code_field:         (dbDisplayConfig["code_field"] ?? undefined) as string | undefined,
        title_field:        (dbDisplayConfig["title_field"] ?? undefined) as string | undefined,
        subtitle_field:     (dbDisplayConfig["subtitle_field"] ?? undefined) as string | undefined,
        icon:               ((dbDisplayConfig["icon"] ?? entityRow.icon_key) ?? undefined) as string | undefined,
        color:              ((dbDisplayConfig["color"] ?? entityRow.color_token) ?? undefined) as string | undefined,
        default_sort_field: (dbDisplayConfig["default_sort_field"] ?? undefined) as string | undefined,
        default_sort_order: (dbDisplayConfig["default_sort_order"] ?? undefined) as "asc" | "desc" | undefined,
        list_columns:       (dbDisplayConfig["list_columns"] ?? undefined) as string[] | undefined,
        search_fields:      (dbDisplayConfig["search_fields"] ?? undefined) as string[] | undefined,
        filter_bar:         (dbDisplayConfig["filter_bar"] ?? undefined) as Record<string, unknown> | undefined,
        detail_renderer:    (dbDisplayConfig["detail_renderer"] ?? undefined) as string | undefined,
        detail_profile:     (dbDisplayConfig["detail_profile"] ?? undefined) as string | undefined,
        document_header:    (dbDisplayConfig["document_header"] ?? undefined) as Record<string, unknown> | undefined,
        journal_editor:     (dbDisplayConfig["journal_editor"] ?? undefined) as Record<string, unknown> | undefined,
        journal_line_fields:(dbDisplayConfig["journal_line_fields"] ?? undefined) as Record<string, unknown> | undefined,
        line_grid:          (dbDisplayConfig["line_grid"] ?? undefined) as Record<string, unknown> | undefined,
        master_config:      masterConfigValue,
        // Lines section — null = entity has no line items; string = registered renderer key.
        // "lines_renderer" in check preserves explicit null (no lines) vs. absent (also no lines).
        lines_renderer:     "lines_renderer" in dbDisplayConfig
          ? (dbDisplayConfig["lines_renderer"] as string | null)
          : null,
        line_entity_code:   (dbDisplayConfig["line_entity_code"] ?? undefined) as string | undefined,
        list_renderer:      (dbDisplayConfig["list_renderer"] ?? undefined) as string | undefined,
        view_modes:         (dbDisplayConfig["view_modes"] ?? undefined) as string[] | undefined,
        status_field_names: (dbDisplayConfig["status_field_names"] ?? undefined) as string[] | undefined,
        alternate_flows:    (dbDisplayConfig["alternate_flows"] ?? undefined) as string[] | undefined,
        intake_modes:       Array.isArray(dbDisplayConfig["intake_modes"])
          ? (dbDisplayConfig["intake_modes"] as Record<string, unknown>[])
          : undefined,
        create_redirect:    (dbDisplayConfig["create_redirect"] ?? undefined) as Record<string, unknown> | undefined,
        action_groups:      (dbDisplayConfig["action_groups"] ?? undefined) as Record<string, unknown> | undefined,
        status_resolver:    (dbDisplayConfig["status_resolver"] ?? undefined) as string | undefined,
        // Procurement line-sheet variant switcher + layout config
        line_ui_variant:    (dbDisplayConfig["line_ui_variant"] ?? undefined) as string | undefined,
        procure_line:       (dbDisplayConfig["procure_line"] ?? undefined) as Record<string, unknown> | undefined,
      };

      // ── Build feature_flags ───────────────────────────────────────────────
      const rawFlags = (entityRow.feature_flags ?? {}) as Record<string, unknown>;
      const featureFlags = normalizeFeatureFlags(rawFlags);

      // ── Compiled hash ─────────────────────────────────────────────────────
      const versionHash = entityRow.version_hash
        ?? simpleHash(`${String(entityRow.id)}-v${entityRow.version_no}`);
      // Include display_config in hash so changes to document_header or
      // detail_renderer bust the Redis descriptor cache automatically.
      const displayConfigHash = simpleHash(JSON.stringify(dbDisplayConfig));
      const fieldsHash = simpleHash(JSON.stringify(fields));
      const compiledHash = simpleHash(`${versionHash}-${fieldsHash}-${displayConfigHash}`);

      const payload = {
        entity_id: entityRow.id as string,
        entity_code: entityRow.entity_code as string,
        entity_name: (entityRow.label_singular ?? entityRow.name) as string,
        entity_class: entityRow.entity_class as string,
        table_schema: entityRow.table_schema as string,
        table_name: entityRow.table_name as string,
        version_no: Number(entityRow.version_no),
        version_hash: versionHash,
        fields,
        field_groups: fieldGroups,
        display_config: displayConfig,
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
        const pointerFingerprint = JSON.stringify({ compiledHash, versionHash, displayConfigHash });
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
