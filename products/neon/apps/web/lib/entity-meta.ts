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

import {
  slugToEntityName,
  deriveEntityFeatureCapabilities,
  type EntityFeatureCapabilities,
} from "./entity-meta-utils";

// Re-export client-safe utilities so existing server-side imports keep working
export {
  slugToEntityName,
  entityNameToSlug,
  entityNameToDisplayName,
  deriveEntityFeatureCapabilities,
  isValidEntityStatus,
  isOperationalStatus,
  isValidStatusTransition,
  ENTITY_STATUS_TRANSITIONS,
  isValidOwnershipModel,
  isValidMutability,
  isValidBackingType,
  isMutationAllowed,
  extractTemplateTokens,
  validateFieldReferences,
  checkBackingMappingCompatibility,
  BACKING_MAPPING_COMPATIBILITY,
  validatePublishReadiness,
  type EntityFeatureCapabilities,
  type EntityRegistryStatus,
  type EntityOwnershipModel,
  type EntityMutability,
  type EntityBackingType,
  type FieldRefDiagnostic,
  type PublishValidationInput,
  type PublishValidationResult,
  type PublishValidationIssue,
} from "./entity-meta-utils";

// ============================================================================
// Types
// ============================================================================

export interface EntityTableMeta {
  entityName: string;
  entityCode: string | null;
  slug: string | null;
  tableSchema: string;
  tableName: string;
  kind: string;
  entityClass: string;
  governanceLevel: string;
  mappingMode: string;
  /** Physical backing type (table, view, materialized_view, virtual, external, event_stream) */
  backingType: string;
  /** Who owns this entity definition (system, tenant, package, overlay) */
  ownershipModel: string;
  /** Schema mutability level (locked, controlled, extensible, forkable) */
  mutability: string;
  entityShort: string | null;
  /** Entity registry lifecycle status (draft, active, deprecated, suspended, retired) */
  status: string;
  featureFlags: Record<string, unknown> | null;
  identityConfig: Record<string, unknown> | null;
  /** Derived feature capabilities — single source of truth for feature enablement */
  capabilities: EntityFeatureCapabilities;
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
      entity_code: string | null;
      slug: string | null;
      table_schema: string;
      table_name: string;
      kind: string;
      entity_class: string;
      governance_level: string;
      mapping_mode: string;
      backing_type: string;
      ownership_model: string;
      mutability: string;
      entity_short: string | null;
      status: string;
      feature_flags: Record<string, unknown> | null;
      identity_config: Record<string, unknown> | null;
    }>`
            SELECT name, entity_code, slug, table_schema, table_name, kind, entity_class, governance_level, mapping_mode, backing_type, ownership_model, mutability, entity_short, status, feature_flags, identity_config
            FROM meta.entity
            WHERE name = ${name}
              AND tenant_id = ${tenantId}
              AND is_active = true
            LIMIT 1
        `.execute(db);

    if (row.rows.length > 0) {
      const r = row.rows[0];
      const featureFlags = r.feature_flags ?? null;
      const meta: EntityTableMeta = {
        entityName: r.name,
        entityCode: r.entity_code ?? null,
        slug: r.slug ?? null,
        tableSchema: r.table_schema,
        tableName: r.table_name,
        kind: r.kind,
        entityClass: r.entity_class,
        governanceLevel: r.governance_level,
        mappingMode: r.mapping_mode,
        backingType: r.backing_type ?? "table",
        ownershipModel: r.ownership_model ?? "system",
        mutability: r.mutability ?? "controlled",
        entityShort: r.entity_short,
        status: r.status ?? "active",
        featureFlags,
        identityConfig: r.identity_config ?? null,
        capabilities: deriveEntityFeatureCapabilities(
          r.entity_class,
          r.governance_level,
          featureFlags,
        ),
      };
      // Cache under the input key, the normalized name, and the slug
      const entry: CacheEntry = { meta, expiresAt: Date.now() + CACHE_TTL_MS };
      entityMetaCache.set(cacheKey, entry);
      entityMetaCache.set(`${tenantId}:${r.name}`, entry);
      if (r.slug) entityMetaCache.set(`${tenantId}:${r.slug}`, entry);
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
    entity_code: string | null;
    slug: string | null;
    table_schema: string;
    table_name: string;
    kind: string;
    entity_class: string;
    governance_level: string;
    mapping_mode: string;
    backing_type: string;
    ownership_model: string;
    mutability: string;
    entity_short: string | null;
    status: string;
    feature_flags: Record<string, unknown> | null;
    identity_config: Record<string, unknown> | null;
  }>`
        SELECT name, entity_code, slug, table_schema, table_name, kind, entity_class, governance_level, mapping_mode, backing_type, ownership_model, mutability, entity_short, status, feature_flags, identity_config
        FROM meta.entity
        WHERE table_schema = ${tableSchema}
          AND table_name = ${tableName}
          AND tenant_id = ${tenantId}
          AND is_active = true
        LIMIT 1
    `.execute(db);

  if (row.rows.length === 0) return null;

  const r = row.rows[0];
  const featureFlags = r.feature_flags ?? null;
  const meta: EntityTableMeta = {
    entityName: r.name,
    entityCode: r.entity_code ?? null,
    slug: r.slug ?? null,
    tableSchema: r.table_schema,
    tableName: r.table_name,
    kind: r.kind,
    entityClass: r.entity_class,
    governanceLevel: r.governance_level,
    mappingMode: r.mapping_mode,
    backingType: r.backing_type ?? "table",
    ownershipModel: r.ownership_model ?? "system",
    mutability: r.mutability ?? "controlled",
    entityShort: r.entity_short,
    status: r.status ?? "active",
    featureFlags,
    identityConfig: r.identity_config ?? null,
    capabilities: deriveEntityFeatureCapabilities(
      r.entity_class,
      r.governance_level,
      featureFlags,
    ),
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
