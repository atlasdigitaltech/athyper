/**
 * Shared Entity Meta Field Queries
 *
 * Server-side utility functions for resolving entity field metadata.
 * Extracted from app/api/entity-meta/[entityKey]/fields/route.ts
 * to enable reuse by the entity-page descriptor API and data API.
 *
 * L1 cache: in-process Map, 10-minute TTL.
 * L2 cache: Redis, 24h TTL (fail-open, graceful degradation).
 */

import { sql, type Kysely } from "kysely";

import type { CacheMetrics } from "@/lib/redis-cache";
import {
    getNamespaceVersion,
    fieldsKey,
    colsKey,
    fkMapKey,
    cacheGet,
    cacheSet,
    acquireComputeLock,
    waitForLock,
    bumpNamespaceVersion,
    REDIS_TTL,
} from "@/lib/redis-cache";

// ============================================================================
// Types
// ============================================================================

export interface ServerFieldMeta {
    name: string;
    columnName: string;
    dataType: string;
    uiType: string | null;
    isRequired: boolean;
    isSearchable: boolean;
    isFilterable: boolean;
    sortOrder: number;
    validation: Record<string, unknown> | null;
    lookupConfig: Record<string, unknown> | null;

    // ── Phase 1: Structured configs & semantic format ──

    /** Semantic format hint (email, money, url, etc.) */
    format: string | null;
    /** Measurement unit */
    unit: string | null;
    /** Field multiplicity: "one" or "many" */
    cardinality: string;
    /** Field origin: "system" or "business" */
    origin: string;
    /** First-class display label */
    label: string | null;
    /** First-class description */
    description: string | null;
    /** Canonical constraints */
    constraints: Record<string, unknown> | null;
    /** Structured enum config */
    enumConfig: Record<string, unknown> | null;
    /** Structured reference config */
    referenceConfig: Record<string, unknown> | null;
    /** JSON field config */
    jsonConfig: Record<string, unknown> | null;
    /** Money config */
    moneyConfig: Record<string, unknown> | null;
    /** Datetime config */
    datetimeConfig: Record<string, unknown> | null;
    /** UI override layer */
    uiHint: Record<string, unknown> | null;
    /** Read-only */
    isReadOnly: boolean;
    /** Computed/derived */
    isComputed: boolean;
    /** Write-once (locked after creation) */
    writeOnce: boolean;
}

export interface ForeignKeyInfo {
    refSchema: string;
    refTable: string;
}

// ============================================================================
// Constants
// ============================================================================

const SYSTEM_COLUMNS = new Set([
    "id", "tenant_id", "realm_id",
    "created_at", "created_by", "updated_at", "updated_by",
    "deleted_at", "deleted_by", "version",
]);

const PG_TYPE_MAP: Record<string, string> = {
    // ── String types ──
    uuid: "uuid",
    text: "string",
    varchar: "string",
    char: "string",
    character: "string",
    bpchar: "string",
    "character varying": "string",

    // ── Integer types ──
    integer: "integer",
    int4: "integer",
    bigint: "integer",
    int8: "integer",
    smallint: "integer",
    int2: "integer",

    // ── Decimal/fixed-point types ──
    numeric: "decimal",
    decimal: "decimal",

    // ── Floating-point types (legacy "number") ──
    real: "number",
    float4: "number",
    "double precision": "number",
    float8: "number",

    // ── Boolean ──
    boolean: "boolean",
    bool: "boolean",

    // ── Date (date only, no time) ──
    date: "date",

    // ── Datetime (date + time) ──
    timestamp: "datetime",
    "timestamp with time zone": "datetime",
    "timestamp without time zone": "datetime",
    timestamptz: "datetime",

    // ── JSON ──
    jsonb: "json",
    json: "json",

    // ── Arrays ──
    "text[]": "string",

    // ── Enum (PostgreSQL user-defined types) ──
    "USER-DEFINED": "enum",
};

// ── Type category helpers ──
// Use these instead of direct === checks to handle the expanded type system.

/** Returns true for integer, decimal, number (any numeric data type) */
export function isNumericType(dataType: string): boolean {
    return dataType === "integer" || dataType === "decimal" || dataType === "number";
}

/** Returns true for date and datetime */
export function isDateLikeType(dataType: string): boolean {
    return dataType === "date" || dataType === "datetime";
}

// ============================================================================
// L1 Cache (10-minute TTL)
// ============================================================================

interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

const CACHE_TTL_MS = 600_000; // 10 minutes

const metaFieldsCache = new Map<string, CacheEntry<ServerFieldMeta[]>>();
const schemaColumnsCache = new Map<string, CacheEntry<ServerFieldMeta[]>>();
const fkMapCache = new Map<string, CacheEntry<Map<string, ForeignKeyInfo>>>();

// ============================================================================
// Meta Field Resolution (from meta.field)
// ============================================================================

/**
 * Query field metadata from meta.field for the latest published entity_version.
 * L1: per (tenantId:entityName), 10 min.  L2: per (tenantId:entityName:versionId), 24h.
 */
export async function getMetaFields(
    db: Kysely<any>,
    entityName: string,
    tenantId: string,
    metrics?: CacheMetrics,
): Promise<ServerFieldMeta[]> {
    // ── L1 check ──
    const l1Key = `${tenantId}:${entityName}`;
    const cached = metaFieldsCache.get(l1Key);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    // Find the latest published entity_version (needed for version-pinned L2 key)
    const versionResult = await sql<{ id: string }>`
        SELECT ev.id
        FROM meta.entity_version ev
        JOIN meta.entity e ON e.id = ev.entity_id AND e.tenant_id = ev.tenant_id
        WHERE e.name = ${entityName}
          AND e.tenant_id = ${tenantId}
          AND ev.status = 'published'
        ORDER BY ev.version_no DESC
        LIMIT 1
    `.execute(db);

    if (versionResult.rows.length === 0) {
        metaFieldsCache.set(l1Key, { data: [], expiresAt: Date.now() + CACHE_TTL_MS });
        return [];
    }

    const versionId = versionResult.rows[0].id;

    // ── L2 check ──
    try {
        const ns = await getNamespaceVersion();
        const redisKey = fieldsKey(ns, tenantId, entityName, versionId);
        const l2 = await cacheGet<ServerFieldMeta[]>(redisKey);
        if (l2) {
            metaFieldsCache.set(l1Key, { data: l2, expiresAt: Date.now() + CACHE_TTL_MS });
            if (metrics) metrics.fields = "hit";
            return l2;
        }
        if (metrics) metrics.fields = "miss";

        // Lock-lite: prevent cross-worker stampede
        const lockKey = `ep:lock:fields:${tenantId}:${entityName}:${versionId}`;
        const acquired = await acquireComputeLock(lockKey, 5);
        if (!acquired) {
            await waitForLock("fields");
            const retry = await cacheGet<ServerFieldMeta[]>(redisKey);
            if (retry) {
                metaFieldsCache.set(l1Key, { data: retry, expiresAt: Date.now() + CACHE_TTL_MS });
                return retry;
            }
        }
    } catch {
        if (metrics) metrics.redis_errors++;
    }

    // ── Compute from DB ──
    const fieldResult = await sql<{
        name: string;
        column_name: string | null;
        data_type: string;
        ui_type: string | null;
        is_required: boolean;
        is_searchable: boolean;
        is_filterable: boolean;
        sort_order: number;
        validation: Record<string, unknown> | null;
        lookup_config: Record<string, unknown> | null;
        format: string | null;
        unit: string | null;
        cardinality: string | null;
        origin: string | null;
        label: string | null;
        description: string | null;
        constraints: Record<string, unknown> | null;
        enum_config: Record<string, unknown> | null;
        reference_config: Record<string, unknown> | null;
        json_config: Record<string, unknown> | null;
        money_config: Record<string, unknown> | null;
        datetime_config: Record<string, unknown> | null;
        ui_hint: Record<string, unknown> | null;
        is_read_only: boolean;
        is_computed: boolean;
        write_once: boolean;
    }>`
        SELECT name, column_name, data_type, ui_type,
               is_required, is_searchable, is_filterable,
               sort_order, validation, lookup_config,
               format, unit, cardinality, origin, label, description,
               constraints, enum_config, reference_config, json_config,
               money_config, datetime_config, ui_hint,
               is_read_only, is_computed, write_once
        FROM meta.field
        WHERE entity_version_id = ${versionId}
          AND tenant_id = ${tenantId}
          AND is_active = true
        ORDER BY sort_order ASC, name ASC
    `.execute(db);

    const fields = fieldResult.rows
        .filter((r) => !SYSTEM_COLUMNS.has(r.column_name ?? r.name))
        .map((r) => ({
            name: r.name,
            columnName: r.column_name ?? r.name,
            // Normalize to logical types (same as getColumnsFromSchema) so downstream
            // code (buildFilterClauses, buildSearchClause) works consistently.
            dataType: PG_TYPE_MAP[r.data_type] ?? r.data_type,
            uiType: r.ui_type,
            isRequired: r.is_required,
            isSearchable: r.is_searchable,
            isFilterable: r.is_filterable,
            sortOrder: r.sort_order,
            validation: r.validation,
            lookupConfig: r.lookup_config,
            // ── New structured fields ──
            format: r.format,
            unit: r.unit,
            cardinality: r.cardinality ?? "one",
            origin: r.origin ?? "business",
            label: r.label,
            description: r.description,
            constraints: r.constraints,
            enumConfig: r.enum_config,
            referenceConfig: r.reference_config,
            jsonConfig: r.json_config,
            moneyConfig: r.money_config,
            datetimeConfig: r.datetime_config,
            uiHint: r.ui_hint,
            isReadOnly: r.is_read_only ?? false,
            isComputed: r.is_computed ?? false,
            writeOnce: r.write_once ?? false,
        }));

    // ── Write L1 + L2 ──
    metaFieldsCache.set(l1Key, { data: fields, expiresAt: Date.now() + CACHE_TTL_MS });

    try {
        const ns = await getNamespaceVersion();
        const bytes = await cacheSet(fieldsKey(ns, tenantId, entityName, versionId), fields, REDIS_TTL.entityFields);
        if (metrics) metrics.payload_bytes = Math.max(metrics.payload_bytes ?? 0, bytes);
    } catch {
        if (metrics) metrics.redis_errors++;
    }

    return fields;
}

// ============================================================================
// Information Schema Fallback
// ============================================================================

/**
 * Auto-detect columns from information_schema when meta.field is empty.
 * L1: per (schema.table), 10 min.  L2: per (schema.table), 24h.
 */
export async function getColumnsFromSchema(
    db: Kysely<any>,
    tableSchema: string,
    tableName: string,
    metrics?: CacheMetrics,
): Promise<ServerFieldMeta[]> {
    // ── L1 check ──
    const l1Key = `${tableSchema}.${tableName}`;
    const cached = schemaColumnsCache.get(l1Key);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    // ── L2 check ──
    try {
        const ns = await getNamespaceVersion();
        const redisKey = colsKey(ns, tableSchema, tableName);
        const l2 = await cacheGet<ServerFieldMeta[]>(redisKey);
        if (l2) {
            schemaColumnsCache.set(l1Key, { data: l2, expiresAt: Date.now() + CACHE_TTL_MS });
            if (metrics) metrics.cols = "hit";
            return l2;
        }
        if (metrics) metrics.cols = "miss";

        // Lock-lite
        const lockKey = `ep:lock:cols:${tableSchema}.${tableName}`;
        const acquired = await acquireComputeLock(lockKey, 10);
        if (!acquired) {
            await waitForLock("cols");
            const retry = await cacheGet<ServerFieldMeta[]>(redisKey);
            if (retry) {
                schemaColumnsCache.set(l1Key, { data: retry, expiresAt: Date.now() + CACHE_TTL_MS });
                return retry;
            }
        }
    } catch {
        if (metrics) metrics.redis_errors++;
    }

    // ── Compute from DB ──
    const result = await sql<{
        column_name: string;
        data_type: string;
        is_nullable: string;
        ordinal_position: number;
        udt_name: string;
    }>`
        SELECT column_name, data_type, is_nullable, ordinal_position, udt_name
        FROM information_schema.columns
        WHERE table_schema = ${tableSchema}
          AND table_name = ${tableName}
        ORDER BY ordinal_position ASC
    `.execute(db);

    const fields = result.rows
        .filter((r) => !SYSTEM_COLUMNS.has(r.column_name))
        .map((r) => ({
            name: r.column_name,
            columnName: r.column_name,
            dataType: PG_TYPE_MAP[r.data_type] ?? PG_TYPE_MAP[r.udt_name] ?? "string",
            uiType: null,
            isRequired: r.is_nullable === "NO",
            isSearchable: (PG_TYPE_MAP[r.data_type] ?? "string") === "string",
            isFilterable: false,
            sortOrder: r.ordinal_position,
            validation: null,
            lookupConfig: null,
            // ── New structured fields (defaults for info_schema fallback) ──
            format: null,
            unit: null,
            cardinality: "one" as const,
            origin: "business" as const,
            label: null,
            description: null,
            constraints: null,
            enumConfig: null,
            referenceConfig: null,
            jsonConfig: null,
            moneyConfig: null,
            datetimeConfig: null,
            uiHint: null,
            isReadOnly: false,
            isComputed: false,
            writeOnce: false,
        }));

    // ── Write L1 + L2 ──
    schemaColumnsCache.set(l1Key, { data: fields, expiresAt: Date.now() + CACHE_TTL_MS });

    try {
        const ns = await getNamespaceVersion();
        const bytes = await cacheSet(colsKey(ns, tableSchema, tableName), fields, REDIS_TTL.schemaColumns);
        if (metrics) metrics.payload_bytes = Math.max(metrics.payload_bytes ?? 0, bytes);
    } catch {
        if (metrics) metrics.redis_errors++;
    }

    return fields;
}

// ============================================================================
// FK Detection (auto-detect foreign key constraints)
// ============================================================================

/**
 * Detect FK constraints from information_schema.
 * L1: per (schema.table), 10 min.  L2: per (schema.table), 24h.
 * Skips system FK columns (tenant_id, realm_id).
 */
export async function getForeignKeyMap(
    db: Kysely<any>,
    tableSchema: string,
    tableName: string,
    metrics?: CacheMetrics,
): Promise<Map<string, ForeignKeyInfo>> {
    // ── L1 check ──
    const l1Key = `${tableSchema}.${tableName}`;
    const cached = fkMapCache.get(l1Key);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    // ── L2 check (Map stored as Record for JSON serialization) ──
    try {
        const ns = await getNamespaceVersion();
        const redisKey = fkMapKey(ns, tableSchema, tableName);
        const l2 = await cacheGet<Record<string, ForeignKeyInfo>>(redisKey);
        if (l2) {
            const map = new Map(Object.entries(l2));
            fkMapCache.set(l1Key, { data: map, expiresAt: Date.now() + CACHE_TTL_MS });
            if (metrics) metrics.fkmap = "hit";
            return map;
        }
        if (metrics) metrics.fkmap = "miss";

        // Lock-lite
        const lockKey = `ep:lock:fkmap:${tableSchema}.${tableName}`;
        const acquired = await acquireComputeLock(lockKey, 10);
        if (!acquired) {
            await waitForLock("fkmap");
            const retry = await cacheGet<Record<string, ForeignKeyInfo>>(redisKey);
            if (retry) {
                const map = new Map(Object.entries(retry));
                fkMapCache.set(l1Key, { data: map, expiresAt: Date.now() + CACHE_TTL_MS });
                return map;
            }
        }
    } catch {
        if (metrics) metrics.redis_errors++;
    }
    }

    // ── Compute from DB ──
    const result = await sql<{
        column_name: string;
        ref_schema: string;
        ref_table: string;
    }>`
        SELECT kcu.column_name,
               ccu.table_schema AS ref_schema,
               ccu.table_name   AS ref_table
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.constraint_schema = kcu.constraint_schema
        JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
            AND tc.constraint_schema = ccu.constraint_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = ${tableSchema}
          AND tc.table_name = ${tableName}
    `.execute(db);

    const map = new Map<string, ForeignKeyInfo>();
    for (const row of result.rows) {
        if (SYSTEM_COLUMNS.has(row.column_name)) continue;
        map.set(row.column_name, {
            refSchema: row.ref_schema,
            refTable: row.ref_table,
        });
    }

    // ── Write L1 + L2 ──
    fkMapCache.set(l1Key, { data: map, expiresAt: Date.now() + CACHE_TTL_MS });

    try {
        const ns = await getNamespaceVersion();
        const bytes = await cacheSet(
            fkMapKey(ns, tableSchema, tableName),
            Object.fromEntries(map),
            REDIS_TTL.fkMap,
        );
        if (metrics) metrics.payload_bytes = Math.max(metrics.payload_bytes ?? 0, bytes);
    } catch {
        if (metrics) metrics.redis_errors++;
    }

    return map;
}

// ============================================================================
// Combined Field Resolution (with FK enrichment)
// ============================================================================

/**
 * Resolve fields for an entity with FK lookup enrichment.
 * Tries meta.field first, falls back to information_schema.
 *
 * FK detection priority:
 *   1. lookupConfig (explicit from meta.field) — authoritative
 *   2. DB constraints (fallback) — only for fields without lookupConfig
 */
export async function resolveFieldsWithFKs(
    db: Kysely<any>,
    entityName: string,
    tenantId: string,
    tableSchema: string,
    tableName: string,
    metrics?: CacheMetrics,
): Promise<ServerFieldMeta[]> {
    // Try meta.field first
    let fields = await getMetaFields(db, entityName, tenantId, metrics);

    // Fallback to information_schema
    if (fields.length === 0) {
        fields = await getColumnsFromSchema(db, tableSchema, tableName, metrics);
    }

    // Enrich with FK lookups — DB constraints fill gaps
    const fkMap = await getForeignKeyMap(db, tableSchema, tableName, metrics);
    if (fkMap.size > 0) {
        fields = fields.map((f) => {
            const fk = fkMap.get(f.columnName);
            if (!fk) return f;

            if (f.lookupConfig) {
                // Existing lookupConfig takes priority, but merge in refSchema/refTable
                // from DB constraints so useReferenceResolver can always find the target.
                const lc = f.lookupConfig as Record<string, unknown>;
                if (!lc.refSchema || !lc.refTable) {
                    return {
                        ...f,
                        lookupConfig: { ...lc, refSchema: fk.refSchema, refTable: fk.refTable },
                    };
                }
                return f;
            }

            return {
                ...f,
                lookupConfig: { refSchema: fk.refSchema, refTable: fk.refTable },
            };
        });
    }

    // ── Normalize legacy data into canonical structs (single normalization point) ──
    fields = fields.map(normalizeFieldMeta);

    return fields;
}

// ============================================================================
// Legacy Normalization
// ============================================================================

/**
 * Canonical normalization: synthesizes new structured fields from legacy data.
 * This is the ONLY place that reads legacy validation/lookupConfig JSONB.
 * After this function, downstream code uses canonical fields exclusively.
 */
function normalizeFieldMeta(field: ServerFieldMeta): ServerFieldMeta {
    const v = field.validation as Record<string, unknown> | null;
    const lc = field.lookupConfig as Record<string, unknown> | null;

    let result = field;

    // ── Derive origin from system columns ──
    if (field.origin === "business" && SYSTEM_COLUMNS.has(field.columnName)) {
        result = { ...result, origin: "system" };
    }

    // ── Synthesize enumConfig from legacy validation ──
    if (!field.enumConfig && v) {
        const rawValues = (v.enumValues ?? v.options ?? v.allowedValues) as string[] | undefined;
        if (rawValues && Array.isArray(rawValues) && rawValues.length > 0) {
            result = {
                ...result,
                enumConfig: {
                    values: rawValues.map((val: string) => ({ value: val })),
                    source: "static",
                },
            };
        }
    }

    // ── Synthesize referenceConfig from legacy lookupConfig ──
    if (!field.referenceConfig && lc) {
        result = {
            ...result,
            referenceConfig: {
                entity: (lc.targetEntity ?? lc.refTable ?? "") as string,
                refSchema: lc.refSchema as string | undefined,
                refTable: lc.refTable as string | undefined,
                displayField: lc.displayField as string | undefined,
                valueField: (lc.targetKey as string) ?? "id",
            },
        };
    }

    // ── Promote UUID → reference when FK metadata exists ──
    // A uuid column with a foreign key IS a reference field in the logical type system.
    // After this, autoDetect correctly routes to reference-picker instead of uuid-view.
    if (result.dataType === "uuid" && (result.referenceConfig || result.lookupConfig)) {
        result = { ...result, dataType: "reference" };
    }

    // ── Synthesize uiHint from legacy validation.ui ──
    if (!field.uiHint && v?.ui) {
        result = { ...result, uiHint: v.ui as Record<string, unknown> };
    }

    // ── Synthesize constraints from legacy validation ──
    if (!field.constraints && v) {
        const constraints: Record<string, unknown> = {};
        if (v.minLength != null) constraints.minLength = v.minLength;
        if (v.maxLength != null) constraints.maxLength = v.maxLength;
        if (v.min != null) constraints.min = v.min;
        if (v.max != null) constraints.max = v.max;
        if (v.pattern != null) constraints.pattern = v.pattern;
        if (v.precision != null) constraints.precision = v.precision;
        if (v.scale != null) constraints.scale = v.scale;
        if (Object.keys(constraints).length > 0) {
            constraints.required = field.isRequired || undefined;
            constraints.nullable = !field.isRequired || undefined;
            result = { ...result, constraints };
        }
    }

    return result;
}

// ============================================================================
// Cache Invalidation
// ============================================================================

/**
 * Invalidate entity meta field caches.
 * Clears L1 in-process caches directly, and bumps namespace version for L2.
 */
export async function invalidateMetaFieldsCache(entityName?: string, tenantId?: string): Promise<void> {
    if (entityName && tenantId) {
        metaFieldsCache.delete(`${tenantId}:${entityName}`);
    } else {
        metaFieldsCache.clear();
    }
    schemaColumnsCache.clear();
    fkMapCache.clear();
    await bumpNamespaceVersion();
}
