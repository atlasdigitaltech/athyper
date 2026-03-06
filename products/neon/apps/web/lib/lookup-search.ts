/**
 * Lookup Search Engine
 *
 * Server-side search utility for reference field typeahead.
 * Builds relevance-ranked SQL queries using the resolved LookupProfile
 * merged with target entity IdentityConfig.
 *
 * Search ranking tiers:
 *   Tier 1: exact match on code field (weight * 1000)
 *   Tier 2: prefix match on code field (weight * 100)
 *   Tier 3: prefix match on name field (weight * 10)
 *   Tier 4: contains match (weight * 1)
 */

import "server-only";

import { sql, type Kysely, type RawBuilder } from "kysely";

import type { EntityTableMeta } from "@/lib/entity-meta";
import { renderDisplayLabel } from "@/lib/entity-display-policy";
import { tableHasColumn } from "@/lib/db";

// ============================================================================
// Types
// ============================================================================

export interface LookupSearchParams {
    query: string;
    limit: number;
    cursor?: string;
    context: "create" | "edit" | "view";
    filters?: Record<string, unknown>;
    fields?: string[];
    /** Per-field lookup profile — merged over identityConfig when present */
    lookupProfile?: RawLookupProfile;
}

export interface LookupItem {
    id: string;
    label: string;
    sublabel?: string;
    tokens?: string[];
    meta?: Record<string, unknown>;
}

export interface LookupSearchResult {
    items: LookupItem[];
    nextCursor?: string;
}

/** Raw lookup_profile JSONB shape from meta.field */
export interface RawLookupProfile {
    displayTemplate?: string;
    searchFields?: Array<{
        field: string;
        weight?: number;
        matchModes?: string[];
    }>;
    matchMode?: string;
    filters?: Record<string, unknown>;
    filtersByContext?: Record<string, Record<string, unknown>>;
    orderBy?: string;
    minChars?: number;
    debounceMs?: number;
    pageSize?: number;
    cacheMode?: string;
    securityScope?: string;
}

interface SearchFieldDef {
    field: string;
    weight: number;
}

// ============================================================================
// Default Search Fields
// ============================================================================

const HEURISTIC_SEARCH_FIELDS = ["code", "name", "title", "label", "display_name"];

// ============================================================================
// Search Engine
// ============================================================================

/**
 * Execute a lookup search against a target entity table.
 *
 * @param db - Kysely database instance
 * @param entityMeta - Resolved target entity metadata (from resolveEntityMeta)
 * @param tenantUuid - Tenant UUID
 * @param params - Search parameters (query, limit, context, etc.)
 */
export async function executeLookupSearch(
    db: Kysely<any>,
    entityMeta: EntityTableMeta,
    tenantUuid: string,
    params: LookupSearchParams,
): Promise<LookupSearchResult> {
    const { query, limit, context, filters, lookupProfile: profile } = params;
    const { tableSchema, tableName, identityConfig } = entityMeta;
    const fullTable = `${tableSchema}.${tableName}`;

    // ── Resolve search fields: profile.searchFields > identityConfig > heuristic ──
    const searchFields = resolveSearchFields(entityMeta, profile);
    if (searchFields.length === 0) {
        return { items: [] };
    }

    // ── Resolve display columns ──
    const ic = identityConfig as Record<string, unknown> | null;
    const displayTemplate = profile?.displayTemplate
        ?? (ic?.displayTemplate as string | undefined);
    const primaryLabelField = (ic?.primaryLabelField as string) ?? searchFields[0]?.field ?? "name";
    const primaryCodeField = ic?.primaryCodeField as string | undefined;

    // Collect all columns we need to SELECT
    const displayCols = new Set(["id", primaryLabelField]);
    if (primaryCodeField) displayCols.add(primaryCodeField);
    for (const sf of searchFields) displayCols.add(sf.field);
    if (params.fields) params.fields.forEach((f) => displayCols.add(f));

    // Extract template tokens if display template is provided
    if (displayTemplate) {
        const tokens = displayTemplate.match(/\{\{([a-zA-Z0-9_]+)\}\}/g) ?? [];
        for (const token of tokens) {
            displayCols.add(token.replace(/\{\{|\}\}/g, ""));
        }
    }

    // Verify columns exist on the table
    const colResult = await sql<{ column_name: string }>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = ${tableSchema}
          AND table_name = ${tableName}
    `.execute(db);
    const availableCols = new Set(colResult.rows.map((r) => r.column_name));

    // Filter to only existing columns
    const selectCols = [...displayCols].filter((c) => availableCols.has(c));
    const validSearchFields = searchFields.filter((sf) => availableCols.has(sf.field));

    if (validSearchFields.length === 0 || selectCols.length === 0) {
        return { items: [] };
    }

    // ── Build search clauses with relevance scoring ──
    const normalizedQuery = query.toLowerCase().trim();
    const searchClauses: RawBuilder<unknown>[] = [];
    const relevanceCases: string[] = [];

    for (const sf of validSearchFields) {
        const fieldRef = sql.ref(sf.field);

        // OR chain: any field can match
        searchClauses.push(
            sql`lower(${fieldRef}::text) LIKE ${normalizedQuery + "%"}`,
        );
        searchClauses.push(
            sql`lower(${fieldRef}::text) LIKE ${"%" + normalizedQuery + "%"}`,
        );

        // Relevance scoring tiers
        relevanceCases.push(
            `WHEN lower(${sf.field}::text) = '${escapeSqlString(normalizedQuery)}' THEN ${sf.weight * 1000}`,
        );
        relevanceCases.push(
            `WHEN lower(${sf.field}::text) LIKE '${escapeSqlString(normalizedQuery)}%' THEN ${sf.weight * 100}`,
        );
        relevanceCases.push(
            `WHEN lower(${sf.field}::text) LIKE '%${escapeSqlString(normalizedQuery)}%' THEN ${sf.weight * 1}`,
        );
    }

    const searchCondition = sql.join(searchClauses, sql` OR `);
    const relevanceExpr = sql.raw(`CASE ${relevanceCases.join(" ")} ELSE 0 END`);
    const selectExpr = sql.join(selectCols.map((c) => sql.ref(c)));

    // ── Context-aware filters ──
    const contextFilters: RawBuilder<unknown>[] = [];

    // Tenant scoping
    const hasTenant = await tableHasColumn(db, tableSchema, tableName, "tenant_id");
    if (hasTenant) {
        contextFilters.push(sql`tenant_id = ${tenantUuid}`);
    }

    // Profile static filters (always applied)
    if (profile?.filters) {
        for (const [key, value] of Object.entries(profile.filters)) {
            if (availableCols.has(key) && value !== undefined && value !== null) {
                contextFilters.push(sql`${sql.ref(key)} = ${value as any}`);
            }
        }
    }

    // Context-aware filters from profile, with fallback to default is_active logic
    const profileContextFilters = profile?.filtersByContext?.[context];
    if (profileContextFilters) {
        for (const [key, value] of Object.entries(profileContextFilters)) {
            if (availableCols.has(key) && value !== undefined && value !== null) {
                contextFilters.push(sql`${sql.ref(key)} = ${value as any}`);
            }
        }
    } else if (context === "create" && availableCols.has("is_active")) {
        // Default: filter inactive records for create context when no profile filters exist
        contextFilters.push(sql`is_active = true`);
    }

    // User-supplied filters (from query params, validated)
    if (filters) {
        for (const [key, value] of Object.entries(filters)) {
            if (availableCols.has(key) && value !== undefined && value !== null) {
                contextFilters.push(sql`${sql.ref(key)} = ${value as any}`);
            }
        }
    }

    // ── Build and execute query ──
    const whereFilters = contextFilters.length > 0
        ? sql` AND ${sql.join(contextFilters, sql` AND `)}`
        : sql``;

    const fetchLimit = Math.min(limit, 100) + 1; // +1 for cursor detection

    // ── Resolve secondary sort ──
    let secondarySort: RawBuilder<unknown>;
    if (profile?.orderBy) {
        const desc = profile.orderBy.startsWith("-");
        const col = desc ? profile.orderBy.slice(1) : profile.orderBy;
        if (availableCols.has(col)) {
            secondarySort = desc
                ? sql`${sql.ref(col)} DESC`
                : sql`${sql.ref(col)} ASC`;
        } else {
            secondarySort = sql`${sql.ref(primaryCodeField ?? primaryLabelField)} ASC`;
        }
    } else {
        secondarySort = sql`${sql.ref(primaryCodeField ?? primaryLabelField)} ASC`;
    }

    const rows = await sql<Record<string, unknown>>`
        SELECT ${selectExpr}, ${relevanceExpr} AS _relevance
        FROM ${sql.table(fullTable)}
        WHERE (${searchCondition})
          ${whereFilters}
        ORDER BY _relevance DESC, ${secondarySort}
        LIMIT ${fetchLimit}
    `.execute(db);

    // ── Build result items ──
    const hasMore = rows.rows.length > limit;
    const resultRows = hasMore ? rows.rows.slice(0, limit) : rows.rows;

    const items: LookupItem[] = resultRows.map((row) => {
        const id = String(row.id);

        // Build label
        let label: string;
        if (displayTemplate) {
            label = renderDisplayLabel(displayTemplate, row) || id;
        } else {
            // Default: "code — name" or just the primary field
            const parts: string[] = [];
            if (primaryCodeField && row[primaryCodeField]) parts.push(String(row[primaryCodeField]));
            if (row[primaryLabelField]) parts.push(String(row[primaryLabelField]));
            label = parts.join(" \u2014 ") || id;
        }

        // Build sublabel (secondary info not in label)
        let sublabel: string | undefined;
        if (primaryCodeField && row[primaryCodeField] && row[primaryLabelField]) {
            // If we have both code and name, sublabel is whichever isn't primary
            if (displayTemplate) {
                // Template handles label, sublabel is the code or name
                sublabel = String(row[primaryCodeField]);
            }
        }

        // Matched tokens for highlight
        const tokens = validSearchFields
            .filter((sf) => {
                const val = row[sf.field];
                return val != null && String(val).toLowerCase().includes(normalizedQuery);
            })
            .map((sf) => sf.field);

        // Extra metadata fields
        let meta: Record<string, unknown> | undefined;
        if (params.fields && params.fields.length > 0) {
            meta = {};
            for (const f of params.fields) {
                if (row[f] !== undefined) meta[f] = row[f];
            }
        }

        return { id, label, sublabel, tokens, meta };
    });

    return {
        items,
        nextCursor: hasMore ? String(resultRows.length) : undefined,
    };
}

// ============================================================================
// Server-side Profile Resolution
// ============================================================================

/**
 * Load a field's lookup_profile directly from the database.
 * This is the server-authoritative path — the client sends only
 * sourceEntity + fieldName, and the server resolves the compiled profile.
 *
 * Returns null if the field has no lookup_profile.
 */
export async function resolveServerLookupProfile(
    db: Kysely<any>,
    sourceEntity: string,
    fieldName: string,
    tenantId: string,
): Promise<RawLookupProfile | null> {
    const result = await sql<{ lookup_profile: RawLookupProfile | null }>`
        SELECT f.lookup_profile
        FROM meta.field f
        JOIN meta.entity_version ev ON ev.id = f.entity_version_id AND ev.tenant_id = f.tenant_id
        JOIN meta.entity e ON e.id = ev.entity_id AND e.tenant_id = ev.tenant_id
        WHERE e.name = ${sourceEntity}
          AND e.tenant_id = ${tenantId}
          AND e.is_active = true
          AND ev.status = 'published'
          AND f.name = ${fieldName}
          AND f.tenant_id = ${tenantId}
          AND f.is_active = true
        ORDER BY ev.version_no DESC
        LIMIT 1
    `.execute(db);

    return result.rows[0]?.lookup_profile ?? null;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Resolve search fields by merging lookupProfile > identityConfig > heuristic.
 *
 * When a lookupProfile has searchFields, those take priority. identityConfig
 * fields are merged in as fallbacks (lower weight) unless already present
 * by field name. If neither exists, heuristic column name matching is used.
 */
function resolveSearchFields(
    entityMeta: EntityTableMeta,
    profile?: RawLookupProfile,
): SearchFieldDef[] {
    const merged = new Map<string, SearchFieldDef>();

    // Layer 1 (highest priority): lookupProfile.searchFields
    if (profile?.searchFields && profile.searchFields.length > 0) {
        for (const sf of profile.searchFields) {
            merged.set(sf.field, { field: sf.field, weight: sf.weight ?? 1 });
        }
    }

    // Layer 2: identityConfig fields (fill gaps only)
    const ic = entityMeta.identityConfig as Record<string, unknown> | null;
    if (ic) {
        if (ic.primaryCodeField && !merged.has(ic.primaryCodeField as string)) {
            merged.set(ic.primaryCodeField as string, {
                field: ic.primaryCodeField as string,
                weight: 10,
            });
        }
        if (ic.primaryLabelField && !merged.has(ic.primaryLabelField as string)) {
            merged.set(ic.primaryLabelField as string, {
                field: ic.primaryLabelField as string,
                weight: 5,
            });
        }
        if (ic.alternateKeys && Array.isArray(ic.alternateKeys)) {
            for (const key of ic.alternateKeys as string[]) {
                if (!merged.has(key)) {
                    merged.set(key, { field: key, weight: 3 });
                }
            }
        }
    }

    if (merged.size > 0) {
        // Return sorted by weight descending for consistent relevance scoring
        return [...merged.values()].sort((a, b) => b.weight - a.weight);
    }

    // Layer 3: Heuristic fallback
    return HEURISTIC_SEARCH_FIELDS.map((f, i) => ({
        field: f,
        weight: HEURISTIC_SEARCH_FIELDS.length - i,
    }));
}

/**
 * Escape a string for use in SQL LIKE patterns.
 * Prevents SQL injection in dynamically constructed CASE expressions.
 */
function escapeSqlString(str: string): string {
    return str.replace(/'/g, "''").replace(/\\/g, "\\\\");
}
