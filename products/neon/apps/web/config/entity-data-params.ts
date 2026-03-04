import "server-only";

/**
 * Entity Data Pipeline — System Parameters
 *
 * Central Zod-validated configuration for pagination, search, filtering,
 * query caching, FK resolution, and graceful-degradation defaults.
 *
 * Override at runtime via the `ENTITY_DATA_PARAMS` environment variable
 * (JSON string). Any omitted keys use the schema defaults.
 */

import { z } from "zod";

// ============================================================================
// Schema
// ============================================================================

export const EntityDataParamsSchema = z.object({
    /** Pagination defaults */
    pagination: z.object({
        /** Default page size for server-side queries */
        defaultPageSize: z.number().int().positive().default(25),
        /** Absolute maximum rows per page (hard cap) */
        maxPageSize: z.number().int().positive().default(1000),
        /** Page size options exposed in the UI footer */
        allowedPageSizes: z.array(z.number().int().positive()).default([10, 25, 50, 100]),
    }).default({}),

    /** Server-side search */
    search: z.object({
        /** Minimum characters before server-side ILIKE search triggers */
        minLength: z.number().int().min(0).default(2),
        /** Client-side debounce interval (ms) before sending server query */
        debounceMs: z.number().int().positive().default(250),
        /** Maximum columns included in the ILIKE OR clause */
        maxSearchColumns: z.number().int().positive().default(10),
    }).default({}),

    /** Server-side filtering */
    filter: z.object({
        /** Max simultaneous filter WHERE clauses per request */
        maxFilterClauses: z.number().int().positive().default(20),
        /** Max character length for a single filter value */
        maxFilterValueLength: z.number().int().positive().default(500),
    }).default({}),

    /** Redis query result cache */
    queryCache: z.object({
        /** Enable/disable query result caching entirely */
        enabled: z.boolean().default(true),
        /** TTL in seconds for cached query result pages (default / transactional) */
        ttlSeconds: z.number().int().positive().default(120),
        /** TTL in seconds for cached COUNT results (longer — counts change less often) */
        countTtlSeconds: z.number().int().positive().default(300),
        /** Hard payload guard — skip caching if response exceeds this */
        maxPayloadBytes: z.number().int().positive().default(524_288),
        /** Per-category TTLs: entity metadata featureFlags.cacheCategory selects category */
        categoryTtls: z.object({
            /** Reference data (countries, currencies, UOM) — changes rarely */
            reference: z.number().int().positive().default(1800),
            /** Master data (accounts, products) — moderate change frequency */
            master: z.number().int().positive().default(300),
            /** Transactional data (orders, invoices) — default */
            transactional: z.number().int().positive().default(120),
        }).default({}),
        /** SWR soft TTL ratio (0-1): serve stale cache but trigger background recompute */
        swrRatio: z.number().min(0).max(1).default(0.5),
    }).default({}),

    /** FK resolution caps (also used by entity-projection) */
    fkResolution: z.object({
        /** Max unique UUIDs per FK column */
        perColumnCap: z.number().int().positive().default(200),
        /** Max total UUIDs across all FK columns in a single request */
        perRequestCap: z.number().int().positive().default(600),
        /** Timeout budget for FK resolution (ms) */
        timeoutMs: z.number().int().positive().default(250),
    }).default({}),

    /** Client-side fallback behavior */
    fallback: z.object({
        /** Page size when falling back to client-side filtering */
        clientFallbackPageSize: z.number().int().positive().default(1000),
        /** Timeout (ms) before treating the server request as failed */
        serverTimeoutMs: z.number().int().positive().default(5000),
    }).default({}),
});

export type EntityDataParams = z.infer<typeof EntityDataParamsSchema>;

// ============================================================================
// Singleton
// ============================================================================

let _params: EntityDataParams | null = null;

/**
 * Get the parsed entity data params.
 * First call parses from env (if set) and caches.
 */
export function getEntityDataParams(): EntityDataParams {
    if (_params) return _params;

    const envOverride = process.env.ENTITY_DATA_PARAMS;
    const raw = envOverride ? JSON.parse(envOverride) : {};
    _params = EntityDataParamsSchema.parse(raw);
    return _params;
}
