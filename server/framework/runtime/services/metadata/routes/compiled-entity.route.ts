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

/** Map entity_field row → EntityField contract shape */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapField(row: Record<string, any>) {
  // reference_config: prefer the jsonb column, fall back to validation->ref_entity
  let referenceConfig: { target_entity: string; target_field?: string; display_field?: string } | null = null;
  if (row.reference_config && typeof row.reference_config === "object") {
    referenceConfig = {
      target_entity: row.reference_config.target_entity ?? row.reference_config.ref_entity ?? "",
      target_field: row.reference_config.target_field,
      display_field: row.reference_config.display_field,
    };
  } else if (row.validation && typeof row.validation === "object" && row.validation.ref_entity) {
    referenceConfig = { target_entity: row.validation.ref_entity as string };
  }

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
    sort_order: Number(row.sort_order ?? 0),
    group_key: (row.ui_hint?.group_key ?? null) as string | null,
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
      // Two-level lookup: pointer (desc:v2:{tenantId}:{entityCode}:ptr) → compiledHash
      //                   payload (desc:v2:{tenantId}:{entityCode}:{compiledHash})
      if (cache && tenantId) {
        try {
          const ptr = await cache.get(descriptorCachePointerKey(tenantId, entityCode));
          if (ptr) {
            const cached = await cache.get(descriptorCacheKey(tenantId, entityCode, ptr));
            if (cached) {
              const payload = JSON.parse(cached) as Record<string, unknown>;
              const etagValue = `"ced-${payload["compiled_hash"]}"`;
              res.setHeader("ETag", etagValue);
              res.setHeader("Cache-Control", "no-cache");
              res.setHeader("X-Cache", "HIT");

              if (req.headers["if-none-match"] === etagValue) {
                res.status(304).end();
                return;
              }
              res.json(payload);
              return;
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
      const displayConfig = {
        title_field: (dbDisplayConfig["title_field"] ?? undefined) as string | undefined,
        subtitle_field: (dbDisplayConfig["subtitle_field"] ?? undefined) as string | undefined,
        icon: ((dbDisplayConfig["icon"] ?? entityRow.icon_key) ?? undefined) as string | undefined,
        color: ((dbDisplayConfig["color"] ?? entityRow.color_token) ?? undefined) as string | undefined,
        default_sort_field: (dbDisplayConfig["default_sort_field"] ?? undefined) as string | undefined,
        default_sort_order: (dbDisplayConfig["default_sort_order"] ?? undefined) as "asc" | "desc" | undefined,
        list_columns: (dbDisplayConfig["list_columns"] ?? undefined) as string[] | undefined,
        search_fields: (dbDisplayConfig["search_fields"] ?? undefined) as string[] | undefined,
      };

      // ── Build feature_flags ───────────────────────────────────────────────
      const dbFlags = (entityRow.feature_flags ?? {}) as Record<string, unknown>;
      const featureFlags = {
        has_attachments: Boolean(dbFlags["allow_attachments"] ?? dbFlags["has_attachments"] ?? false),
        has_comments: Boolean(dbFlags["allow_comments"] ?? dbFlags["has_comments"] ?? false),
        has_activity_log: Boolean(dbFlags["has_activity_log"] ?? true),
        has_workflow: Boolean(dbFlags["is_approvable"] ?? dbFlags["has_workflow"] ?? false),
        has_lifecycle: Boolean(dbFlags["has_lifecycle"] ?? true),
        has_versioning: Boolean(dbFlags["has_versioning"] ?? false),
        is_importable: Boolean(dbFlags["is_importable"] ?? false),
        is_exportable: Boolean(dbFlags["allow_export"] ?? dbFlags["is_exportable"] ?? false),
        is_bulk_editable: Boolean(dbFlags["is_bulk_editable"] ?? false),
      };

      // ── Compiled hash ─────────────────────────────────────────────────────
      const versionHash = entityRow.version_hash
        ?? simpleHash(`${String(entityRow.id)}-v${entityRow.version_no}`);
      const compiledHash = simpleHash(`${versionHash}-${fields.length}`);

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
      // Write both the content-addressed payload and the pointer.
      // Deleting the pointer (invalidateDescriptorCache) is sufficient to invalidate;
      // the old content-addressed entry expires naturally after TTL.
      if (cache && tenantId) {
        Promise.all([
          cache.set(descriptorCacheKey(tenantId, entityCode, compiledHash), JSON.stringify(payload), DESCRIPTOR_CACHE_TTL_S),
          cache.set(descriptorCachePointerKey(tenantId, entityCode), compiledHash, DESCRIPTOR_CACHE_TTL_S),
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
