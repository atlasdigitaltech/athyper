/**
 * Entity Metadata Resolution
 *
 * Resolves entity URL slugs to database table metadata.
 * Handles kebab-case ↔ PascalCase conversion and caches results.
 *
 * NOTE: This file imports kysely (a serverExternalPackage).
 * Client components should import name conversion utilities from
 * entity-meta-utils.ts instead to avoid bundling kysely in the client.
 */

import { sql, type Kysely } from "kysely";

import { slugToEntityName } from "./entity-meta-utils";

// Re-export client-safe utilities so existing server-side imports keep working
export {
  slugToEntityName,
  entityNameToSlug,
  entityNameToDisplayName,
} from "./entity-meta-utils";

// ============================================================================
// Types
// ============================================================================

export interface EntityTableMeta {
  entityName: string;
  tableSchema: string;
  tableName: string;
  kind: string;
  governanceLevel: string;
  entityShort: string | null;
  featureFlags: Record<string, unknown> | null;
}

// ============================================================================
// Resolution Cache (TTL-based to pick up DB changes without restart)
// ============================================================================

interface CacheEntry {
  meta: EntityTableMeta;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000; // 60 seconds
const entityMetaCache = new Map<string, CacheEntry>();

/**
 * Resolve an entity slug (or PascalCase name) to its table metadata.
 * Results are cached with a 60-second TTL.
 */
export async function resolveEntityMeta(
  db: Kysely<any>,
  entitySlugOrName: string,
  tenantId: string,
): Promise<EntityTableMeta | null> {
  const cacheKey = `${tenantId}:${entitySlugOrName}`;
  const cached = entityMetaCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.meta;

  // Try as-is first (might already be PascalCase), then try converting from slug
  const candidates = [entitySlugOrName, slugToEntityName(entitySlugOrName)];

  for (const name of candidates) {
    const row = await sql<{
      name: string;
      table_schema: string;
      table_name: string;
      kind: string;
      governance_level: string;
      entity_short: string | null;
      feature_flags: Record<string, unknown> | null;
    }>`
            SELECT name, table_schema, table_name, kind, governance_level, entity_short, feature_flags
            FROM meta.entity
            WHERE name = ${name}
              AND tenant_id = ${tenantId}
              AND is_active = true
            LIMIT 1
        `.execute(db);

    if (row.rows.length > 0) {
      const r = row.rows[0];
      const meta: EntityTableMeta = {
        entityName: r.name,
        tableSchema: r.table_schema,
        tableName: r.table_name,
        kind: r.kind,
        governanceLevel: r.governance_level,
        entityShort: r.entity_short,
        featureFlags: r.feature_flags ?? null,
      };
      // Cache under both the input key and the normalized name
      const entry: CacheEntry = { meta, expiresAt: Date.now() + CACHE_TTL_MS };
      entityMetaCache.set(cacheKey, entry);
      entityMetaCache.set(`${tenantId}:${r.name}`, entry);
      return meta;
    }
  }

  return null;
}

/**
 * Resolve entity metadata by (tableSchema, tableName) instead of by slug.
 * Useful for FK label caching where only schema/table are known.
 * Results are cached with the same 60-second TTL.
 */
export async function resolveEntityMetaByTable(
  db: Kysely<any>,
  tableSchema: string,
  tableName: string,
  tenantId: string,
): Promise<EntityTableMeta | null> {
  const cacheKey = `${tenantId}:${tableSchema}.${tableName}`;
  const cached = entityMetaCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.meta;

  const row = await sql<{
    name: string;
    table_schema: string;
    table_name: string;
    kind: string;
    governance_level: string;
    entity_short: string | null;
    feature_flags: Record<string, unknown> | null;
  }>`
        SELECT name, table_schema, table_name, kind, governance_level, entity_short, feature_flags
        FROM meta.entity
        WHERE table_schema = ${tableSchema}
          AND table_name = ${tableName}
          AND tenant_id = ${tenantId}
          AND is_active = true
        LIMIT 1
    `.execute(db);

  if (row.rows.length === 0) return null;

  const r = row.rows[0];
  const meta: EntityTableMeta = {
    entityName: r.name,
    tableSchema: r.table_schema,
    tableName: r.table_name,
    kind: r.kind,
    governanceLevel: r.governance_level,
    entityShort: r.entity_short,
    featureFlags: r.feature_flags ?? null,
  };
  const entry: CacheEntry = { meta, expiresAt: Date.now() + CACHE_TTL_MS };
  entityMetaCache.set(cacheKey, entry);
  entityMetaCache.set(`${tenantId}:${r.name}`, entry);
  return meta;
}

/**
 * Invalidate the entity meta cache (e.g. after admin changes).
 */
export function invalidateEntityMetaCache(): void {
  entityMetaCache.clear();
}
